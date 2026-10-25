import { readFileSync } from "node:fs";
import type { CapacityOffer, MarketQuote, MarketSearchRequest, MarketSearchResponse } from "@switchboard/contracts";
import { classifyComparison, exposureFromIds, type ComparabilityTerms } from "./comparability.js";
import type { Clock } from "./clock.js";
import type { AppConfig } from "./config.js";
import { instrumentTerms, OUTAGE_INSTRUMENT, STANDARD_INSTRUMENTS } from "./instruments.js";
import { loadKalshiReference } from "./kalshi.js";
import { D } from "./money.js";
import { bestBid, priceAtSize, SWITCHBOARD_SANDBOX_FEES } from "./pricing.js";
import type { MemoryStore } from "./store.js";
import { ApiException } from "./errors.js";
import { assertBoolean, assertExact, assertMoney, assertString } from "./validate.js";

export function parseSearchRequest(body: unknown): MarketSearchRequest {
  const record = assertExact(body, ["companyId", "exposureIds", "requestedQuantity", "jurisdiction", "includeReferenceMarkets"]);
  const companyId = assertString(record, "companyId");
  const requestedQuantity = assertMoney(record, "requestedQuantity");
  if (D(requestedQuantity).lte(0)) throw new ApiException(400, "BAD_REQUEST", "requestedQuantity must be positive");
  const jurisdiction = assertString(record, "jurisdiction");
  const includeReferenceMarkets = assertBoolean(record, "includeReferenceMarkets");
  const exposureIdsRaw = record.exposureIds;
  if (!Array.isArray(exposureIdsRaw) || exposureIdsRaw.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new ApiException(400, "BAD_REQUEST", "exposureIds must be an array of strings");
  }
  return { companyId, exposureIds: exposureIdsRaw, requestedQuantity, jurisdiction, includeReferenceMarkets };
}

export function readFixture(path: string): MarketSearchResponse {
  return JSON.parse(readFileSync(path, "utf8")) as MarketSearchResponse;
}

export function rememberFixtureQuotes(store: MemoryStore, response: MarketSearchResponse): void {
  for (const quote of response.quotes) {
    store.quotes.set(quote.quoteId, {
      quote: structuredClone(quote),
      executable: quote.capability === "sandbox" && quote.venue === "switchboard" && D(quote.availableQuantity).gte(D(quote.requestedQuantity)),
      mode: "snapshot",
      snapshotRemaining: D(quote.availableQuantity),
    });
  }
}

export async function buildSearch(args: {
  request: MarketSearchRequest;
  store: MemoryStore;
  clock: Clock;
  config: AppConfig;
  kalshiEnabled: boolean;
  fetchImpl?: typeof fetch;
}): Promise<MarketSearchResponse> {
  const { request, store, clock, config } = args;
  const exposure = exposureFromIds(request.exposureIds);
  const now = clock.now();
  const quotedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + config.quoteTtlMs).toISOString();
  const quotes: MarketQuote[] = [];

  for (const instrument of STANDARD_INSTRUMENTS) {
    const depth = store.book.levels(instrument.instrumentId, now.getTime());
    const priced = priceAtSize(depth.asks, request.requestedQuantity, SWITCHBOARD_SANDBOX_FEES);
    const comparison = classifyComparison(exposure, instrumentTerms(instrument));
    const executable = priced.depthCoversQuantity;
    const quote: MarketQuote = {
      quoteId: store.nextId(`q_${instrument.instrumentId}`),
      instrument: { ...instrument },
      venue: "switchboard",
      capability: "sandbox",
      comparison,
      eligibilityReason: executable
        ? `SANDBOX synthetic Switchboard book. Fee schedule ${SWITCHBOARD_SANDBOX_FEES.version}. Not a regulated live market.`
        : `SANDBOX synthetic Switchboard book. Fee schedule ${SWITCHBOARD_SANDBOX_FEES.version}. Insufficient depth for the requested quantity; quote is not executable.`,
      bidUsd: bestBid(depth.bids),
      askUsd: priced.bestAskUsd,
      requestedQuantity: request.requestedQuantity,
      availableQuantity: priced.availableQuantity,
      estimatedAllInBuyCostUsd: priced.estimatedAllInBuyCostUsd,
      fees: priced.fees,
      quotedAt,
      expiresAt,
      source: "sandbox",
      basisRiskDescription: basisText(comparison),
    };
    quotes.push(quote);
    store.quotes.set(quote.quoteId, {
      quote,
      executable,
      mode: "book",
      snapshotRemaining: D(priced.availableQuantity),
    });
  }

  const warnings = [
    "Switchboard quotes are synthetic sandbox liquidity, not a regulated live market and not a live fill.",
    "Kalshi order placement was not verified.",
    "Polymarket US live book was not verified and is not invented.",
    "Polymarket International is reference-only for a US jurisdiction. A price gap versus a different resolution rule is not arbitrage.",
    "Capacity offers have verifiedCapacity false until a live load test and reservation exist.",
    `Switchboard fee schedule ${SWITCHBOARD_SANDBOX_FEES.version} is a sandbox model. Kalshi and Polymarket category fees are not reused.`,
  ];

  let liveKalshi = false;
  if (args.kalshiEnabled) {
    const live = await loadKalshiReference({
      baseUrl: config.kalshiBaseUrl,
      series: config.kalshiSeries,
      timeoutMs: config.kalshiTimeoutMs,
      requestedQuantity: request.requestedQuantity,
      exposure,
      jurisdiction: request.jurisdiction,
      clock,
      quoteTtlMs: config.quoteTtlMs,
      fetchImpl: args.fetchImpl,
    });
    if (live) {
      liveKalshi = true;
      quotes.push(live);
      store.quotes.set(live.quoteId, { quote: live, executable: false, mode: "snapshot", snapshotRemaining: D(0) });
      warnings.push("Kalshi public market data was read. Fees were not applied. The row is read_only and not executable.");
    } else {
      warnings.push("Kalshi public read was not available; no source=live row is returned.");
    }
  } else {
    warnings.push("Kalshi public read was not requested; no source=live row is returned.");
  }

  if (request.includeReferenceMarkets) {
    // A live Kalshi row already shows a real public price. The synthetic weather example would sit beside it and look like the live price.
    if (!liveKalshi) {
      const weather = syntheticWeatherQuote(store, request, exposure, quotedAt, expiresAt);
      quotes.push(weather);
      store.quotes.set(weather.quoteId, { quote: weather, executable: false, mode: "snapshot", snapshotRemaining: D(0) });
    }
    const international = syntheticInternationalQuote(store, request, exposure, quotedAt, expiresAt);
    quotes.push(international);
    store.quotes.set(international.quoteId, { quote: international, executable: false, mode: "snapshot", snapshotRemaining: D(0) });
  }

  if (config.polymarketUsApiKey) {
    warnings.push("POLYMARKET_US_API_KEY is set, but no Polymarket US book was verified. No live US book is invented and orders are rejected.");
  } else {
    warnings.push("POLYMARKET_US_API_KEY is unset. Polymarket US stays read_only with no invented book.");
  }

  return {
    companyId: request.companyId,
    quotes,
    capacityOffers: [capacityOffer()],
    retrievedAt: quotedAt,
    warnings,
  };
}

function basisText(comparison: MarketQuote["comparison"]): string {
  if (comparison === "direct") {
    return "Event rule, resolution source, window, payout unit, and side match. Residual basis remains if the firm's loss differs from the contract trigger. Not arbitrage.";
  }
  if (comparison === "proxy") {
    return "Related risk family, but the event rule, resolution source, window, payout unit, or side does not fully match. Not a direct hedge and not arbitrage.";
  }
  return "Different event. A weather contract versus a cloud or service outage is not comparable and is not arbitrage.";
}

function capacityOffer(): CapacityOffer {
  return {
    offerId: "cap_sandbox_unverified",
    providerName: "Sandbox Capacity Provider (synthetic)",
    qualifiedTask: "inference compatibility suite (synthetic)",
    region: "us-east",
    throughputPerSecond: 100,
    guaranteedPricePerRequestUsd: "0.006",
    reservationPremiumUsd: "250",
    reservedUntil: OUTAGE_INSTRUMENT.expiresAt,
    verifiedCapacity: false,
    qualificationBenchmark: "synthetic benchmark; not a live load test or reservation",
    capability: "sandbox",
  };
}

function zeroFees(): MarketQuote["fees"] {
  return { tradingFeeUsd: "0", networkFeeUsd: "0", conversionFeeUsd: "0", modeledSlippageUsd: "0", otherFeeUsd: "0" };
}

function syntheticWeatherQuote(
  store: MemoryStore,
  request: MarketSearchRequest,
  exposure: ComparabilityTerms,
  quotedAt: string,
  expiresAt: string,
): MarketQuote {
  const terms = {
    eventRule: "Pays if a reference city daily high temperature exceeds a stated Fahrenheit strike. Weather observation, not a service probe.",
    resolutionSource: "https://example.invalid/weather/reference-station",
    window: "2026-10-25T23:59:59.000Z",
    payoutUnit: "USD per weather binary",
    side: "BUY",
    subject: "weather" as const,
  };
  return {
    quoteId: store.nextId("q_synthetic_weather"),
    instrument: {
      instrumentId: "synthetic_weather_temp_reference",
      venue: "kalshi",
      name: "SYNTHETIC EXAMPLE weather temperature binary. Not a live Kalshi listing.",
      riskFactor: "weather_temperature",
      settlementType: "binary",
      eventRule: terms.eventRule,
      resolutionSourceUrl: terms.resolutionSource,
      expiresAt: terms.window,
      payoutPerUnitUsd: "1",
      maximumPayoutUsd: "1",
      collateralCurrency: "USD",
      unitDescription: "Synthetic weather reference. Not executable.",
    },
    venue: "kalshi",
    capability: "read_only",
    comparison: classifyComparison(exposure, terms),
    eligibilityReason: "SYNTHETIC example, not a live Kalshi listing and not executable. Weather versus a cloud outage is not direct and is not arbitrage.",
    bidUsd: "0.4",
    askUsd: "0.5",
    requestedQuantity: request.requestedQuantity,
    availableQuantity: "0",
    estimatedAllInBuyCostUsd: "0",
    fees: zeroFees(),
    quotedAt,
    expiresAt,
    source: "synthetic",
    basisRiskDescription: basisText(classifyComparison(exposure, terms)),
  };
}

function isUs(jurisdiction: string): boolean {
  const value = jurisdiction.trim().toLowerCase();
  return value === "us" || value === "usa" || value === "united states" || value === "united states of america";
}

function syntheticInternationalQuote(
  store: MemoryStore,
  request: MarketSearchRequest,
  exposure: ComparabilityTerms,
  quotedAt: string,
  expiresAt: string,
): MarketQuote {
  const us = isUs(request.jurisdiction);
  const terms: ComparabilityTerms = {
    eventRule: "International reference binary with its own resolution source and window. Not a Switchboard service-outage contract.",
    resolutionSource: "https://example.invalid/polymarket-international/reference",
    window: "2026-12-31T23:59:59.000Z",
    payoutUnit: "USD per international reference contract",
    side: "BUY",
    subject: "other",
  };
  return {
    quoteId: store.nextId("q_poly_intl"),
    instrument: {
      instrumentId: "synthetic_polymarket_international_reference",
      venue: "polymarket_international",
      name: "SYNTHETIC Polymarket International reference. Not a live book.",
      riskFactor: "reference_only",
      settlementType: "binary",
      eventRule: terms.eventRule,
      resolutionSourceUrl: terms.resolutionSource,
      expiresAt: terms.window,
      payoutPerUnitUsd: "1",
      maximumPayoutUsd: "1",
      collateralCurrency: "USD",
      unitDescription: "Synthetic international reference. Not executable from this service.",
    },
    venue: "polymarket_international",
    capability: "read_only",
    comparison: classifyComparison(exposure, terms),
    eligibilityReason: us
      ? "Reference only for a US jurisdiction. Polymarket International orders are rejected. A price gap versus a different resolution rule is not arbitrage. This row is synthetic, not a live book."
      : "No Polymarket International execution integration. Reference synthetic only, not a live book, and not arbitrage.",
    bidUsd: "0",
    askUsd: "0",
    requestedQuantity: request.requestedQuantity,
    availableQuantity: "0",
    estimatedAllInBuyCostUsd: "0",
    fees: zeroFees(),
    quotedAt,
    expiresAt,
    source: "synthetic",
    basisRiskDescription: "Different resolution rule from Switchboard service contracts. Not comparable as arbitrage.",
  };
}
