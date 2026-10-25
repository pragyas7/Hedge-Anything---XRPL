import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { MarketQuote, MarketSearchResponse } from "@switchboard/contracts";
import { OUTAGE_ID } from "../src/instruments.js";
import { loadKalshiReference } from "../src/kalshi.js";
import { OUTAGE_EXPOSURE } from "../src/comparability.js";
import { manualClock } from "../src/clock.js";
import { START_MS, bearer, signExec, testApp } from "./helpers.js";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/market-search.json");
let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function searchBody(quantity = "10", exposureIds = ["primary_outage"], jurisdiction = "US") {
  return {
    companyId: "co_demo_ai",
    exposureIds,
    requestedQuantity: quantity,
    jurisdiction,
    includeReferenceMarkets: true,
  };
}

async function search(instance: FastifyInstance, body = searchBody(), key = "search-1") {
  return instance.inject({
    method: "POST",
    url: "/v1/markets/search",
    headers: bearer({ "idempotency-key": key, "content-type": "application/json", "x-request-id": "req-search" }),
    payload: body,
  });
}

describe("market search and execution authorization", () => {
  it("serves health without auth and echoes the request id", async () => {
    ({ app } = await testApp());
    const health = await app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok", service: "markets", version: "1.0.0" });
    const missing = await app.inject({ method: "POST", url: "/v1/markets/search", headers: { "x-request-id": "req-123" }, payload: {} });
    expect(missing.statusCode).toBe(401);
    expect(missing.headers["x-request-id"]).toBe("req-123");
    expect(missing.json()).toMatchObject({ code: "UNAUTHORIZED", correlationId: "req-123" });
  });

  it("labels direct, proxy, and not comparable quotes and prices the sandbox book", async () => {
    ({ app } = await testApp());
    const response = await search(app);
    expect(response.statusCode).toBe(200);
    const body = response.json() as MarketSearchResponse;
    const byId = Object.fromEntries(body.quotes.map((quote) => [quote.instrument.instrumentId, quote]));
    expect(byId[OUTAGE_ID]?.comparison).toBe("direct");
    expect(byId[OUTAGE_ID]?.capability).toBe("sandbox");
    expect(byId[OUTAGE_ID]?.source).toBe("sandbox");
    expect(byId[OUTAGE_ID]?.estimatedAllInBuyCostUsd).toBe("182.8");
    expect(byId[OUTAGE_ID]?.fees).toEqual({
      tradingFeeUsd: "1.8",
      networkFeeUsd: "1",
      conversionFeeUsd: "0",
      modeledSlippageUsd: "0",
      otherFeeUsd: "0",
    });
    expect(byId[OUTAGE_ID]?.quotedAt).toBe("2026-10-24T22:00:00.000Z");
    expect(byId.sb_sandbox_service_cost_cap?.comparison).toBe("proxy");
    expect(byId.sb_sandbox_contingent_capacity_option?.comparison).toBe("proxy");
    const weather = body.quotes.find((quote) => quote.instrument.instrumentId === "synthetic_weather_temp_reference");
    expect(weather?.comparison).toBe("not_comparable");
    expect(weather?.comparison).not.toBe("direct");
    expect(weather?.source).toBe("synthetic");
    expect(weather?.capability).toBe("read_only");
    const international = body.quotes.find((quote) => quote.venue === "polymarket_international");
    expect(international?.capability).toBe("read_only");
    expect(international?.source).toBe("synthetic");
    expect(international?.eligibilityReason.toLowerCase()).toContain("reference only");
    expect(body.capacityOffers[0]?.verifiedCapacity).toBe(false);
    expect(body.quotes.some((quote) => quote.source === "live")).toBe(false);
    expect(body.warnings.join(" ").toLowerCase()).toContain("not arbitrage");

    const weatherSearch = await search(app, searchBody("10", ["weather_hurricane"]), "search-weather");
    const weatherBody = weatherSearch.json() as MarketSearchResponse;
    const outage = weatherBody.quotes.find((quote) => quote.instrument.instrumentId === OUTAGE_ID);
    const weatherRow = weatherBody.quotes.find((quote) => quote.instrument.instrumentId === "synthetic_weather_temp_reference");
    expect(outage?.comparison).not.toBe("direct");
    expect(weatherRow?.comparison).toBe("direct");
    expect(weatherRow?.capability).toBe("read_only");
  });

  it("returns the market-search fixture unchanged for the demo header", async () => {
    ({ app } = await testApp());
    const expected = JSON.parse(readFileSync(fixturePath, "utf8")) as MarketSearchResponse;
    const response = await search(app, searchBody(), "fixture-1");
    // Normal search is not the fixture.
    expect(response.json()).not.toEqual(expected);
    const fixture = await app.inject({
      method: "POST",
      url: "/v1/markets/search",
      headers: bearer({ "idempotency-key": "fixture-2", "x-demo-fixture": "market-search", "content-type": "application/json" }),
      payload: searchBody(),
    });
    expect(fixture.statusCode).toBe(200);
    expect(fixture.json()).toEqual(expected);
  });

  it("rejects a missing idempotency key and a reused key with a different body", async () => {
    ({ app } = await testApp());
    const missing = await app.inject({
      method: "POST",
      url: "/v1/markets/search",
      headers: bearer({ "content-type": "application/json" }),
      payload: searchBody(),
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("rejects stale quotes, thin depth, missing JWTs, replayed jti, claim mismatches, and live mode", async () => {
    const clock = manualClock(START_MS);
    ({ app } = await testApp({ clock, config: { quoteTtlMs: 1_000 } }));
    const listed = await search(app, searchBody("1"));
    const quote = (listed.json() as MarketSearchResponse).quotes.find((row) => row.instrument.instrumentId === OUTAGE_ID) as MarketQuote;
    const nowSec = Math.floor(START_MS / 1000);
    const before = app.store.book.snapshot();

    const noToken = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({ "idempotency-key": "order-missing-jwt", "content-type": "application/json" }),
      payload: orderFor(quote, "1"),
    });
    expect(noToken.statusCode).toBe(401);
    expect(app.store.marketOrders.size).toBe(0);
    expect(app.store.book.snapshot()).toEqual(before);

    const token = await signExec(claimsFor(quote, { maxQuantity: "1", maxPriceUsd: "18", maxSpendUsd: "18" }), nowSec);
    const payload = JSON.stringify(orderFor(quote, "1"));
    const placed = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({
        "idempotency-key": "order-ok",
        "content-type": "application/json",
        "x-execution-authorization": token,
      }),
      payload,
    });
    expect(placed.statusCode).toBe(200);
    expect(placed.json()).toMatchObject({ status: "SIMULATED", syntheticDemo: true, filledQuantity: "1", averageFillPriceUsd: "18" });
    expect(placed.json().status).not.toBe("FILLED");
    const replay = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({
        "idempotency-key": "order-ok",
        "content-type": "application/json",
        "x-execution-authorization": token,
      }),
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(placed.json());
    const ask = app.store.book.levels(OUTAGE_ID, clock.now().getTime()).asks.find((level) => level.priceUsd === "18");
    expect(ask?.quantity).toBe("24");

    const conflict = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({ "idempotency-key": "order-ok", "content-type": "application/json", "x-execution-authorization": token }),
      payload: orderFor(quote, "2"),
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe("IDEMPOTENCY_CONFLICT");
    expect(app.store.book.levels(OUTAGE_ID, clock.now().getTime()).asks.find((level) => level.priceUsd === "18")?.quantity).toBe("24");

    const jti = "jti-once";
    const secondQuoteSearch = await search(app, searchBody("1"), "search-second");
    const second = (secondQuoteSearch.json() as MarketSearchResponse).quotes.find((row) => row.instrument.instrumentId === OUTAGE_ID) as MarketQuote;
    const firstJti = await signExec(claimsFor(second, { maxQuantity: "1", maxPriceUsd: "18", maxSpendUsd: "18", jti }), nowSec);
    const againJti = await signExec(claimsFor(second, { maxQuantity: "1", maxPriceUsd: "18", maxSpendUsd: "18", jti, quoteId: second.quoteId }), nowSec);
    const first = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({ "idempotency-key": "jti-a", "content-type": "application/json", "x-execution-authorization": firstJti }),
      payload: { ...orderFor(second, "1"), clientOrderId: "client-jti-a" },
    });
    expect(first.statusCode).toBe(200);
    const secondTry = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({ "idempotency-key": "jti-b", "content-type": "application/json", "x-execution-authorization": againJti }),
      payload: { ...orderFor(second, "1"), clientOrderId: "client-jti-b" },
    });
    expect(secondTry.statusCode).toBe(403);
    expect(secondTry.json().code).toBe("JTI_REPLAY");
    expect(app.store.marketOrders.size).toBe(2);

    const mismatchQuoteSearch = await search(app, searchBody("1"), "search-mismatch");
    const mismatchQuote = (mismatchQuoteSearch.json() as MarketSearchResponse).quotes.find((row) => row.instrument.instrumentId === OUTAGE_ID) as MarketQuote;
    const mismatchToken = await signExec(claimsFor(mismatchQuote, { maxQuantity: "1", maxPriceUsd: "10", maxSpendUsd: "10" }), nowSec);
    const ordersBefore = app.store.marketOrders.size;
    const mismatch = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({ "idempotency-key": "mismatch", "content-type": "application/json", "x-execution-authorization": mismatchToken }),
      payload: { ...orderFor(mismatchQuote, "1"), clientOrderId: "client-mismatch", limitPriceUsd: "18" },
    });
    expect(mismatch.statusCode).toBe(403);
    expect(mismatch.json().code).toBe("CLAIM_MISMATCH");
    expect(app.store.marketOrders.size).toBe(ordersBefore);

    const thinSearch = await search(app, searchBody("1000"), "search-thin");
    const thin = (thinSearch.json() as MarketSearchResponse).quotes.find((row) => row.instrument.instrumentId === OUTAGE_ID) as MarketQuote;
    expect(thin.eligibilityReason.toLowerCase()).toContain("not executable");
    const thinToken = await signExec(claimsFor(thin, { maxQuantity: "1000", maxPriceUsd: "30", maxSpendUsd: "30000" }), nowSec);
    const thinOrder = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({ "idempotency-key": "thin", "content-type": "application/json", "x-execution-authorization": thinToken }),
      payload: { ...orderFor(thin, "1000"), clientOrderId: "client-thin", limitPriceUsd: "30" },
    });
    expect(thinOrder.statusCode).toBe(409);
    expect(thinOrder.json().code).toBe("INSUFFICIENT_DEPTH");

    const intl = (listed.json() as MarketSearchResponse).quotes.find((row) => row.venue === "polymarket_international") as MarketQuote;
    const intlToken = await signExec(
      claimsFor(intl, { maxQuantity: "10", maxPriceUsd: "1", maxSpendUsd: "10", venue: "polymarket_international" }),
      nowSec,
    );
    const intlOrder = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({ "idempotency-key": "intl", "content-type": "application/json", "x-execution-authorization": intlToken }),
      payload: { ...orderFor(intl, "1"), clientOrderId: "client-intl", limitPriceUsd: "1" },
    });
    expect(intlOrder.statusCode).toBe(403);
    expect(intlOrder.json().code).toBe("REFERENCE_ONLY");
    expect(app.store.marketOrders.has("client-intl")).toBe(false);

    const existingLive = app.store.quotes.get(quote.quoteId)!;
    app.store.quotes.set("q_live_switchboard", {
      quote: { ...existingLive.quote, quoteId: "q_live_switchboard", capability: "live", source: "live" },
      executable: true,
      mode: "book",
      snapshotRemaining: existingLive.snapshotRemaining,
    });
    const liveQuote = app.store.quotes.get("q_live_switchboard")!.quote;
    const sandboxOnLive = await signExec(claimsFor(liveQuote, { maxQuantity: "1", maxPriceUsd: "18", maxSpendUsd: "18" }), nowSec);
    const rejectedLive = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({ "idempotency-key": "live-cap", "content-type": "application/json", "x-execution-authorization": sandboxOnLive }),
      payload: { ...orderFor(liveQuote, "1"), clientOrderId: "client-live-cap" },
    });
    expect(rejectedLive.statusCode).toBe(403);
    expect(rejectedLive.json().code).toBe("SANDBOX_CANNOT_AUTHORIZE_LIVE");
    expect(app.store.marketOrders.has("client-live-cap")).toBe(false);

    const liveModeQuoteSearch = await search(app, searchBody("1"), "search-live-mode");
    const liveModeQuote = (liveModeQuoteSearch.json() as MarketSearchResponse).quotes.find((row) => row.instrument.instrumentId === OUTAGE_ID) as MarketQuote;
    const liveMode = await signExec(
      claimsFor(liveModeQuote, { maxQuantity: "1", maxPriceUsd: "18", maxSpendUsd: "18", mode: "live" }),
      nowSec,
    );
    const liveModeOrder = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({ "idempotency-key": "live-mode", "content-type": "application/json", "x-execution-authorization": liveMode }),
      payload: { ...orderFor(liveModeQuote, "1"), clientOrderId: "client-live-mode" },
    });
    expect(liveModeOrder.statusCode).toBe(403);
    expect(liveModeOrder.json().code).toBe("LIVE_MODE_DISABLED");
    expect(app.store.marketOrders.has("client-live-mode")).toBe(false);

    clock.advance(1_500);
    const staleSearch = await search(app, searchBody("1"), "search-stale");
    const fresh = (staleSearch.json() as MarketSearchResponse).quotes.find((row) => row.instrument.instrumentId === OUTAGE_ID) as MarketQuote;
    clock.advance(1_500);
    const staleToken = await signExec(claimsFor(fresh, { maxQuantity: "1", maxPriceUsd: "18", maxSpendUsd: "18" }), Math.floor(clock.now().getTime() / 1000));
    const stale = await app.inject({
      method: "POST",
      url: "/v1/markets/orders",
      headers: bearer({ "idempotency-key": "stale", "content-type": "application/json", "x-execution-authorization": staleToken }),
      payload: { ...orderFor(fresh, "1"), clientOrderId: "client-stale" },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe("QUOTE_EXPIRED");
    expect(app.store.marketOrders.has("client-stale")).toBe(false);
  });

  it("keeps a public Kalshi weather read non-executable and not a direct outage hedge", async () => {
    const clock = manualClock(START_MS);
    const quote = await loadKalshiReference({
      baseUrl: "https://kalshi.test",
      series: "KXHIGHNY",
      timeoutMs: 50,
      requestedQuantity: "10",
      exposure: OUTAGE_EXPOSURE,
      jurisdiction: "US",
      clock,
      quoteTtlMs: 30_000,
      fetchImpl: (async (url: string) => {
        if (String(url).includes("orderbook")) {
          return new Response(JSON.stringify({ orderbook_fp: { no_dollars: [["0.9900", "206.00"]], yes_dollars: [] } }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            markets: [
              {
                ticker: "KXHIGHNY-TEST",
                title: "Will the maximum temperature be >71°?",
                rules_primary: "If the maximum temperature in New York is greater than 71 degrees, resolve Yes.",
                expiration_time: "2026-11-01T14:00:00Z",
                yes_bid_dollars: "0.0000",
                yes_ask_dollars: "0.0100",
                yes_ask_size_fp: "206.00",
              },
            ],
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    });
    expect(quote?.source).toBe("live");
    expect(quote?.capability).toBe("read_only");
    expect(quote?.comparison).toBe("not_comparable");
    expect(quote?.comparison).not.toBe("direct");
    expect(quote?.askUsd).toBe("0.01");
    expect(quote?.eligibilityReason.toLowerCase()).toContain("not executable");
  });

  it("drops the synthetic weather example once a live Kalshi row is attached", async () => {
    const fetchImpl = (async (url: string) => {
      if (String(url).includes("orderbook")) {
        return new Response(JSON.stringify({ orderbook_fp: { no_dollars: [["0.9900", "206.00"]], yes_dollars: [] } }), { status: 200 });
      }
      return new Response(JSON.stringify({
        markets: [{
          ticker: "KXHIGHNY-TEST",
          title: "Will the maximum temperature be >71°?",
          rules_primary: "If the maximum temperature in New York is greater than 71 degrees, resolve Yes.",
          expiration_time: "2026-11-01T14:00:00Z",
          yes_bid_dollars: "0.0000",
          yes_ask_dollars: "0.0100",
          yes_ask_size_fp: "206.00",
        }],
      }), { status: 200 });
    }) as typeof fetch;
    ({ app } = await testApp({ kalshiEnabled: true, fetchImpl }));
    const response = await search(app, searchBody(), "search-live-kalshi");
    expect(response.statusCode).toBe(200);
    const body = response.json() as MarketSearchResponse;
    const live = body.quotes.find((quote) => quote.source === "live");
    expect(live?.capability).toBe("read_only");
    expect(live?.venue).toBe("kalshi");
    expect(body.quotes.some((quote) => quote.instrument.instrumentId === "synthetic_weather_temp_reference")).toBe(false);
    expect(body.quotes.some((quote) => quote.venue === "polymarket_international")).toBe(true);
    expect(body.quotes.some((quote) => quote.instrument.instrumentId === OUTAGE_ID && quote.source === "sandbox")).toBe(true);
  });
});

function orderFor(quote: MarketQuote, quantity: string) {
  return {
    approvalId: "appr_1",
    planHash: "sha256:test",
    quoteId: quote.quoteId,
    side: "BUY" as const,
    quantity,
    limitPriceUsd: "18",
    clientOrderId: "client-1",
  };
}

function claimsFor(quote: MarketQuote, extra: Omit<Parameters<typeof signExec>[0], "sub">) {
  return {
    sub: "appr_1",
    planHash: "sha256:test",
    quoteId: quote.quoteId,
    instrumentId: quote.instrument.instrumentId,
    venue: quote.venue,
    side: "BUY" as const,
    ...extra,
  };
}
