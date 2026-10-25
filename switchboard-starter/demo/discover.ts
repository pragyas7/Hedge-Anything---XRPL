/**
 * Risk discovery for businesses the strategy templates do not cover.
 *
 * Claude reads a one-line description and the live Kalshi weather catalog, and returns the
 * business's exposures (with the non-obvious angle spelled out), editable scenarios, and which
 * real Kalshi series track each exposure. Choosing the contract and side that pays in the bad
 * outcome is plain code over Kalshi's own strike data, so the model never invents a market.
 *
 * Off unless ANTHROPIC_API_KEY is set. Every failure returns null and the caller falls back to
 * the template analyzer.
 */
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { CompanyAnalysisResponse, MarketQuote, RiskCategory, RiskExposure, Scenario } from "../packages/contracts/src/index.js";
import { PRECOMPUTED } from "./precomputed.js";

const MODEL = "claude-opus-5-5";
const KALSHI = (process.env.KALSHI_API_BASE ?? "https://external-api.kalshi.com/trade-api/v2").replace(/\/+$/, "");
const CATALOG_CATEGORY = "Climate and Weather";
const CATALOG_TTL_MS = 30 * 60_000;
const DISCOVERY_TIMEOUT_MS = 40_000;
const KALSHI_TIMEOUT_MS = 6_000;
const TICKER = /^[A-Z0-9][A-Z0-9.\-]{1,63}$/;

const CATEGORIES = ["operational", "digital", "climate", "commodity", "supply_chain", "regulatory", "financial", "other"] as const;

const DiscoverySchema = z.object({
  companyName: z.string(),
  exposures: z.array(z.object({
    label: z.string(),
    description: z.string(),
    category: z.enum(CATEGORIES),
    insight: z.string(),
    badOutcome: z.string(),
    direction: z.enum(["below", "above", "unclear"]),
    threshold: z.number().nullable(),
    seriesTickers: z.array(z.string()),
  })),
  scenarios: z.array(z.object({
    label: z.string(),
    probability: z.number(),
    lossUsd: z.number(),
    exposureIndex: z.number().transform((value) => Math.round(value)),
  })),
});

export type Discovery = z.infer<typeof DiscoverySchema>;

/** Same text, same key: lower case, letters and digits only. */
export function discoveryKey(description: string): string {
  return description.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export interface LiveMarketPick {
  ticker: string;
  side: "yes" | "no";
  exposureId: string;
  payIf: string;
}

export interface DiscoveryResult {
  analysis: CompanyAnalysisResponse;
  insights: Array<{ exposureId: string; label: string; insight: string; badOutcome: string }>;
  markets: LiveMarketPick[];
}

interface KalshiSeries { ticker?: string; title?: string; frequency?: string }
interface KalshiMarket {
  ticker?: string;
  title?: string;
  yes_sub_title?: string;
  rules_primary?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  yes_ask_size_fp?: string;
  expiration_time?: string;
  strike_type?: string;
  floor_strike?: number;
  cap_strike?: number;
  mve_collection_ticker?: string;
}

let catalogCache: { at: number; lines: string; tickers: Set<string> } | null = null;

export function discoveryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ANTHROPIC_API_KEY ?? "").trim().length > 0 && env.DISCOVERY_ENABLED !== "false";
}

async function kalshiJson<T>(path: string): Promise<T> {
  const response = await fetch(`${KALSHI}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(KALSHI_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Kalshi HTTP ${response.status}`);
  return await response.json() as T;
}

export async function weatherCatalog(): Promise<{ lines: string; tickers: Set<string> }> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache;
  const body = await kalshiJson<{ series?: KalshiSeries[] }>(`/series?category=${encodeURIComponent(CATALOG_CATEGORY)}`);
  const series = (body.series ?? []).filter((row) => row.ticker && row.title);
  // Sorted so the cached prompt prefix is byte-stable between calls.
  series.sort((a, b) => String(a.ticker).localeCompare(String(b.ticker)));
  const lines = series.map((row) => `${row.ticker} | ${row.title} | ${row.frequency ?? ""}`).join("\n");
  catalogCache = { at: Date.now(), lines, tickers: new Set(series.map((row) => String(row.ticker))) };
  return catalogCache;
}

const SYSTEM_PROMPT = [
  "You are the risk analyst inside Switchboard, which hedges what can break a business using prediction markets.",
  "Given a short business description, identify the two to four exposures that most move its monthly profit and loss.",
  "Lead with the non-obvious ones: the risk the owner would not list themselves. For each, write `insight` as one or two plain sentences a small-business owner understands, saying why it matters and why it is easy to miss.",
  "Prefer exposures that a market in the catalog below actually tracks: weather by city (daily highs and lows, monthly rain, snow), storms, hurricanes. For each exposure, list the series tickers from the catalog that track it, best match first, at most three, copied exactly. Leave the list empty when nothing in the catalog fits; do not stretch a weather market onto a non-weather risk.",
  "`direction` says whether the bad outcome is the measured value going `below` or `above` a level (an ice cream shop is hurt by a cold day: below). `threshold` is that level in the market's units (degrees Fahrenheit, inches) when you can name one, else null.",
  "`badOutcome` is one short phrase naming the bad case, with the city and measure, e.g. \"NYC daily high below 70°F\".",
  "Scenarios: three to five monthly scenarios, including one normal month with lossUsd 0 and exposureIndex -1. Every other scenario names the exposure it comes from by index. Probabilities are per month and sum to 1. Losses are realistic US dollars for the business's size; when the size is unstated, assume a small business and say nothing about it.",
  "Use the city the user names. If none is named, use the city in the catalog that best matches the jurisdiction, or New York.",
  "",
  "Kalshi weather catalog (ticker | title | frequency):",
].join("\n");

/** Plain JSON schema for structured output. Kept flat: no nullable or integer types. */
const DISCOVERY_JSON_SCHEMA = {
  type: "object",
  properties: {
    companyName: { type: "string" },
    exposures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          description: { type: "string" },
          category: { type: "string", enum: [...CATEGORIES] },
          insight: { type: "string" },
          badOutcome: { type: "string" },
          direction: { type: "string", enum: ["below", "above", "unclear"] },
          threshold: { type: "number" },
          hasThreshold: { type: "boolean" },
          seriesTickers: { type: "array", items: { type: "string" } },
        },
        required: ["label", "description", "category", "insight", "badOutcome", "direction", "threshold", "hasThreshold", "seriesTickers"],
        additionalProperties: false,
      },
    },
    scenarios: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          probability: { type: "number" },
          lossUsd: { type: "number" },
          exposureIndex: { type: "number" },
        },
        required: ["label", "probability", "lossUsd", "exposureIndex"],
        additionalProperties: false,
      },
    },
  },
  required: ["companyName", "exposures", "scenarios"],
  additionalProperties: false,
} as const;

export async function askClaude(
  input: { description: string; jurisdiction: string; budget: string; tail: string },
  catalog: string,
  timeoutMs = DISCOVERY_TIMEOUT_MS,
): Promise<Discovery | null> {
  const client = new Anthropic({ timeout: timeoutMs, maxRetries: 0 });
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    // Low effort keeps this inside a live demo and a Vercel function limit; the task is extraction, not search.
    output_config: { effort: "low", format: { type: "json_schema", schema: DISCOVERY_JSON_SCHEMA as unknown as Record<string, unknown> } },
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: catalog, cache_control: { type: "ephemeral" } },
    ],
    messages: [{
      role: "user",
      content: `Business: ${input.description}\nJurisdiction: ${input.jurisdiction}\nMonthly hedge budget: $${input.budget}\nLargest monthly loss they can absorb: $${input.tail}`,
    }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  // The flat schema carries hasThreshold; the rest of the code wants threshold or null.
  if (raw && typeof raw === "object" && Array.isArray((raw as { exposures?: unknown }).exposures)) {
    for (const exposure of (raw as { exposures: Array<Record<string, unknown>> }).exposures) {
      if (exposure.hasThreshold === false) exposure.threshold = null;
      delete exposure.hasThreshold;
    }
  }
  const parsed = DiscoverySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function stableId(prefix: string, material: string): string {
  return `${prefix}_${createHash("sha256").update(material).digest("hex").slice(0, 12)}`;
}

function roundMoney(value: number): string {
  return String(Math.max(0, Math.round(value)));
}

/** Turns the model's answer into a profile the strategy service accepts. */
function toAnalysis(input: { description: string; jurisdiction: string; budget: string; tail: string }, found: Discovery, tickers: Set<string>): DiscoveryResult | null {
  const exposuresIn = found.exposures.slice(0, 4);
  if (exposuresIn.length === 0) return null;
  const companyId = stableId("co_ai", `${input.jurisdiction}|${input.description.toLowerCase()}`);
  const exposureIds = exposuresIn.map((_, index) => `exp_ai_${index + 1}`);

  const risky = found.scenarios
    .filter((row) => row.exposureIndex >= 0 && row.exposureIndex < exposuresIn.length && row.lossUsd > 0 && row.probability > 0)
    .slice(0, 5);
  if (risky.length === 0) return null;
  let riskMass = risky.reduce((sum, row) => sum + row.probability, 0);
  // Keep at least half the mass on a normal month; scale bad months down if the model overshot.
  const scale = riskMass > 0.5 ? 0.5 / riskMass : 1;
  const scenarios: Scenario[] = risky.map((row, index) => ({
    scenarioId: `s_ai_${index + 1}`,
    label: row.label,
    probability: Math.round(row.probability * scale * 10000) / 10000,
    baselineLossUsd: roundMoney(row.lossUsd),
    factorShocks: Object.fromEntries(exposureIds.map((id, exposureIndex) => [id, exposureIndex === row.exposureIndex ? 1 : 0])),
    source: "synthetic",
  }));
  riskMass = scenarios.reduce((sum, row) => sum + row.probability, 0);
  scenarios.unshift({
    scenarioId: "s_ai_normal",
    label: found.scenarios.find((row) => row.exposureIndex < 0)?.label || "Normal month",
    probability: Math.round((1 - riskMass) * 10000) / 10000,
    baselineLossUsd: "0",
    factorShocks: Object.fromEntries(exposureIds.map((id) => [id, 0])),
    source: "synthetic",
  });

  const exposures: RiskExposure[] = exposuresIn.map((row, index) => ({
    exposureId: exposureIds[index]!,
    category: row.category as RiskCategory,
    label: row.label,
    description: row.description,
    riskFactors: [exposureIds[index]!],
    horizonDays: 30,
    scenarioIds: scenarios.filter((scenario) => scenario.factorShocks[exposureIds[index]!] === 1).map((scenario) => scenario.scenarioId),
    confidence: 0.5,
  }));

  return {
    analysis: {
      company: {
        companyId,
        name: found.companyName.trim() || "Your business",
        description: input.description,
        jurisdiction: input.jurisdiction,
        baseCurrency: "USD",
        monthlyHedgeBudgetUsd: input.budget,
        maxTolerableTailLossUsd: input.tail,
        cvarAlpha: 0.95,
        exposures,
        scenarios,
        confirmedByUser: false,
      },
      assumptions: [
        `Provenance: exposures and scenarios proposed by ${MODEL} from your description; edit them before you confirm.`,
        "Losses and chances are estimates for a business of this kind, not your books.",
      ],
      warnings: ["confirmedByUser is false until you confirm the scenarios."],
    },
    insights: exposuresIn.map((row, index) => ({ exposureId: exposureIds[index]!, label: row.label, insight: row.insight, badOutcome: row.badOutcome })),
    markets: [],
  };
}

/** The side of a binary market that pays when the measured value lands on the bad side. */
function sideFor(market: KalshiMarket, direction: "below" | "above"): "yes" | "no" | null {
  if (market.strike_type === "less") return direction === "below" ? "yes" : "no";
  if (market.strike_type === "greater") return direction === "above" ? "yes" : "no";
  return null;
}

function strikeOf(market: KalshiMarket): number | null {
  if (market.strike_type === "less" && typeof market.cap_strike === "number") return market.cap_strike;
  if (market.strike_type === "greater" && typeof market.floor_strike === "number") return market.floor_strike;
  return null;
}

/** Picks up to two open contracts per exposure that pay in its bad outcome. Kalshi strike data only. */
async function pickMarkets(found: Discovery, exposureIds: string[], tickers: Set<string>): Promise<LiveMarketPick[]> {
  const picks: LiveMarketPick[] = [];
  await Promise.all(found.exposures.slice(0, 4).map(async (exposure, index) => {
    if (exposure.direction === "unclear") return;
    const direction = exposure.direction;
    for (const series of exposure.seriesTickers.filter((ticker) => tickers.has(ticker)).slice(0, 3)) {
      let markets: KalshiMarket[] = [];
      try {
        markets = (await kalshiJson<{ markets?: KalshiMarket[] }>(`/markets?series_ticker=${encodeURIComponent(series)}&status=open&limit=50`)).markets ?? [];
      } catch {
        continue;
      }
      const usable = markets
        .filter((market) => market.ticker && TICKER.test(market.ticker) && !market.mve_collection_ticker && sideFor(market, direction) && strikeOf(market) !== null)
        .map((market) => ({ market, side: sideFor(market, direction)!, strike: strikeOf(market)! }))
        .filter(({ market, side }) => Number((side === "yes" ? market.yes_ask_dollars : market.no_ask_dollars) ?? "0") > 0 && Number((side === "yes" ? market.yes_ask_dollars : market.no_ask_dollars) ?? "1") < 1);
      const target = exposure.threshold;
      // A contract only counts if its strike is near the risk: a 72°F contract is not a 97°F heat wave.
      const near = target === null ? usable : usable.filter(({ strike }) => Math.abs(strike - target) <= Math.max(3, Math.abs(target) * 0.15));
      usable.splice(0, usable.length, ...near);
      if (usable.length === 0) continue;
      usable.sort((a, b) => {
        const expiry = Date.parse(a.market.expiration_time ?? "") - Date.parse(b.market.expiration_time ?? "");
        if (expiry !== 0 && Number.isFinite(expiry)) return expiry;
        if (target === null) return 0;
        return Math.abs(a.strike - target) - Math.abs(b.strike - target);
      });
      const chosen = target === null ? usable.slice(0, 1) : usable
        .filter((row) => row.market.expiration_time === usable[0]!.market.expiration_time)
        .sort((a, b) => Math.abs(a.strike - target) - Math.abs(b.strike - target))
        .slice(0, 1);
      for (const { market, side } of chosen) {
        const condition = market.yes_sub_title ?? market.title ?? market.ticker!;
        picks.push({ ticker: market.ticker!, side, exposureId: exposureIds[index]!, payIf: side === "yes" ? condition : `not ${condition}` });
      }
      if (picks.filter((pick) => pick.exposureId === exposureIds[index]).length >= 2) break;
    }
  }));
  return picks.slice(0, 6);
}

/** True when the description has a saved Claude answer, so the page can skip the long wait. */
export function hasPrecomputed(description: string): boolean {
  return Boolean(PRECOMPUTED[discoveryKey(description)]);
}

export async function discoverRisks(input: { description: string; jurisdiction: string; budget: string; tail: string }): Promise<DiscoveryResult | null> {
  try {
    const catalog = await weatherCatalog();
    // A saved answer for a demo example skips the model call. Kalshi markets are still fetched live below.
    const saved = PRECOMPUTED[discoveryKey(input.description)];
    const found = saved ? saved.discovery : await askClaude(input, catalog.lines);
    if (!found) return null;
    const result = toAnalysis(input, found, catalog.tickers);
    if (!result) return null;
    if (saved) {
      result.analysis.assumptions[0] = `Provenance: exposures and scenarios proposed by ${MODEL} on ${saved.generatedAt.slice(0, 10)} for this exact description and saved for the demo; edit them before you confirm. Kalshi prices are live.`;
    }
    result.markets = await pickMarkets(found, result.analysis.company.exposures.map((row) => row.exposureId), catalog.tickers);
    return result;
  } catch (error) {
    if (process.env.DISCOVERY_DEBUG === "1") console.error("[discovery]", error);
    return null;
  }
}

/** Live, read-only quotes for picked Kalshi contracts, fetched fresh by ticker. Never trusts client prices. */
export async function liveQuotes(picks: unknown, requestedQuantity: string): Promise<MarketQuote[]> {
  if (!Array.isArray(picks)) return [];
  const valid = picks
    .filter((row): row is LiveMarketPick => !!row && typeof row === "object"
      && typeof (row as LiveMarketPick).ticker === "string" && TICKER.test((row as LiveMarketPick).ticker)
      && ((row as LiveMarketPick).side === "yes" || (row as LiveMarketPick).side === "no"))
    .slice(0, 6);
  const now = new Date();
  const quotes = await Promise.all(valid.map(async (pick): Promise<MarketQuote | null> => {
    try {
      const { market } = await kalshiJson<{ market?: KalshiMarket }>(`/markets/${encodeURIComponent(pick.ticker)}`);
      if (!market?.ticker || !market.expiration_time) return null;
      const ask = pick.side === "yes" ? market.yes_ask_dollars : market.no_ask_dollars;
      const bid = pick.side === "yes" ? market.yes_bid_dollars : market.no_bid_dollars;
      if (!ask || Number(ask) <= 0 || Number(ask) >= 1) return null;
      const condition = market.yes_sub_title ?? market.title ?? market.ticker;
      const payIf = pick.side === "yes" ? condition : `not ${condition}`;
      const quantity = requestedQuantity;
      const cost = (Number(ask) * Number(quantity)).toFixed(2);
      return {
        quoteId: `q_kalshi_${market.ticker}_${pick.side}_${now.getTime()}`,
        instrument: {
          instrumentId: `kalshi_${market.ticker}_${pick.side}`,
          venue: "kalshi",
          name: `${pick.side === "yes" ? "YES" : "NO"}: ${market.title ?? market.ticker}`,
          riskFactor: pick.exposureId,
          settlementType: "binary",
          eventRule: `Pays $1 per contract if ${payIf}. ${market.rules_primary ?? ""}`.trim(),
          resolutionSourceUrl: `${KALSHI}/markets/${market.ticker}`,
          expiresAt: market.expiration_time,
          payoutPerUnitUsd: "1",
          maximumPayoutUsd: "1",
          collateralCurrency: "USD",
          unitDescription: "One Kalshi binary contract, from Kalshi's public read API. Not executable here.",
        },
        venue: "kalshi",
        capability: "read_only",
        comparison: "proxy",
        eligibilityReason: "Live Kalshi public price. Read only: Switchboard does not place orders on Kalshi, so this is not part of the sandbox hedge.",
        bidUsd: bid && Number(bid) > 0 ? Number(bid).toFixed(2) : "0",
        askUsd: Number(ask).toFixed(2),
        requestedQuantity: quantity,
        availableQuantity: pick.side === "yes" && market.yes_ask_size_fp ? String(Math.floor(Number(market.yes_ask_size_fp))) : quantity,
        estimatedAllInBuyCostUsd: cost,
        fees: { tradingFeeUsd: "0", networkFeeUsd: "0", conversionFeeUsd: "0", modeledSlippageUsd: "0", otherFeeUsd: "0" },
        quotedAt: now.toISOString(),
        expiresAt: new Date(Math.min(now.getTime() + 15 * 60_000, Date.parse(market.expiration_time))).toISOString(),
        source: "live",
        basisRiskDescription: `Pays if ${payIf}. Your loss depends on more than this one measurement, so it offsets part of the bad case, not all of it.`,
      };
    } catch {
      return null;
    }
  }));
  return quotes.filter((quote): quote is MarketQuote => quote !== null);
}
