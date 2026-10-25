import type { MarketOrderRequest, MarketOrderResult } from "@switchboard/contracts";
import { EXECUTION_FLOW } from "./book.js";
import type { Clock } from "./clock.js";
import type { AppConfig } from "./config.js";
import { ApiException } from "./errors.js";
import type { ExecutionClaims } from "./executionAuth.js";
import { D, money } from "./money.js";
import type { MemoryStore } from "./store.js";
import { assertExact, assertMoney, assertString } from "./validate.js";

export function parseMarketOrder(body: unknown): MarketOrderRequest {
  const record = assertExact(body, ["approvalId", "planHash", "quoteId", "side", "quantity", "limitPriceUsd", "clientOrderId"]);
  const side = assertString(record, "side");
  if (side !== "BUY" && side !== "SELL") throw new ApiException(400, "BAD_REQUEST", "side must be BUY or SELL");
  const quantity = assertMoney(record, "quantity");
  const limitPriceUsd = assertMoney(record, "limitPriceUsd");
  if (D(quantity).lte(0) || D(limitPriceUsd).lte(0)) throw new ApiException(400, "BAD_REQUEST", "quantity and limitPriceUsd must be positive");
  return {
    approvalId: assertString(record, "approvalId"),
    planHash: assertString(record, "planHash"),
    quoteId: assertString(record, "quoteId"),
    side,
    quantity,
    limitPriceUsd,
    clientOrderId: assertString(record, "clientOrderId"),
  };
}

export function placeMarketOrder(args: {
  order: MarketOrderRequest;
  claims: ExecutionClaims;
  store: MemoryStore;
  clock: Clock;
  config: AppConfig;
}): MarketOrderResult {
  const { order, claims, store, clock, config } = args;
  const fingerprint = [order.approvalId, order.planHash, order.quoteId, order.side, order.quantity, order.limitPriceUsd].join("|");
  const existing = store.marketOrders.get(order.clientOrderId);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw new ApiException(409, "CLIENT_ORDER_CONFLICT", "clientOrderId was already used with different terms");
    }
    return existing.result;
  }

  assertClaimsFit(order, claims);

  const stored = store.quotes.get(order.quoteId);
  if (!stored) throw new ApiException(404, "QUOTE_NOT_FOUND", "Unknown quoteId");
  const quote = stored.quote;
  if (claims.instrumentId !== quote.instrument.instrumentId) {
    throw new ApiException(403, "CLAIM_MISMATCH", "instrumentId claim does not match the quote", false, { field: "instrumentId" });
  }
  if (claims.venue !== quote.venue) {
    throw new ApiException(403, "CLAIM_MISMATCH", "venue claim does not match the quote", false, { field: "venue" });
  }

  const now = clock.now().getTime();
  if (now >= Date.parse(quote.expiresAt)) {
    throw new ApiException(409, "QUOTE_EXPIRED", "Quote is stale and cannot be executed");
  }

  if (claims.mode === "live" && !config.allowLive) {
    throw new ApiException(403, "LIVE_MODE_DISABLED", "Live execution mode is disabled");
  }
  if (claims.mode === "live") {
    throw new ApiException(403, "NO_LIVE_VENUE", "No live venue is connected. Live orders are rejected.");
  }
  if (quote.capability === "live") {
    throw new ApiException(403, "SANDBOX_CANNOT_AUTHORIZE_LIVE", "A sandbox authorization cannot authorize a live-capability quote");
  }
  if (quote.venue === "polymarket_international") {
    throw new ApiException(403, "REFERENCE_ONLY", "Polymarket International is reference-only and cannot be executed from this service");
  }
  if (quote.venue === "kalshi" || quote.venue === "polymarket_us") {
    throw new ApiException(403, "VENUE_NOT_EXECUTABLE", "Kalshi and Polymarket US orders are refused. This service will not invent a live fill.");
  }
  if (quote.venue !== "switchboard" || quote.capability !== "sandbox") {
    throw new ApiException(403, "NOT_EXECUTABLE", "Quote is not an executable Switchboard sandbox quote");
  }
  if (!stored.executable) {
    throw new ApiException(409, "INSUFFICIENT_DEPTH", "Quote depth does not cover the requested size; order was not stored");
  }
  if (D(order.quantity).gt(D(quote.requestedQuantity)) && stored.mode === "book") {
    // The quote was priced for its requested size. A larger order is a different risk.
    throw new ApiException(409, "INSUFFICIENT_DEPTH", "Order quantity exceeds the quoted size");
  }

  let result: MarketOrderResult;
  if (stored.mode === "snapshot") {
    if (D(order.quantity).gt(stored.snapshotRemaining)) {
      throw new ApiException(409, "INSUFFICIENT_DEPTH", "Snapshot depth does not cover the order");
    }
    const px = order.side === "BUY" ? D(quote.askUsd) : D(quote.bidUsd);
    if (order.side === "BUY" && D(order.limitPriceUsd).lt(px)) {
      throw new ApiException(409, "PRICE_LIMIT", "Buy limit is below the snapshot ask");
    }
    if (order.side === "SELL" && D(order.limitPriceUsd).gt(px)) {
      throw new ApiException(409, "PRICE_LIMIT", "Sell limit is above the snapshot bid");
    }
    stored.snapshotRemaining = stored.snapshotRemaining.sub(D(order.quantity));
    result = {
      clientOrderId: order.clientOrderId,
      venueOrderId: store.nextId("mo"),
      status: "SIMULATED",
      filledQuantity: money(D(order.quantity)),
      averageFillPriceUsd: money(px),
      syntheticDemo: true,
    };
  } else {
    const filled = store.book.place({
      makerId: EXECUTION_FLOW,
      instrumentId: quote.instrument.instrumentId,
      side: order.side,
      priceUsd: order.limitPriceUsd,
      quantity: order.quantity,
      nonce: `exec_${order.clientOrderId}_${claims.jti}`,
      goodTil: quote.expiresAt,
      clientOrderId: `mkt_${order.clientOrderId}`,
      nowMs: now,
      timeInForce: "FOK",
    });
    result = {
      clientOrderId: order.clientOrderId,
      venueOrderId: filled.venueOrderId,
      status: "SIMULATED",
      filledQuantity: filled.filledQuantity,
      averageFillPriceUsd: filled.averageFillPriceUsd,
      syntheticDemo: true,
    };
  }

  if (result.status === "FILLED" && result.syntheticDemo === false) {
    throw new Error("refusing FILLED with syntheticDemo false");
  }
  if (result.status === "SIMULATED") result.syntheticDemo = true;
  store.marketOrders.set(order.clientOrderId, { fingerprint, result });
  return result;
}

function assertClaimsFit(order: MarketOrderRequest, claims: ExecutionClaims): void {
  if (claims.sub !== order.approvalId) mismatch("approvalId");
  if (claims.planHash !== order.planHash) mismatch("planHash");
  if (claims.quoteId !== order.quoteId) mismatch("quoteId");
  if (claims.side !== order.side) mismatch("side");
  if (D(order.quantity).gt(D(claims.maxQuantity))) mismatch("quantity");
  if (order.side === "BUY" && D(order.limitPriceUsd).gt(D(claims.maxPriceUsd))) mismatch("limitPriceUsd");
  const notional = D(order.quantity).mul(D(order.limitPriceUsd));
  if (notional.gt(D(claims.maxSpendUsd))) mismatch("maxSpendUsd");
}

function mismatch(field: string): never {
  throw new ApiException(403, "CLAIM_MISMATCH", `Order does not fit the execution authorization (${field})`, false, { field });
}
