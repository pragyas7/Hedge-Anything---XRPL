import type { MarketQuote } from "@switchboard/contracts";
import { classifyComparison, type ComparabilityTerms } from "./comparability.js";
import type { Clock } from "./clock.js";
import { D, money } from "./money.js";
import { bestBid, priceAtSize, UNVERIFIED_VENUE_FEES, type BookLevel } from "./pricing.js";

interface KalshiMarket {
  ticker?: string;
  title?: string;
  rules_primary?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  yes_ask_size_fp?: string;
  expiration_time?: string;
  mve_collection_ticker?: string;
}

interface KalshiOrderbook {
  orderbook_fp?: {
    yes_dollars?: [string, string][];
    no_dollars?: [string, string][];
  };
}

/**
 * Implied YES asks from Kalshi NO bids. A NO bid at price p and size q is a YES ask at 1-p.
 * Public market data only. This does not apply a Kalshi fee schedule and cannot place orders.
 */
export function asksFromKalshiNoBids(noDollars: [string, string][] | undefined): BookLevel[] {
  const asks: BookLevel[] = [];
  for (const level of noDollars ?? []) {
    const [noPrice, size] = level;
    if (!noPrice || !size) continue;
    let yesPrice;
    let quantity;
    try {
      yesPrice = D(1).sub(D(noPrice));
      quantity = D(size);
    } catch {
      continue;
    }
    if (yesPrice.lte(0) || quantity.lte(0)) continue;
    asks.push({ priceUsd: money(yesPrice), quantity: money(quantity) });
  }
  asks.sort((a, b) => D(a.priceUsd).cmp(D(b.priceUsd)));
  return asks;
}

export async function loadKalshiReference(args: {
  baseUrl: string;
  series: string;
  timeoutMs: number;
  requestedQuantity: string;
  exposure: ComparabilityTerms;
  jurisdiction: string;
  clock: Clock;
  quoteTtlMs: number;
  fetchImpl?: typeof fetch;
}): Promise<MarketQuote | null> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const listUrl = `${args.baseUrl}/markets?limit=5&status=open&series_ticker=${encodeURIComponent(args.series)}`;
    const listed = await getJson<{ markets?: KalshiMarket[] }>(fetchImpl, listUrl, controller.signal);
    const market = (listed.markets ?? []).find((row) => row.ticker && row.rules_primary && row.title && !row.mve_collection_ticker);
    if (!market?.ticker || !market.rules_primary || !market.expiration_time) return null;

    let asks: BookLevel[] = [];
    let bids: BookLevel[] = [];
    try {
      const book = await getJson<KalshiOrderbook>(fetchImpl, `${args.baseUrl}/markets/${encodeURIComponent(market.ticker)}/orderbook?depth=10`, controller.signal);
      asks = asksFromKalshiNoBids(book.orderbook_fp?.no_dollars);
      bids = (book.orderbook_fp?.yes_dollars ?? [])
        .map(([priceUsd, quantity]) => ({ priceUsd, quantity }))
        .filter((level) => {
          try {
            return D(level.priceUsd).gt(0) && D(level.quantity).gt(0);
          } catch {
            return false;
          }
        });
    } catch {
      asks = [];
    }
    if (asks.length === 0 && market.yes_ask_dollars && market.yes_ask_size_fp) {
      try {
        if (D(market.yes_ask_dollars).gt(0) && D(market.yes_ask_size_fp).gt(0)) {
          asks = [{ priceUsd: money(D(market.yes_ask_dollars)), quantity: money(D(market.yes_ask_size_fp)) }];
        }
      } catch {
        return null;
      }
    }
    if (asks.length === 0) return null;

    const priced = priceAtSize(asks, args.requestedQuantity, UNVERIFIED_VENUE_FEES);
    const bid = bids.length > 0 ? bestBid(bids) : market.yes_bid_dollars && market.yes_bid_dollars !== "0.0000" ? money(D(market.yes_bid_dollars)) : "0";
    const now = args.clock.now();
    const quoteExpiry = new Date(Math.min(now.getTime() + args.quoteTtlMs, Date.parse(market.expiration_time))).toISOString();
    const candidate: ComparabilityTerms = {
      eventRule: market.rules_primary,
      resolutionSource: "Kalshi contract rules_primary",
      window: market.expiration_time,
      payoutUnit: "USD per Kalshi binary contract",
      side: "BUY",
      subject: "weather",
    };
    const comparison = classifyComparison(args.exposure, candidate);
    const quote: MarketQuote = {
      quoteId: `q_kalshi_${market.ticker}_${now.getTime()}`,
      instrument: {
        instrumentId: `kalshi_${market.ticker}`,
        venue: "kalshi",
        name: market.title ?? market.ticker,
        riskFactor: "weather_temperature",
        settlementType: "binary",
        eventRule: market.rules_primary,
        resolutionSourceUrl: `${args.baseUrl}/markets/${market.ticker}`,
        expiresAt: market.expiration_time,
        payoutPerUnitUsd: "1",
        maximumPayoutUsd: "1",
        collateralCurrency: "USD",
        unitDescription: "One Kalshi binary contract from the public read API. Not executable here.",
      },
      venue: "kalshi",
      capability: "read_only",
      comparison,
      eligibilityReason:
        "Read-only Kalshi public market data. No order credentials, so this quote is not executable and must not be shown as a fill. Category fees were not applied (zeros are not a Kalshi fee schedule). A weather contract is not arbitrage against a different resolution rule.",
      bidUsd: bid,
      askUsd: priced.bestAskUsd,
      requestedQuantity: args.requestedQuantity,
      availableQuantity: priced.availableQuantity,
      estimatedAllInBuyCostUsd: priced.estimatedAllInBuyCostUsd,
      fees: priced.fees,
      quotedAt: now.toISOString(),
      expiresAt: quoteExpiry,
      source: "live",
      basisRiskDescription:
        comparison === "direct"
          ? "Public Kalshi contract matches the compared terms. Still not executable in this service."
          : "Kalshi weather (or other) resolution does not match a service-outage, cost-cap, or capacity exposure unless every comparison term matches. Not arbitrage.",
    };
    void args.jurisdiction;
    return quote;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson<T>(fetchImpl: typeof fetch, url: string, signal: AbortSignal): Promise<T> {
  const response = await fetchImpl(url, { signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}
