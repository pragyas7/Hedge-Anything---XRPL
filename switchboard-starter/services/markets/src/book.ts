import type { MarketOrderResult, OrderbookLevel } from "@switchboard/contracts";
import { Decimal } from "decimal.js";
import { ApiException } from "./errors.js";
import { D, money } from "./money.js";

export const LIQUIDITY_MAKER = "sandbox-liquidity";
export const EXECUTION_FLOW = "execution-flow";

export interface PlaceOrderInput {
  makerId: string;
  instrumentId: string;
  side: "BUY" | "SELL";
  priceUsd: string;
  quantity: string;
  nonce: string;
  goodTil: string;
  clientOrderId: string;
  nowMs: number;
  timeInForce?: "GTC" | "FOK";
}

interface Account {
  free: Decimal;
  locked: Decimal;
}

interface RestingOrder {
  orderId: string;
  clientOrderId: string;
  makerId: string;
  instrumentId: string;
  side: "BUY" | "SELL";
  price: Decimal;
  quantity: Decimal;
  remaining: Decimal;
  filled: Decimal;
  notional: Decimal;
  nonce: string;
  goodTil: string;
  placedAtMs: number;
  sequence: number;
  locked: Decimal;
  status: MarketOrderResult["status"];
  fingerprint: string;
}

export interface BookSnapshot {
  accounts: { id: string; free: string; locked: string }[];
  open: { clientOrderId: string; makerId: string; side: string; price: string; remaining: string; filled: string; sequence: number }[];
}

/**
 * In-memory price-time CLOB.
 * Sellers lock quantity * max payout before the order is accepted.
 * Buyers lock quantity * limit price. A maker never matches their own resting order.
 */
export class OrderBook {
  private accounts = new Map<string, Account>();
  private orders: RestingOrder[] = [];
  private byClient = new Map<string, RestingOrder>();
  private nonces = new Set<string>();
  private sequence = 0;
  private orderNumber = 0;

  constructor(
    private readonly payoutPerUnit: (instrumentId: string) => Decimal | undefined,
    private readonly endowmentFor: (makerId: string) => Decimal,
  ) {}

  snapshot(): BookSnapshot {
    return {
      accounts: [...this.accounts.entries()].map(([id, account]) => ({
        id,
        free: money(account.free),
        locked: money(account.locked),
      })),
      open: this.orders
        .filter((order) => order.remaining.gt(0))
        .map((order) => ({
          clientOrderId: order.clientOrderId,
          makerId: order.makerId,
          side: order.side,
          price: money(order.price),
          remaining: money(order.remaining),
          filled: money(order.filled),
          sequence: order.sequence,
        })),
    };
  }

  levels(instrumentId: string, nowMs: number): { bids: OrderbookLevel[]; asks: OrderbookLevel[] } {
    this.sweepExpired(nowMs);
    return {
      bids: this.aggregate(instrumentId, "BUY", true),
      asks: this.aggregate(instrumentId, "SELL", false),
    };
  }

  /** Paper collateral lock used by RFQ quotes. Rejects with no state change when short. */
  lockFunds(makerId: string, amount: Decimal): void {
    if (amount.lte(0)) throw new ApiException(400, "BAD_REQUEST", "Collateral amount must be positive");
    if (this.available(makerId).lt(amount)) {
      throw new ApiException(409, "INSUFFICIENT_COLLATERAL", "Insufficient collateral; no state was changed");
    }
    const account = this.materialize(makerId);
    account.free = account.free.sub(amount);
    account.locked = account.locked.add(amount);
  }

  releaseFunds(makerId: string, amount: Decimal): void {
    const account = this.accounts.get(makerId);
    if (!account || account.locked.lt(amount)) {
      throw new ApiException(409, "COLLATERAL_ACCOUNTING", "Cannot release collateral that is not locked");
    }
    account.locked = account.locked.sub(amount);
    account.free = account.free.add(amount);
  }

  place(input: PlaceOrderInput): MarketOrderResult {
    this.sweepExpired(input.nowMs);
    const fingerprint = orderFingerprint(input);
    const clientKey = `${input.makerId}|${input.clientOrderId}`;
    const existing = this.byClient.get(clientKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new ApiException(409, "CLIENT_ORDER_CONFLICT", "clientOrderId was already used with different terms");
      }
      return this.toResult(existing);
    }

    const price = parsePositive(input.priceUsd, "priceUsd");
    const quantity = parsePositive(input.quantity, "quantity");
    const goodTilMs = Date.parse(input.goodTil);
    if (!input.nonce) throw new ApiException(400, "BAD_REQUEST", "nonce is required");
    if (!input.clientOrderId) throw new ApiException(400, "BAD_REQUEST", "clientOrderId is required");
    if (Number.isNaN(goodTilMs)) throw new ApiException(400, "BAD_REQUEST", "goodTil must be an ISO timestamp");
    if (goodTilMs <= input.nowMs) throw new ApiException(409, "ORDER_EXPIRED", "Order goodTil is already past");

    const payout = this.payoutPerUnit(input.instrumentId);
    if (!payout) throw new ApiException(404, "INSTRUMENT_NOT_FOUND", "Unknown instrument");

    const nonceKey = `${input.makerId}|${input.nonce}`;
    if (this.nonces.has(nonceKey)) {
      throw new ApiException(409, "NONCE_REPLAY", "Nonce was already used by this maker");
    }

    const required = input.side === "BUY" ? price.mul(quantity) : payout.mul(quantity);
    if (this.available(input.makerId).lt(required)) {
      throw new ApiException(409, "INSUFFICIENT_COLLATERAL", "Insufficient collateral; no state was changed");
    }

    const timeInForce = input.timeInForce ?? "GTC";
    if (timeInForce === "FOK" && this.fillable(input, price, quantity).lt(quantity)) {
      throw new ApiException(409, "INSUFFICIENT_DEPTH", "Depth at the limit does not cover the order; no state was changed");
    }

    const account = this.materialize(input.makerId);
    account.free = account.free.sub(required);
    account.locked = account.locked.add(required);
    this.nonces.add(nonceKey);

    const order: RestingOrder = {
      orderId: `ord_${++this.orderNumber}`,
      clientOrderId: input.clientOrderId,
      makerId: input.makerId,
      instrumentId: input.instrumentId,
      side: input.side,
      price,
      quantity,
      remaining: quantity,
      filled: D(0),
      notional: D(0),
      nonce: input.nonce,
      goodTil: input.goodTil,
      placedAtMs: input.nowMs,
      sequence: ++this.sequence,
      locked: required,
      status: "ACCEPTED",
      fingerprint,
    };
    this.orders.push(order);
    this.byClient.set(clientKey, order);
    this.match(order, input.nowMs);
    if (order.remaining.eq(0)) order.status = "FILLED";
    else if (order.filled.gt(0)) order.status = "PARTIALLY_FILLED";
    else order.status = "ACCEPTED";
    if (timeInForce === "FOK" && order.remaining.gt(0)) {
      throw new Error("FOK precheck did not match the fill");
    }
    return this.toResult(order);
  }

  cancel(makerId: string, clientOrderId: string, nowMs: number): MarketOrderResult {
    this.sweepExpired(nowMs);
    const order = this.byClient.get(`${makerId}|${clientOrderId}`);
    if (!order) throw new ApiException(404, "ORDER_NOT_FOUND", "Unknown clientOrderId");
    if (order.status === "CANCELLED" || order.status === "EXPIRED") return this.toResult(order);
    if (order.remaining.eq(0)) throw new ApiException(409, "ORDER_NOT_OPEN", "Order has no resting quantity");
    this.releaseResting(order);
    order.status = "CANCELLED";
    return this.toResult(order);
  }

  private available(makerId: string): Decimal {
    const account = this.accounts.get(makerId);
    return account ? account.free : this.endowmentFor(makerId);
  }

  private materialize(makerId: string): Account {
    const existing = this.accounts.get(makerId);
    if (existing) return existing;
    const created = { free: this.endowmentFor(makerId), locked: D(0) };
    this.accounts.set(makerId, created);
    return created;
  }

  private fillable(input: PlaceOrderInput, limit: Decimal, quantity: Decimal): Decimal {
    const opposite = input.side === "BUY" ? this.sorted(input.instrumentId, "SELL", input.nowMs) : this.sorted(input.instrumentId, "BUY", input.nowMs);
    let remaining = quantity;
    for (const resting of opposite) {
      if (remaining.lte(0)) break;
      if (resting.makerId === input.makerId) continue;
      const crosses = input.side === "BUY" ? resting.price.lte(limit) : resting.price.gte(limit);
      if (!crosses) break;
      remaining = remaining.sub(Decimal.min(remaining, resting.remaining));
    }
    return quantity.sub(remaining);
  }

  private match(incoming: RestingOrder, nowMs: number): void {
    const opposite = this.sorted(incoming.instrumentId, incoming.side === "BUY" ? "SELL" : "BUY", nowMs);
    for (const resting of opposite) {
      if (incoming.remaining.lte(0)) break;
      if (resting.makerId === incoming.makerId) continue;
      const crosses = incoming.side === "BUY" ? resting.price.lte(incoming.price) : resting.price.gte(incoming.price);
      if (!crosses) break;
      this.applyFill(resting, incoming, Decimal.min(incoming.remaining, resting.remaining));
    }
  }

  private applyFill(resting: RestingOrder, incoming: RestingOrder, qty: Decimal): void {
    const payout = this.payoutPerUnit(resting.instrumentId);
    if (!payout) throw new ApiException(404, "INSTRUMENT_NOT_FOUND", "Unknown instrument");
    const tradePrice = resting.price;
    const buyer = resting.side === "BUY" ? resting : incoming;
    const seller = resting.side === "SELL" ? resting : incoming;
    const buyerReserve = buyer.price.mul(qty);
    const premium = tradePrice.mul(qty);
    const sellerReserve = payout.mul(qty);
    if (buyer.locked.lt(buyerReserve) || seller.locked.lt(sellerReserve) || premium.gt(buyerReserve)) {
      throw new Error("collateral invariant broken");
    }

    buyer.locked = buyer.locked.sub(buyerReserve);
    const buyerAccount = this.accounts.get(buyer.makerId);
    const sellerAccount = this.accounts.get(seller.makerId);
    if (!buyerAccount || !sellerAccount) throw new Error("missing account");
    buyerAccount.locked = buyerAccount.locked.sub(buyerReserve);
    buyerAccount.free = buyerAccount.free.add(buyerReserve.sub(premium));
    sellerAccount.free = sellerAccount.free.add(premium);
    // Seller max-payout for the filled slice stays locked as a position, not as resting size.
    seller.locked = seller.locked.sub(sellerReserve);

    for (const order of [buyer, seller]) {
      order.remaining = order.remaining.sub(qty);
      order.filled = order.filled.add(qty);
      order.notional = order.notional.add(premium);
    }
    if (resting.remaining.eq(0)) resting.status = "FILLED";
    else resting.status = "PARTIALLY_FILLED";
  }

  private releaseResting(order: RestingOrder): void {
    const account = this.accounts.get(order.makerId);
    if (!account || account.locked.lt(order.locked)) throw new Error("locked collateral missing");
    account.locked = account.locked.sub(order.locked);
    account.free = account.free.add(order.locked);
    order.locked = D(0);
    order.remaining = D(0);
  }

  private sweepExpired(nowMs: number): void {
    for (const order of this.orders) {
      if (order.remaining.gt(0) && Date.parse(order.goodTil) <= nowMs) {
        this.releaseResting(order);
        order.status = "EXPIRED";
      }
    }
  }

  private sorted(instrumentId: string, side: "BUY" | "SELL", nowMs: number): RestingOrder[] {
    return this.orders
      .filter((order) => order.instrumentId === instrumentId && order.side === side && order.remaining.gt(0) && Date.parse(order.goodTil) > nowMs)
      .sort((a, b) => {
        const price = side === "BUY" ? b.price.cmp(a.price) : a.price.cmp(b.price);
        return price || a.sequence - b.sequence;
      });
  }

  private aggregate(instrumentId: string, side: "BUY" | "SELL", highFirst: boolean): OrderbookLevel[] {
    const totals = new Map<string, Decimal>();
    const open = this.orders.filter((order) => order.instrumentId === instrumentId && order.side === side && order.remaining.gt(0));
    for (const order of open) {
      const key = money(order.price);
      totals.set(key, (totals.get(key) ?? D(0)).add(order.remaining));
    }
    const levels = [...totals.entries()].map(([priceUsd, quantity]) => ({ priceUsd, quantity: money(quantity) }));
    levels.sort((a, b) => (highFirst ? D(b.priceUsd).cmp(D(a.priceUsd)) : D(a.priceUsd).cmp(D(b.priceUsd))));
    return levels;
  }

  private toResult(order: RestingOrder): MarketOrderResult {
    const status = order.status === "FILLED" ? "FILLED" : order.status;
    return {
      clientOrderId: order.clientOrderId,
      venueOrderId: order.orderId,
      status,
      filledQuantity: money(order.filled),
      averageFillPriceUsd: order.filled.eq(0) ? "0" : money(order.notional.div(order.filled)),
      syntheticDemo: true,
    };
  }
}

function parsePositive(value: string, field: string): Decimal {
  let parsed: Decimal;
  try {
    parsed = D(value);
  } catch {
    throw new ApiException(400, "BAD_REQUEST", `${field} must be a decimal string`);
  }
  if (parsed.lte(0)) throw new ApiException(400, "BAD_REQUEST", `${field} must be positive`);
  return parsed;
}

function orderFingerprint(input: PlaceOrderInput): string {
  return [input.instrumentId, input.side, input.priceUsd, input.quantity, input.nonce, input.goodTil].join("|");
}
