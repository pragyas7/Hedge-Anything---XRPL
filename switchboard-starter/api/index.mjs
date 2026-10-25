var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target2, all) => {
  for (var name in all)
    __defProp(target2, name, { get: all[name], enumerable: true });
};

// services/execution/src/ap4m-chain.ts
var ap4m_chain_exports = {};
__export(ap4m_chain_exports, {
  REDEEMED_TOPIC: () => REDEEMED_TOPIC,
  VOUCHER_REDEEMED_EVENT: () => VOUCHER_REDEEMED_EVENT,
  redeemAp4mVoucher: () => redeemAp4mVoucher,
  signInToAp4m: () => signInToAp4m
});
import { Contract, JsonRpcProvider, Wallet, id, parseUnits } from "ethers";
async function readJson(response) {
  const text2 = await response.text();
  const parsed = text2 ? JSON.parse(text2) : {};
  return parsed && typeof parsed === "object" ? parsed : {};
}
async function signInToAp4m(input) {
  const wallet = new Wallet(input.privateKey);
  const address = await wallet.getAddress();
  const challengeResp = await input.fetchImpl(`${input.apiUrl}/public/participant/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ teamName: input.teamName, wallet: address })
  });
  const challenge = await readJson(challengeResp);
  if (!challengeResp.ok || typeof challenge.message !== "string" || typeof challenge.challengeId !== "string") {
    throw new Error(`AP4M sign-in challenge failed with HTTP ${challengeResp.status}.`);
  }
  const signature = await wallet.signMessage(challenge.message);
  const sessionResp = await input.fetchImpl(`${input.apiUrl}/public/participant/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challengeId: challenge.challengeId, signature })
  });
  const session = await readJson(sessionResp);
  if (!sessionResp.ok || typeof session.token !== "string") {
    throw new Error(`AP4M sign-in failed with HTTP ${sessionResp.status}.`);
  }
  return { token: session.token };
}
async function redeemAp4mVoucher(input) {
  const provider = new JsonRpcProvider(input.rpcUrl);
  const wallet = new Wallet(input.privateKey, provider);
  const headers = { "content-type": "application/json", authorization: `Bearer ${input.token}` };
  let channelId = input.channelId;
  if (!channelId) {
    if (!input.capRlusd) throw new Error("AP4M_CHANNEL_ID or AP4M_CHANNEL_CAP is required.");
    const prepareResp = await input.fetchImpl(`${input.apiUrl}/public/participant/channel-requests/prepare`, {
      method: "POST",
      headers,
      body: JSON.stringify({ cap_rlusd: input.capRlusd, merchant_id: input.merchantId })
    });
    const prepared = await readJson(prepareResp);
    if (!prepareResp.ok || typeof prepared.to !== "string" || typeof prepared.data !== "string") {
      throw new Error(`AP4M channel prepare failed with HTTP ${prepareResp.status}.`);
    }
    const openTx = await wallet.sendTransaction({ to: prepared.to, data: prepared.data });
    await openTx.wait();
    const recordResp = await input.fetchImpl(`${input.apiUrl}/public/participant/channel-requests`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tx_hash: openTx.hash })
    });
    const recorded = await readJson(recordResp);
    if (!recordResp.ok || typeof recorded.channel_id !== "string") {
      throw new Error(`Channel open was sent as ${openTx.hash} but was not recorded.`);
    }
    channelId = recorded.channel_id;
  }
  const contract = new Contract(input.ledgerAddress, LEDGER_ABI, wallet);
  const channel = await contract.channels(channelId);
  const redeemed = channel[8];
  const cumulative = redeemed + parseUnits(input.priceRlusd, 18);
  const chainId = (await provider.getNetwork()).chainId;
  const signature = await wallet.signTypedData(
    { name: "AP4M Payment Ledger", version: "1", chainId, verifyingContract: input.ledgerAddress },
    { Voucher: [{ name: "channelId", type: "bytes32" }, { name: "cumulativeAmount", type: "uint256" }] },
    { channelId, cumulativeAmount: cumulative }
  );
  const tx = await contract.redeemVoucher({ channelId, cumulativeAmount: cumulative }, signature);
  const receipt = await tx.wait();
  const log = receipt?.logs?.find((entry) => entry.address.toLowerCase() === input.ledgerAddress.toLowerCase() && entry.topics[0] === REDEEMED_TOPIC);
  if (!log) {
    throw new Error(`Transaction ${receipt?.hash ?? tx.hash} did not contain VoucherRedeemed.`);
  }
  return { txHash: receipt?.hash ?? tx.hash, channelId };
}
var LEDGER_ABI, VOUCHER_REDEEMED_EVENT, REDEEMED_TOPIC;
var init_ap4m_chain = __esm({
  "services/execution/src/ap4m-chain.ts"() {
    "use strict";
    LEDGER_ABI = [
      "function redeemVoucher((bytes32 channelId, uint256 cumulativeAmount) voucher, bytes agentSignature) returns (bytes32 claimId, uint256 amount, bytes32 digest)",
      "function channels(bytes32 channelId) view returns (bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,address,uint64,uint8,address,uint64,address,uint64,uint64,uint64)"
    ];
    VOUCHER_REDEEMED_EVENT = "VoucherRedeemed(bytes32,bytes32,bytes32,bytes32,address,bytes32,address,address,uint256,uint256,uint256)";
    REDEEMED_TOPIC = id(VOUCHER_REDEEMED_EVENT);
  }
});

// demo/vercel-entry.ts
import "canonicalize";
import "decimal.js";
import "ethers";
import "fastify";
import "jose";

// demo/app.ts
import { randomUUID as randomUUID9 } from "node:crypto";
import { request as httpRequest } from "node:http";
import { Decimal as Decimal5 } from "decimal.js";
import Fastify4 from "fastify";

// demo/discover.ts
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// demo/precomputed.ts
var PRECOMPUTED = {
  "ice cream shop in new york": {
    "generatedAt": "2026-10-25T16:43:45.486Z",
    "model": "claude-opus-5-5",
    "discovery": {
      "companyName": "Ice cream shop (New York)",
      "exposures": [
        {
          "label": "Rainy weekends and wet months",
          "description": "Rain kills walk-in foot traffic, especially on weekend evenings when most sales happen.",
          "category": "climate",
          "insight": "Owners think about cold, but a wet month can hurt more than a cool one because people simply don't walk past your window. A few rainy Saturdays can wipe out a big share of the month's profit.",
          "badOutcome": "NYC monthly rain above 5 inches",
          "direction": "above",
          "threshold": 5,
          "seriesTickers": [
            "KXRAINNYCM",
            "KXRAINDNYC",
            "KXRAINNYCW"
          ]
        },
        {
          "label": "Cool summer days",
          "description": "Daily highs below seasonal norms cut cone and pint sales sharply.",
          "category": "climate",
          "insight": "Sales fall off fast when the high drops below about 75\xB0F. A cool stretch in June or August means lower sales while you still pay full staff and rent.",
          "badOutcome": "NYC daily high below 75\xB0F",
          "direction": "below",
          "threshold": 75,
          "seriesTickers": [
            "KXHIGHNY",
            "KXWEEKHTNYC",
            "KXTEMPNYCH"
          ]
        },
        {
          "label": "Extreme heat straining freezers and power",
          "description": "Heat waves push freezers and compressors to failure and raise the risk of grid outages that melt inventory.",
          "category": "operational",
          "insight": "A very hot day sounds like a great sales day, but above about 97\xB0F old freezers struggle and blackouts get more likely. One failure can spoil thousands of dollars of product overnight.",
          "badOutcome": "NYC daily high above 97\xB0F",
          "direction": "above",
          "threshold": 97,
          "seriesTickers": [
            "KXHIGHNY",
            "KXHEATWARNING"
          ]
        },
        {
          "label": "Dairy and sugar cost spikes",
          "description": "Cream and butterfat prices swing and squeeze margins.",
          "category": "commodity",
          "insight": "Cream prices can jump 20\u201330% in a season, and most shops don't raise menu prices fast enough to keep up.",
          "badOutcome": "Wholesale cream prices spike",
          "direction": "above",
          "threshold": null,
          "seriesTickers": []
        }
      ],
      "scenarios": [
        {
          "label": "Normal month",
          "probability": 0.6,
          "lossUsd": 0,
          "exposureIndex": -1
        },
        {
          "label": "Very wet month with rainy weekends",
          "probability": 0.15,
          "lossUsd": 5e3,
          "exposureIndex": 0
        },
        {
          "label": "Cool stretch in peak season",
          "probability": 0.15,
          "lossUsd": 4e3,
          "exposureIndex": 1
        },
        {
          "label": "Heat wave freezer failure or outage",
          "probability": 0.05,
          "lossUsd": 7e3,
          "exposureIndex": 2
        },
        {
          "label": "Dairy cost spike",
          "probability": 0.05,
          "lossUsd": 2500,
          "exposureIndex": 3
        }
      ]
    }
  }
};

// demo/discover.ts
var MODEL = "claude-opus-5-5";
var KALSHI = (process.env.KALSHI_API_BASE ?? "https://external-api.kalshi.com/trade-api/v2").replace(/\/+$/, "");
var CATALOG_CATEGORY = "Climate and Weather";
var CATALOG_TTL_MS = 30 * 6e4;
var DISCOVERY_TIMEOUT_MS = 4e4;
var KALSHI_TIMEOUT_MS = 6e3;
var TICKER = /^[A-Z0-9][A-Z0-9.\-]{1,63}$/;
var CATEGORIES = ["operational", "digital", "climate", "commodity", "supply_chain", "regulatory", "financial", "other"];
var DiscoverySchema = z.object({
  companyName: z.string(),
  exposures: z.array(z.object({
    label: z.string(),
    description: z.string(),
    category: z.enum(CATEGORIES),
    insight: z.string(),
    badOutcome: z.string(),
    direction: z.enum(["below", "above", "unclear"]),
    threshold: z.number().nullable(),
    seriesTickers: z.array(z.string())
  })),
  scenarios: z.array(z.object({
    label: z.string(),
    probability: z.number(),
    lossUsd: z.number(),
    exposureIndex: z.number().transform((value) => Math.round(value))
  }))
});
function discoveryKey(description) {
  return description.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
var catalogCache = null;
function discoveryEnabled(env = process.env) {
  return (env.ANTHROPIC_API_KEY ?? "").trim().length > 0 && env.DISCOVERY_ENABLED !== "false";
}
async function kalshiJson(path3) {
  const response = await fetch(`${KALSHI}${path3}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(KALSHI_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Kalshi HTTP ${response.status}`);
  return await response.json();
}
async function weatherCatalog() {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache;
  const body = await kalshiJson(`/series?category=${encodeURIComponent(CATALOG_CATEGORY)}`);
  const series = (body.series ?? []).filter((row) => row.ticker && row.title);
  series.sort((a, b) => String(a.ticker).localeCompare(String(b.ticker)));
  const lines = series.map((row) => `${row.ticker} | ${row.title} | ${row.frequency ?? ""}`).join("\n");
  catalogCache = { at: Date.now(), lines, tickers: new Set(series.map((row) => String(row.ticker))) };
  return catalogCache;
}
var SYSTEM_PROMPT = [
  "You are the risk analyst inside Switchboard, which hedges what can break a business using prediction markets.",
  "Given a short business description, identify the two to four exposures that most move its monthly profit and loss.",
  "Lead with the non-obvious ones: the risk the owner would not list themselves. For each, write `insight` as one or two plain sentences a small-business owner understands, saying why it matters and why it is easy to miss.",
  "Prefer exposures that a market in the catalog below actually tracks: weather by city (daily highs and lows, monthly rain, snow), storms, hurricanes. For each exposure, list the series tickers from the catalog that track it, best match first, at most three, copied exactly. Leave the list empty when nothing in the catalog fits; do not stretch a weather market onto a non-weather risk.",
  "`direction` says whether the bad outcome is the measured value going `below` or `above` a level (an ice cream shop is hurt by a cold day: below). `threshold` is that level in the market's units (degrees Fahrenheit, inches) when you can name one, else null.",
  '`badOutcome` is one short phrase naming the bad case, with the city and measure, e.g. "NYC daily high below 70\xB0F".',
  "Scenarios: three to five monthly scenarios, including one normal month with lossUsd 0 and exposureIndex -1. Every other scenario names the exposure it comes from by index. Probabilities are per month and sum to 1. Losses are realistic US dollars for the business's size; when the size is unstated, assume a small business and say nothing about it.",
  "Use the city the user names. If none is named, use the city in the catalog that best matches the jurisdiction, or New York.",
  "",
  "Kalshi weather catalog (ticker | title | frequency):"
].join("\n");
var DISCOVERY_JSON_SCHEMA = {
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
          seriesTickers: { type: "array", items: { type: "string" } }
        },
        required: ["label", "description", "category", "insight", "badOutcome", "direction", "threshold", "hasThreshold", "seriesTickers"],
        additionalProperties: false
      }
    },
    scenarios: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          probability: { type: "number" },
          lossUsd: { type: "number" },
          exposureIndex: { type: "number" }
        },
        required: ["label", "probability", "lossUsd", "exposureIndex"],
        additionalProperties: false
      }
    }
  },
  required: ["companyName", "exposures", "scenarios"],
  additionalProperties: false
};
async function askClaude(input, catalog, timeoutMs = DISCOVERY_TIMEOUT_MS) {
  const client = new Anthropic({ timeout: timeoutMs, maxRetries: 0 });
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16e3,
    // Low effort keeps this inside a live demo and a Vercel function limit; the task is extraction, not search.
    output_config: { effort: "low", format: { type: "json_schema", schema: DISCOVERY_JSON_SCHEMA } },
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: catalog, cache_control: { type: "ephemeral" } }
    ],
    messages: [{
      role: "user",
      content: `Business: ${input.description}
Jurisdiction: ${input.jurisdiction}
Monthly hedge budget: $${input.budget}
Largest monthly loss they can absorb: $${input.tail}`
    }]
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text2 = message.content.map((block) => block.type === "text" ? block.text : "").join("");
  let raw;
  try {
    raw = JSON.parse(text2);
  } catch {
    return null;
  }
  if (raw && typeof raw === "object" && Array.isArray(raw.exposures)) {
    for (const exposure of raw.exposures) {
      if (exposure.hasThreshold === false) exposure.threshold = null;
      delete exposure.hasThreshold;
    }
  }
  const parsed = DiscoverySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
function stableId(prefix, material) {
  return `${prefix}_${createHash("sha256").update(material).digest("hex").slice(0, 12)}`;
}
function roundMoney(value) {
  return String(Math.max(0, Math.round(value)));
}
function toAnalysis(input, found, tickers) {
  const exposuresIn = found.exposures.slice(0, 4);
  if (exposuresIn.length === 0) return null;
  const companyId = stableId("co_ai", `${input.jurisdiction}|${input.description.toLowerCase()}`);
  const exposureIds = exposuresIn.map((_, index) => `exp_ai_${index + 1}`);
  const risky = found.scenarios.filter((row) => row.exposureIndex >= 0 && row.exposureIndex < exposuresIn.length && row.lossUsd > 0 && row.probability > 0).slice(0, 5);
  if (risky.length === 0) return null;
  let riskMass = risky.reduce((sum, row) => sum + row.probability, 0);
  const scale = riskMass > 0.5 ? 0.5 / riskMass : 1;
  const scenarios = risky.map((row, index) => ({
    scenarioId: `s_ai_${index + 1}`,
    label: row.label,
    probability: Math.round(row.probability * scale * 1e4) / 1e4,
    baselineLossUsd: roundMoney(row.lossUsd),
    factorShocks: Object.fromEntries(exposureIds.map((id2, exposureIndex) => [id2, exposureIndex === row.exposureIndex ? 1 : 0])),
    source: "synthetic"
  }));
  riskMass = scenarios.reduce((sum, row) => sum + row.probability, 0);
  scenarios.unshift({
    scenarioId: "s_ai_normal",
    label: found.scenarios.find((row) => row.exposureIndex < 0)?.label || "Normal month",
    probability: Math.round((1 - riskMass) * 1e4) / 1e4,
    baselineLossUsd: "0",
    factorShocks: Object.fromEntries(exposureIds.map((id2) => [id2, 0])),
    source: "synthetic"
  });
  const exposures = exposuresIn.map((row, index) => ({
    exposureId: exposureIds[index],
    category: row.category,
    label: row.label,
    description: row.description,
    riskFactors: [exposureIds[index]],
    horizonDays: 30,
    scenarioIds: scenarios.filter((scenario) => scenario.factorShocks[exposureIds[index]] === 1).map((scenario) => scenario.scenarioId),
    confidence: 0.5
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
        confirmedByUser: false
      },
      assumptions: [
        `Provenance: exposures and scenarios proposed by ${MODEL} from your description; edit them before you confirm.`,
        "Losses and chances are estimates for a business of this kind, not your books."
      ],
      warnings: ["confirmedByUser is false until you confirm the scenarios."]
    },
    insights: exposuresIn.map((row, index) => ({ exposureId: exposureIds[index], label: row.label, insight: row.insight, badOutcome: row.badOutcome })),
    markets: []
  };
}
function sideFor(market, direction) {
  if (market.strike_type === "less") return direction === "below" ? "yes" : "no";
  if (market.strike_type === "greater") return direction === "above" ? "yes" : "no";
  return null;
}
function strikeOf(market) {
  if (market.strike_type === "less" && typeof market.cap_strike === "number") return market.cap_strike;
  if (market.strike_type === "greater" && typeof market.floor_strike === "number") return market.floor_strike;
  return null;
}
async function pickMarkets(found, exposureIds, tickers) {
  const picks = [];
  await Promise.all(found.exposures.slice(0, 4).map(async (exposure, index) => {
    if (exposure.direction === "unclear") return;
    const direction = exposure.direction;
    for (const series of exposure.seriesTickers.filter((ticker) => tickers.has(ticker)).slice(0, 3)) {
      let markets = [];
      try {
        markets = (await kalshiJson(`/markets?series_ticker=${encodeURIComponent(series)}&status=open&limit=50`)).markets ?? [];
      } catch {
        continue;
      }
      const usable = markets.filter((market) => market.ticker && TICKER.test(market.ticker) && !market.mve_collection_ticker && sideFor(market, direction) && strikeOf(market) !== null).map((market) => ({ market, side: sideFor(market, direction), strike: strikeOf(market) })).filter(({ market, side }) => Number((side === "yes" ? market.yes_ask_dollars : market.no_ask_dollars) ?? "0") > 0 && Number((side === "yes" ? market.yes_ask_dollars : market.no_ask_dollars) ?? "1") < 1);
      const target2 = exposure.threshold;
      const near = target2 === null ? usable : usable.filter(({ strike }) => Math.abs(strike - target2) <= Math.max(3, Math.abs(target2) * 0.15));
      usable.splice(0, usable.length, ...near);
      if (usable.length === 0) continue;
      usable.sort((a, b) => {
        const expiry = Date.parse(a.market.expiration_time ?? "") - Date.parse(b.market.expiration_time ?? "");
        if (expiry !== 0 && Number.isFinite(expiry)) return expiry;
        if (target2 === null) return 0;
        return Math.abs(a.strike - target2) - Math.abs(b.strike - target2);
      });
      const chosen = target2 === null ? usable.slice(0, 1) : usable.filter((row) => row.market.expiration_time === usable[0].market.expiration_time).sort((a, b) => Math.abs(a.strike - target2) - Math.abs(b.strike - target2)).slice(0, 1);
      for (const { market, side } of chosen) {
        const condition = market.yes_sub_title ?? market.title ?? market.ticker;
        picks.push({ ticker: market.ticker, side, exposureId: exposureIds[index], payIf: side === "yes" ? condition : `not ${condition}` });
      }
      if (picks.filter((pick) => pick.exposureId === exposureIds[index]).length >= 2) break;
    }
  }));
  return picks.slice(0, 6);
}
async function discoverRisks(input) {
  try {
    const catalog = await weatherCatalog();
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
async function liveQuotes(picks, requestedQuantity) {
  if (!Array.isArray(picks)) return [];
  const valid = picks.filter((row) => !!row && typeof row === "object" && typeof row.ticker === "string" && TICKER.test(row.ticker) && (row.side === "yes" || row.side === "no")).slice(0, 6);
  const now = /* @__PURE__ */ new Date();
  const quotes = await Promise.all(valid.map(async (pick) => {
    try {
      const { market } = await kalshiJson(`/markets/${encodeURIComponent(pick.ticker)}`);
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
          unitDescription: "One Kalshi binary contract, from Kalshi's public read API. Not executable here."
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
        expiresAt: new Date(Math.min(now.getTime() + 15 * 6e4, Date.parse(market.expiration_time))).toISOString(),
        source: "live",
        basisRiskDescription: `Pays if ${payIf}. Your loss depends on more than this one measurement, so it offsets part of the bad case, not all of it.`
      };
    } catch {
      return null;
    }
  }));
  return quotes.filter((quote) => quote !== null);
}

// demo/ledger.ts
var MEMO_TYPE = "switchboard/plan-approval";
var DEFAULT_PATH = "44'/144'/0'/0/0";
var DEFAULT_WSS = "wss://s.altnet.rippletest.net:51233";
var FAUCET = "https://faucet.altnet.rippletest.net/accounts";
var SIGN_TIMEOUT_MS = 18e4;
function ledgerConfig(env = process.env) {
  const url = (env.LEDGER_SPECULOS_URL ?? "").trim().replace(/\/+$/, "");
  if (!url) return null;
  return {
    url,
    model: (env.LEDGER_SPECULOS_MODEL ?? "STAX").trim().toUpperCase(),
    path: (env.LEDGER_DERIVATION_PATH ?? DEFAULT_PATH).trim(),
    wss: (env.XRPL_TESTNET_WSS ?? DEFAULT_WSS).trim()
  };
}
var debug = (step, detail = "") => {
  if (process.env.LEDGER_DEBUG === "1") console.error(`[ledger] ${(/* @__PURE__ */ new Date()).toISOString().slice(11, 23)} ${step} ${detail}`);
};
var hexOf = (text2) => Buffer.from(text2, "utf8").toString("hex").toUpperCase();
var textOf = (hex) => typeof hex === "string" ? Buffer.from(hex, "hex").toString("utf8") : "";
async function verifyApprovalTx(signedBlob, expected) {
  const xrpl = await import("xrpl");
  let tx;
  try {
    tx = xrpl.decode(signedBlob);
  } catch {
    return { ok: false, reason: "The signed transaction could not be decoded." };
  }
  if (tx.TransactionType !== "AccountSet") return { ok: false, reason: "The device signed something other than the approval transaction." };
  if (tx.Account !== expected.address) return { ok: false, reason: "The signing account is not the Ledger account." };
  const signingKey = String(tx.SigningPubKey ?? "").toUpperCase();
  if (signingKey !== expected.publicKey.toUpperCase()) return { ok: false, reason: "The signing key is not the Ledger key." };
  if (xrpl.deriveAddress(signingKey) !== expected.address) return { ok: false, reason: "The signing key does not belong to the Ledger account." };
  const memos = Array.isArray(tx.Memos) ? tx.Memos : [];
  const memo = memos.find((entry) => textOf(entry.Memo?.MemoType) === MEMO_TYPE)?.Memo;
  if (!memo || textOf(memo.MemoData) !== expected.planHash) return { ok: false, reason: "The signed memo is not this plan's hash." };
  let signatureOk = false;
  try {
    signatureOk = xrpl.verifySignature(signedBlob, signingKey);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return { ok: false, reason: "The signature does not verify." };
  return { ok: true, reason: "Signature, account, key, and plan hash all match." };
}
async function finish(action, timeoutMs) {
  const { firstValueFrom, filter, timeout } = await import("rxjs");
  try {
    const result = await firstValueFrom(action.observable.pipe(
      filter((state) => state.status === "completed" || state.status === "error"),
      timeout(timeoutMs)
    ));
    if (result.status === "error") {
      const message = result.error && typeof result.error === "object" && "message" in result.error ? String(result.error.message) : "The device reported an error.";
      throw new Error(/rejected by user/i.test(message) ? "The approval was rejected on the Ledger." : message);
    }
    return result.output;
  } catch (error) {
    debug("device action failed", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    action.cancel();
    if (error instanceof Error && error.name === "TimeoutError") throw new Error("Nobody approved on the device in time. Nothing was signed.");
    throw error;
  }
}
var LedgerApprover = class {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }
  signer = null;
  account = null;
  busy = false;
  async connect() {
    if (this.signer && this.account) return { signer: this.signer, ...this.account };
    await this.clearPendingReview().catch(() => void 0);
    const dmkMod = await import("@ledgerhq/device-management-kit");
    const { SignerXrpBuilder } = await import("@ledgerhq/device-signer-kit-xrp");
    const { speculosTransportFactory, speculosIdentifier } = await import("@ledgerhq/device-transport-kit-speculos");
    const { firstValueFrom, timeout } = await import("rxjs");
    const model = dmkMod.DeviceModelId[this.config.model] ?? dmkMod.DeviceModelId.STAX;
    const dmk = new dmkMod.DeviceManagementKitBuilder().addTransport(speculosTransportFactory(this.config.url, false, model)).build();
    const device = await firstValueFrom(dmk.startDiscovering({ transport: speculosIdentifier }).pipe(timeout(1e4)));
    const sessionId = await dmk.connect({ device });
    const signer = new SignerXrpBuilder({ dmk, sessionId }).build();
    const output = await finish(signer.getAddress(this.config.path, { checkOnDevice: false }), 3e4);
    this.signer = signer;
    this.account = { address: output.address, publicKey: output.publicKey.toUpperCase() };
    return { signer, ...this.account };
  }
  async status() {
    const base = { enabled: true, emulator: true, model: this.config.model };
    try {
      const response = await this.fetchImpl(this.config.url, { signal: AbortSignal.timeout(2e3) });
      if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
    } catch {
      return { ...base, reachable: false, address: null, note: `Speculos did not answer at ${this.config.url}. Start it, or approve in the app.` };
    }
    try {
      const { address } = await this.connect();
      return { ...base, reachable: true, address, note: `Ledger ${this.config.model} emulator (Speculos) running the XRP app. Approvals are signed on it and verified here.` };
    } catch (error) {
      this.signer = null;
      this.account = null;
      return { ...base, reachable: false, address: null, note: `Speculos answered but the XRP app did not: ${error instanceof Error ? error.message : "unknown error"}.` };
    }
  }
  /** Signs the plan hash on the device, verifies it, and submits it to XRPL testnet. */
  async approve(planHash2) {
    if (this.busy) throw new Error("The device is already waiting on another approval.");
    this.busy = true;
    const xrpl = await import("xrpl");
    const dmkMod = await import("@ledgerhq/device-management-kit");
    const client = new xrpl.Client(this.config.wss);
    try {
      debug("approve", planHash2);
      const { signer, address, publicKey } = await this.connect();
      await client.connect();
      debug("xrpl connected");
      await this.ensureFunded(client, address);
      debug("funded", address);
      const tx = await client.autofill({
        TransactionType: "AccountSet",
        Account: address,
        SigningPubKey: publicKey,
        Memos: [{ Memo: { MemoType: hexOf(MEMO_TYPE), MemoData: hexOf(planHash2) } }],
        // autofill allows about a minute. A person reading the device screen needs longer.
        LastLedgerSequence: await client.getLedgerIndex() + 150
      });
      const unsigned = xrpl.encode(tx);
      const bytes = dmkMod.hexaStringToBuffer(unsigned);
      if (!bytes) throw new Error("Could not serialize the approval transaction.");
      await this.clearPendingReview();
      debug("signing on device");
      let signature;
      try {
        signature = await finish(signer.signTransaction(this.config.path, bytes), SIGN_TIMEOUT_MS);
      } catch (error) {
        await this.clearPendingReview().catch(() => void 0);
        this.signer = null;
        this.account = null;
        throw error;
      }
      const signed = xrpl.encode({ ...tx, TxnSignature: dmkMod.bufferToHexaString(signature, false).toUpperCase() });
      debug("signed");
      const verified = await verifyApprovalTx(signed, { planHash: planHash2, address, publicKey });
      if (!verified.ok) throw new Error(`${verified.reason} The plan was not approved.`);
      const submitted = await client.submitAndWait(signed);
      const meta = submitted.result.meta;
      const result = typeof meta === "object" && meta && "TransactionResult" in meta ? String(meta.TransactionResult) : "unknown";
      if (result !== "tesSUCCESS") throw new Error(`XRPL testnet returned ${result}. The plan was not approved.`);
      return {
        txHash: submitted.result.hash,
        result,
        address,
        publicKey,
        explorerUrl: `https://testnet.xrpl.org/transactions/${submitted.result.hash}`
      };
    } finally {
      this.busy = false;
      if (client.isConnected()) await client.disconnect();
    }
  }
  async ensureFunded(client, address) {
    try {
      await client.getXrpBalance(address);
      return;
    } catch (error) {
      const code = error.data?.error;
      if (code !== "actNotFound") throw error;
    }
    const response = await this.fetchImpl(FAUCET, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destination: address })
    });
    if (!response.ok) throw new Error(`The testnet faucet returned HTTP ${response.status}.`);
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2e3));
      try {
        await client.getXrpBalance(address);
        return;
      } catch {
      }
    }
    throw new Error("The testnet faucet did not fund the Ledger account in time.");
  }
  /** Text on the emulator screen right now, with positions. Speculos only; a physical device has no such API. */
  async screenTexts() {
    const response = await this.fetchImpl(`${this.config.url}/events?currentscreenonly=true`, { signal: AbortSignal.timeout(3e3) });
    if (!response.ok) return [];
    const body = await response.json();
    return (body.events ?? []).filter((event) => typeof event.text === "string").map((event) => ({ text: String(event.text), x: Number(event.x), y: Number(event.y), w: Number(event.w), h: Number(event.h) }));
  }
  async tapText(label) {
    const target2 = (await this.screenTexts()).find((event) => event.text === label);
    if (!target2) return false;
    const x = Math.round(target2.x + target2.w / 2);
    const y = Math.round(target2.y + target2.h / 2);
    await this.finger("press", x, y);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await this.finger("release", x, y);
    await new Promise((resolve) => setTimeout(resolve, 700));
    return true;
  }
  /**
   * An abandoned request leaves the XRP app on its review screen, which blocks the next one.
   * On touch models, reject it the way a person would. Only acts when a review is on screen.
   */
  async clearPendingReview() {
    if (this.config.model !== "STAX" && this.config.model !== "FLEX") return;
    const texts = (await this.screenTexts()).map((event) => event.text);
    if (texts.includes("Yes, reject")) {
      debug("clearing an abandoned reject prompt");
      await this.tapText("Yes, reject");
      return;
    }
    if (!texts.includes("Reject")) return;
    debug("clearing an abandoned review");
    if (await this.tapText("Reject")) await this.tapText("Yes, reject");
  }
  async screenshot() {
    return this.fetchImpl(`${this.config.url}/screenshot`, { signal: AbortSignal.timeout(3e3) });
  }
  async finger(action, x, y) {
    await this.fetchImpl(`${this.config.url}/finger`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, x, y }),
      signal: AbortSignal.timeout(3e3)
    });
  }
};

// demo/page.ts
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
function renderPage(previews) {
  const cards = previews.map((preview) => `
          <article class="preview">
            <h4>${escapeHtml(preview.transactionType)}</h4>
            <p>${escapeHtml(preview.summary.replace(/\s*Nothing was signed\.?/g, ""))}</p>
          </article>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Switchboard: hedge what can break your business</title>
  <meta name="theme-color" content="#000000" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #000000;
      --raised: #0a0a0a;
      --raised-2: #121212;
      --hover: rgba(255, 255, 255, 0.04);
      --line: #1f1f1f;
      --line-2: #2e2e2e;
      --text: #ededed;
      --muted: #a1a1a1;
      --faint: #6e6e6e;
      --yellow: #facc15;
      --yellow-hover: #fde047;
      --yellow-dim: rgba(250, 204, 21, 0.14);
      --green: #3fcf8e;
      --red: #f2555a;
      --amber: #facc15;
      --mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0; background: var(--bg); color: var(--text); overflow-x: hidden;
      font: 400 14px/1.55 "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; letter-spacing: -0.005em;
    }
    h1, h2, h3, h4, p { margin: 0; }
    h1, h2, h3, h4 { font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; }
    button, input, select, textarea { font: inherit; color: inherit; letter-spacing: inherit; }
    button { cursor: pointer; }
    :focus-visible { outline: 2px solid var(--yellow); outline-offset: 2px; }
    ::selection { background: var(--yellow); color: #000; }
    [hidden] { display: none !important; }
    .muted { color: var(--muted); }
    .faint { color: var(--faint); }
    .up { color: var(--yellow); }
    .down { color: var(--red); }

    /* Buttons */
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; height: 34px; padding: 0 0.9rem; border-radius: 8px; border: 1px solid transparent; font-weight: 500; font-size: 13.5px; white-space: nowrap; transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease; }
    .btn-primary { background: var(--yellow); color: #000; font-weight: 600; }
    .btn-primary:hover { background: var(--yellow-hover); }
    .btn-primary:disabled { background: #1c1c1c; color: #8a8a8a; box-shadow: inset 0 0 0 1px #2e2e2e; opacity: 1; }
    .btn-ghost { background: var(--raised); border-color: var(--line-2); color: var(--text); }
    .btn-ghost:hover { background: #1a1a1a; border-color: #3a3a3a; }
    .btn-lg { height: 42px; font-size: 14.5px; border-radius: 10px; width: 100%; }
    .btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .link { background: none; border: 0; padding: 0; color: var(--muted); font-size: 13px; }
    .link:hover { color: var(--yellow); }

    /* Top bar */
    .topbar { position: sticky; top: 0; z-index: 20; height: 56px; display: flex; align-items: center; gap: 1rem; padding: 0 1.5rem; background: rgba(0, 0, 0, 0.75); backdrop-filter: saturate(160%) blur(12px); border-bottom: 1px solid var(--line); }
    .brand { display: flex; align-items: center; gap: 0.55rem; font-weight: 600; font-size: 15px; letter-spacing: -0.02em; color: var(--text); text-decoration: none; }
    .brand:hover .mark { box-shadow: 0 0 0 3px var(--yellow-dim); }
    .mark { width: 20px; height: 20px; border-radius: 6px; background: var(--yellow); position: relative; }
    .mark::after { content: ""; position: absolute; left: 5px; right: 5px; top: 9px; height: 2px; border-radius: 1px; background: #000; box-shadow: 0 -4px 0 #000, 0 4px 0 #000; }
    .top-right { margin-left: auto; display: flex; align-items: center; gap: 1rem; }
    .sandbox { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 13px; color: var(--muted); }
    .sandbox i { width: 6px; height: 6px; border-radius: 50%; background: var(--yellow); box-shadow: 0 0 0 3px var(--yellow-dim); }

    /* Intro (before markets are priced) */
    .intro { position: relative; max-width: 800px; margin: 0 auto; padding: 5.5rem 1.5rem 4rem; }
    .backdrop { position: absolute; top: 0; left: 50%; width: 100vw; transform: translateX(-50%); height: 640px; z-index: -1; pointer-events: none; overflow: hidden; }
    .backdrop::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(to right, rgba(255, 255, 255, 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.045) 1px, transparent 1px); background-size: 56px 56px; -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%); mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%); }
    .backdrop::after { content: ""; position: absolute; left: 50%; top: -220px; width: 760px; height: 440px; transform: translateX(-50%); background: radial-gradient(closest-side, rgba(250, 204, 21, 0.16), transparent); filter: blur(10px); }
    .pill { display: inline-flex; align-items: center; gap: 0.5rem; height: 28px; padding: 0 0.75rem; border-radius: 999px; border: 1px solid var(--line-2); background: rgba(10, 10, 10, 0.8); font-size: 12.5px; color: var(--muted); margin-bottom: 1.5rem; }
    .pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--yellow); box-shadow: 0 0 0 3px var(--yellow-dim); }
    .pill b { color: var(--text); font-weight: 500; }
    .intro.compact { padding-top: 3rem; }
    .hero h1 { font-size: clamp(2.1rem, 5vw, 3.1rem); letter-spacing: -0.04em; line-height: 1.05; font-weight: 600; }
    .hero p { color: var(--muted); font-size: 16px; margin-top: 0.9rem; max-width: 54ch; line-height: 1.6; }
    .composer { margin-top: 2.25rem; background: rgba(10, 10, 10, 0.92); box-shadow: 0 16px 50px rgba(0, 0, 0, 0.6); border: 1px solid var(--line-2); border-radius: 16px; padding: 0.9rem 0.9rem 0.75rem 1rem; transition: border-color 150ms ease, box-shadow 150ms ease; }
    .composer:focus-within { border-color: rgba(250, 204, 21, 0.55); box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.08); }
    .composer textarea { display: block; width: 100%; min-height: 3.4rem; max-height: 12rem; resize: none; border: 0; outline: none; background: transparent; font-size: 15.5px; line-height: 1.55; padding: 0.15rem 0 0.6rem; }
    .composer textarea::placeholder { color: var(--faint); }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; }
    .chip { display: inline-flex; align-items: center; gap: 0.2rem; height: 32px; padding: 0 0.55rem; border-radius: 8px; background: var(--raised-2); border: 1px solid var(--line); font-size: 13px; color: var(--muted); }
    .chip:focus-within { border-color: var(--line-2); color: var(--text); }
    .chip input { width: 3.6ch; field-sizing: content; min-width: 1ch; border: 0; outline: none; background: transparent; color: var(--text); padding: 0 0.15rem 0 0.05rem; }
    .chip input.wide { width: 4.6ch; }
    .chip input[aria-invalid="true"] { color: var(--red); }
    .chip select { border: 0; outline: none; background: transparent; color: var(--text); padding: 0 0.1rem; appearance: none; -webkit-appearance: none; cursor: pointer; }
    .chip select option { background: var(--raised); }
    .chip .caret { width: 6px; height: 6px; border-right: 1.5px solid var(--faint); border-bottom: 1.5px solid var(--faint); transform: translateY(-2px) rotate(45deg); margin-left: 0.45rem; pointer-events: none; flex: none; }
    .toolbar .submit { margin-left: auto; display: flex; align-items: center; gap: 0.6rem; }
    .kbd { font-family: var(--mono); font-size: 11.5px; color: var(--faint); border: 1px solid var(--line-2); border-radius: 5px; padding: 0.05rem 0.35rem; }
    .examples { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 1.1rem; margin-top: 1rem; padding-left: 0.2rem; font-size: 13px; color: var(--faint); }
    .examples button { background: none; border: 0; padding: 0; color: var(--muted); font-size: 13px; }
    .examples button:hover { color: var(--yellow); }
    .intro-msg:empty { display: none; }

    /* Scenarios */
    .scenarios { margin-top: 2.5rem; }
    .thinking { margin-top: 2.5rem; border: 1px solid var(--line-2); border-radius: 16px; padding: 1.4rem 1.5rem; background: linear-gradient(180deg, rgba(250, 204, 21, 0.05), rgba(10, 10, 10, 0.6)); }
    .thinking-head { display: flex; align-items: center; gap: 0.75rem; font-weight: 600; font-size: 15px; }
    .orb { width: 14px; height: 14px; border-radius: 50%; background: var(--yellow); box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.6); animation: pulse 1.6s ease-out infinite; flex: none; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.55); } 80% { box-shadow: 0 0 0 14px rgba(250, 204, 21, 0); } 100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0); } }
    .thinking-steps { list-style: none; margin: 1.1rem 0 0; padding: 0; display: grid; gap: 0.55rem; }
    .thinking-steps li { display: flex; align-items: center; gap: 0.65rem; font-size: 13.5px; color: var(--faint); transition: color 300ms ease; }
    .thinking-steps li::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--line-2); flex: none; transition: background 300ms ease; }
    .thinking-steps li.on { color: var(--text); }
    .thinking-steps li.on::before { background: var(--yellow); box-shadow: 0 0 10px rgba(250, 204, 21, 0.6); }
    .thinking-steps li.done { color: var(--muted); }
    .thinking-steps li.done::before { background: var(--green); }
    .thinking-bar { height: 2px; border-radius: 1px; margin-top: 1.2rem; background: linear-gradient(90deg, transparent, var(--yellow), transparent); background-size: 40% 100%; background-repeat: no-repeat; animation: sweep 1.4s ease-in-out infinite; }
    @keyframes sweep { from { background-position: -40% 0; } to { background-position: 140% 0; } }
    .insights { margin-top: 2.5rem; }
    .insights h2 { font-size: 15px; display: flex; align-items: center; gap: 0.5rem; }
    .insights h2 i { width: 6px; height: 6px; border-radius: 50%; background: var(--yellow); box-shadow: 0 0 0 3px var(--yellow-dim); }
    .insights > p { color: var(--muted); font-size: 13px; margin-top: 0.25rem; }
    .insight-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 0.75rem; margin-top: 1rem; }
    .insight { border: 1px solid var(--line-2); border-radius: 14px; padding: 1rem 1.05rem; background: var(--raised); }
    .insight h3 { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
    .insight p { font-size: 13px; color: var(--muted); margin-top: 0.45rem; line-height: 1.55; }
    .insight .bad { margin-top: 0.7rem; font-size: 12.5px; color: var(--text); }
    .insight .bad b { color: var(--yellow); font-weight: 500; }
    .insight .mk { margin-top: 0.4rem; font-size: 12px; color: var(--faint); }
    .scenarios-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; margin-bottom: 0.9rem; }
    .scenarios-head h2 { font-size: 15px; }
    .scenarios-head p { color: var(--muted); font-size: 13px; margin-top: 0.2rem; }
    .scenario-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .scenario { padding: 1rem 1rem 1rem 0; }
    .scenario + .scenario { padding-left: 1rem; border-left: 1px solid var(--line); }
    .scenario-label { font-size: 13px; color: var(--muted); min-height: 2.6em; line-height: 1.35; }
    .scenario-values { display: grid; gap: 0.2rem; margin-top: 0.4rem; }
    .inline { display: flex; align-items: baseline; gap: 0.2rem; border-radius: 6px; padding: 0.15rem 0.35rem; margin-left: -0.35rem; transition: background 120ms ease; }
    .inline:hover, .inline:focus-within { background: var(--hover); }
    .inline input { width: 4ch; field-sizing: content; min-width: 1ch; border: 0; outline: none; background: transparent; padding: 0; }
    .inline.big input { width: 6ch; }
    .inline.big input { font-family: var(--mono); font-size: 19px; font-weight: 500; letter-spacing: -0.03em; }
    .inline span { color: var(--faint); font-size: 13px; }
    .inline input[aria-invalid="true"] { color: var(--red); }
    .scenarios-foot { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.1rem; flex-wrap: wrap; }
    .scenarios-foot .btn { min-width: 150px; }
    .notes { margin-top: 1rem; font-size: 12.5px; color: var(--faint); }
    .notes summary { cursor: pointer; color: var(--muted); width: max-content; }
    .notes ul { margin: 0.5rem 0 0; padding-left: 1rem; display: grid; gap: 0.25rem; }

    /* Messages */
    .msg { font-size: 13px; margin-top: 0.75rem; display: flex; gap: 0.5rem; align-items: flex-start; }
    .msg::before { content: ""; width: 6px; height: 6px; border-radius: 50%; margin-top: 0.5em; flex: none; background: var(--muted); }
    .msg.warn { color: #fde68a; }
    .msg.warn::before { background: var(--amber); }
    .msg.bad { color: #ff8a8e; }
    .msg.bad::before { background: var(--red); }
    .msg.ok { color: var(--text); }
    .msg.ok::before { background: var(--yellow); }
    .msg.info { color: var(--muted); }
    .spinner { width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid rgba(255, 255, 255, 0.15); border-top-color: currentColor; animation: spin 0.7s linear infinite; flex: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .working { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--muted); font-size: 13px; }

    /* Desk (after pricing) */
    .desk { max-width: 1240px; margin: 0 auto; padding: 0 1.5rem 4rem; }
    .summary { display: flex; align-items: center; gap: 1.25rem; padding: 1.1rem 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
    .summary-name { font-weight: 600; font-size: 15px; letter-spacing: -0.015em; }
    .summary-facts { display: flex; gap: 1rem; color: var(--muted); font-size: 13px; flex-wrap: wrap; }
    .summary-right { margin-left: auto; display: flex; align-items: center; gap: 0.75rem; }
    .segmented { display: inline-flex; padding: 2px; border-radius: 9px; background: var(--raised); border: 1px solid var(--line); }
    .segmented button { border: 0; background: transparent; color: var(--muted); height: 28px; padding: 0 0.75rem; border-radius: 7px; font-size: 12.5px; font-weight: 500; }
    .segmented button[aria-pressed="true"] { background: #1c1c1c; color: var(--text); box-shadow: inset 0 0 0 1px var(--line-2); }
    .segmented button:hover:not([aria-pressed="true"]) { color: var(--text); }
    .columns { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 3rem; padding-top: 2rem; align-items: start; }

    /* Markets table */
    .markets-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .markets-head h2 { font-size: 15px; }
    .tabs { display: flex; gap: 0.25rem; }
    .tab { border: 0; background: none; color: var(--faint); font-size: 13px; padding: 0.25rem 0.5rem; border-radius: 6px; }
    .tab[aria-pressed="true"] { color: var(--text); background: #161616; box-shadow: inset 0 0 0 1px var(--line); }
    .tab:hover { color: var(--text); }
    .thead, .row { display: grid; grid-template-columns: minmax(0, 1fr) 6.5rem 5.5rem 5.5rem 1.25rem; gap: 1rem; align-items: center; padding: 0 0.75rem; }
    .thead { height: 34px; font-size: 12px; color: var(--faint); border-bottom: 1px solid var(--line); }
    .thead span:not(:first-child), .cell-num { text-align: right; }
    .market { border-bottom: 1px solid var(--line); }
    .row { width: 100%; min-height: 64px; padding-top: 0.75rem; padding-bottom: 0.75rem; background: none; border: 0; text-align: left; border-radius: 10px; transition: background 120ms ease; }
    .row:hover { background: var(--hover); }
    .market.open { border-bottom-color: transparent; }
    .market.held .row { box-shadow: inset 2px 0 0 var(--yellow); }
    .market.open .row { background: var(--raised); border-radius: 12px 12px 0 0; }
    .row-title { font-size: 14.5px; font-weight: 500; line-height: 1.4; }
    .row-meta { display: flex; flex-wrap: wrap; gap: 0.15rem 0.75rem; margin-top: 0.2rem; font-size: 12.5px; color: var(--faint); }
    .row-meta .held { color: var(--yellow); font-weight: 500; }
    .row-meta .flag { color: var(--muted); }
    .chance { font-family: var(--mono); font-size: 16px; font-weight: 500; letter-spacing: -0.02em; }
    .market.held .chance { color: var(--yellow); }
    .cell-num { font-family: var(--mono); font-size: 13.5px; }
    .cell-num small { font-family: "Geist", ui-sans-serif, system-ui, sans-serif; }
    .cell-num small { display: block; font-size: 11.5px; color: var(--faint); }
    .chev { justify-self: end; color: var(--faint); transition: transform 150ms ease; font-size: 15px; line-height: 1; }
    .market.open .chev { transform: rotate(90deg); color: var(--text); }
    .detail { background: var(--raised); border-radius: 0 0 12px 12px; padding: 0.5rem 0.75rem 1.25rem; margin-bottom: 0.5rem; }
    .detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 2rem; align-items: start; padding-top: 0.75rem; border-top: 1px solid var(--line); }
    .book { width: 100%; border-collapse: collapse; font-size: 12.5px; font-family: var(--mono); }
    .book th { font-family: "Geist", ui-sans-serif, system-ui, sans-serif; }
    .book th { font-weight: 400; font-size: 12px; color: var(--faint); text-align: left; padding: 0 0.5rem 0.4rem; }
    .book th:last-child, .book td:last-child { text-align: right; }
    .book td { position: relative; padding: 0.28rem 0.5rem; }
    .book td span { position: relative; }
    .book .depth { position: absolute; right: 0; top: 4px; bottom: 4px; border-radius: 3px; }
    .book .ask .px { color: var(--red); }
    .book .bid .px { color: var(--green); }
    .book .ask .depth { background: rgba(242, 85, 90, 0.1); }
    .book .bid .depth { background: rgba(63, 207, 142, 0.1); }
    .book .spread td { text-align: center; color: var(--faint); font-size: 12px; padding: 0.45rem; }
    dl.facts { margin: 0; }
    dl.facts div { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr); gap: 1rem; padding: 0.45rem 0; font-size: 13px; }
    dl.facts dt { color: var(--faint); }
    dl.facts dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
    .more { margin-top: 0.4rem; }
    .more summary { cursor: pointer; font-size: 12.5px; color: var(--muted); padding: 0.3rem 0; width: max-content; }
    .more summary:hover { color: var(--text); }
    .note-line { font-size: 13px; color: var(--muted); line-height: 1.6; }

    /* Coverage */
    .coverage { margin-top: 3rem; }
    .coverage h2 { font-size: 15px; }
    .coverage > p { color: var(--muted); font-size: 13px; margin-top: 0.2rem; }
    .cov-rows { margin-top: 1rem; border-top: 1px solid var(--line); }
    .cov-row { padding: 0.85rem 0; border-bottom: 1px solid var(--line); }
    .cov-top { display: flex; justify-content: space-between; gap: 1rem; font-size: 13.5px; }
    .cov-top small { color: var(--faint); font-size: 12.5px; margin-left: 0.5rem; }
    .cov-top span:last-child { color: var(--muted); white-space: nowrap; }
    .cov-top b { color: var(--text); font-weight: 500; }
    .cov-bar { position: relative; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.06); margin-top: 0.6rem; overflow: hidden; }
    .cov-bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; }
    .cov-bar .loss { background: rgba(255, 255, 255, 0.18); }
    .cov-bar .covered { background: var(--yellow); }

    /* Slip */
    .slip-col { position: sticky; top: 80px; }
    .slip { position: relative; background: var(--raised); border: 1px solid var(--line-2); border-radius: 16px; overflow: hidden; }
    .slip::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--yellow), transparent); opacity: 0.8; }
    .slip-head { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.15rem; border-bottom: 1px solid var(--line); }
    .slip-head h2 { font-size: 14px; }
    .slip-head span { font-size: 12px; color: var(--faint); }
    .slip-sec { padding: 1rem 1.15rem; border-bottom: 1px solid var(--line); }
    .slip-sec:last-child { border-bottom: 0; }
    .leg { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.15rem 1rem; }
    .leg + .leg { margin-top: 0.85rem; }
    .leg-name { font-size: 13.5px; font-weight: 500; line-height: 1.4; }
    .leg-cost { font-family: var(--mono); font-size: 13px; text-align: right; }
    .leg-sub { grid-column: 1 / -1; font-size: 12.5px; color: var(--faint); }
    .line-item { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; font-size: 13px; color: var(--muted); }
    .line-item + .line-item { margin-top: 0.55rem; }
    .line-item b { color: var(--text); font-weight: 500; }
    .line-item > span:last-child { font-family: var(--mono); font-size: 12.5px; }
    .total { display: flex; justify-content: space-between; align-items: baseline; }
    .total span { font-size: 13px; color: var(--muted); }
    .total strong { font-family: var(--mono); font-size: 26px; font-weight: 500; letter-spacing: -0.04em; }
    .meter { height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.07); margin: 0.7rem 0 0.4rem; overflow: hidden; }
    .meter i { display: block; height: 100%; border-radius: 2px; background: var(--yellow); box-shadow: 0 0 12px rgba(250, 204, 21, 0.45); }
    .meter-label { font-size: 12px; color: var(--faint); }
    .arrow { color: var(--faint); margin: 0 0.35rem; }
    .consent { display: flex; gap: 0.6rem; align-items: flex-start; font-size: 12.5px; color: var(--muted); cursor: pointer; line-height: 1.5; }
    .consent input { margin: 0.15rem 0 0; width: 15px; height: 15px; accent-color: var(--yellow); flex: none; }
    .method { display: flex; margin-bottom: 0.9rem; }
    .method button { flex: 1; }
    .device { margin-top: 1rem; display: grid; justify-items: center; gap: 0.6rem; }
    .device-screen { width: 220px; aspect-ratio: 400 / 672; border-radius: 22px; border: 6px solid #1c1c1c; box-shadow: 0 0 0 1px var(--line-2), 0 18px 40px rgba(0, 0, 0, 0.5); background: #fff; cursor: pointer; touch-action: none; user-select: none; -webkit-user-drag: none; }
    .device-hint { font-size: 12.5px; color: var(--text); text-align: center; line-height: 1.5; }
    .device-foot { font-size: 11.5px; color: var(--faint); text-align: center; }
    .line-item a { color: var(--yellow); text-decoration: none; font-family: var(--mono); font-size: 12.5px; }
    .line-item a:hover { text-decoration: underline; }
    .slip-cta { margin-top: 0.9rem; }
    .slip-foot { font-size: 11.5px; color: var(--faint); margin-top: 0.6rem; text-align: center; }
    .skeleton { display: grid; gap: 0.6rem; }
    .skeleton i { display: block; height: 10px; border-radius: 5px; background: linear-gradient(90deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04)); background-size: 200% 100%; animation: shimmer 1.4s ease infinite; }
    @keyframes shimmer { to { background-position: -200% 0; } }
    .story { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.9rem; }
    .story li { display: grid; grid-template-columns: 1.25rem minmax(0, 1fr); gap: 0.55rem; align-items: start; }
    .story .n { font-family: var(--mono); font-size: 12px; color: var(--yellow); line-height: 1.4; }
    .story b { display: block; font-size: 13.5px; font-weight: 600; }
    .story span { display: block; font-size: 12.5px; color: var(--muted); margin-top: 0.15rem; line-height: 1.5; }
    .trace { margin-top: 0.85rem; }
    .trace summary { cursor: pointer; color: var(--faint); font-size: 12.5px; width: max-content; }
    .trace summary:hover { color: var(--text); }
    .trace .steps { margin-top: 0.65rem; }
    .receipt-head { display: flex; gap: 0.7rem; align-items: center; }
    .tick { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 14px; font-weight: 700; flex: none; }
    .tick.ok { background: var(--yellow-dim); color: var(--yellow); }
    .tick.bad { background: rgba(242, 85, 90, 0.14); color: var(--red); }
    .receipt-head strong { display: block; font-size: 14px; font-weight: 600; }
    .receipt-head span { font-size: 12.5px; color: var(--faint); }
    .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
    .steps li { display: flex; gap: 0.6rem; align-items: baseline; font-size: 13px; }
    .steps li::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--yellow); flex: none; transform: translateY(-1px); }
    .steps li.bad::before { background: var(--red); }
    .steps small { display: block; color: var(--faint); font-size: 12px; overflow-wrap: anywhere; }

    /* Footer */
    .footer { max-width: 1240px; margin: 0 auto; padding: 1rem 1.5rem 4rem; }
    .footer details { border-top: 1px solid var(--line); }
    .footer details:last-child { border-bottom: 1px solid var(--line); }
    .footer summary { list-style: none; cursor: pointer; padding: 1rem 0; font-size: 13px; color: var(--muted); display: flex; justify-content: space-between; }
    .footer summary::-webkit-details-marker { display: none; }
    .footer summary::after { content: "+"; color: var(--faint); }
    .footer details[open] summary::after { content: "\u2212"; }
    .footer summary:hover, .footer details[open] summary { color: var(--text); }
    .footer .inner { padding: 0 0 1.5rem; font-size: 13px; color: var(--muted); }
    .sponsors { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem; }
    .sponsor h4 { font-size: 13.5px; font-weight: 500; color: var(--text); }
    .sponsor .state { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 12.5px; margin: 0.3rem 0 0.4rem; }
    .sponsor .state i { width: 6px; height: 6px; border-radius: 50%; }
    .sponsor p { font-size: 12.5px; color: var(--faint); line-height: 1.55; }
    .previews { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem; margin-top: 1rem; }
    .preview h4 { font-size: 13.5px; font-weight: 500; color: var(--text); }
    .preview p { font-size: 12.5px; color: var(--faint); margin-top: 0.3rem; line-height: 1.55; }
    .claims { margin: 0; padding-left: 1rem; display: grid; gap: 0.5rem; line-height: 1.55; }
    .claims strong { color: var(--text); font-weight: 500; }
    code { font-size: 0.9em; background: var(--raised-2); padding: 0.05rem 0.3rem; border-radius: 4px; }

    @media (max-width: 1020px) {
      .columns { grid-template-columns: 1fr; gap: 2.5rem; }
      .slip-col { position: static; }
    }
    @media (max-width: 640px) {
      .topbar { padding: 0 1rem; }
      .sandbox span { display: none; }
      .intro { padding: 3rem 1rem 3rem; }
      .toolbar .submit { width: 100%; margin-left: 0; margin-top: 0.25rem; }
      .toolbar .submit .btn { flex: 1; }
      .kbd { display: none; }
      .scenario-grid { grid-template-columns: 1fr 1fr; }
      .scenario { padding: 0.9rem 0.75rem 0.9rem 0; }
      .scenario + .scenario { padding-left: 0; border-left: 0; }
      .scenario:nth-child(even) { padding-left: 0.75rem; border-left: 1px solid var(--line); }
      .scenario:nth-child(n+3) { border-top: 1px solid var(--line); }
      .desk { padding: 0 1rem 3rem; }
      .summary-right { margin-left: 0; width: 100%; justify-content: space-between; }
      .thead, .row { grid-template-columns: minmax(0, 1fr) 4.5rem 4.5rem; padding: 0 0.5rem; }
      .row { padding-top: 0.75rem; padding-bottom: 0.75rem; }
      .thead .col-bid, .row .col-bid, .thead .col-chev, .row .chev { display: none; }
      .detail { padding: 0.5rem 0.5rem 1rem; }
      .detail-grid { grid-template-columns: 1fr; gap: 1.25rem; }
      .cov-top small { display: block; margin: 0.1rem 0 0; }
      .footer { padding: 1rem 1rem 3rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      * { transition: none !important; animation: none !important; }
    }
  </style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="/" title="Start over"><span class="mark" aria-hidden="true"></span>Switchboard</a>
  <div class="top-right">
    <span class="sandbox"><i aria-hidden="true"></i><span id="mode-lamp-text">Sandbox hedge</span></span>
    <button class="btn btn-ghost" type="button" id="sample">Run sample</button>
  </div>
</header>

<section class="intro" id="intro">
  <div class="backdrop" id="backdrop" aria-hidden="true"></div>
  <div class="hero" id="hero">
    <span class="pill"><i aria-hidden="true"></i><b>Sandbox hedge</b> <span id="chain-meta">on XRPL EVM testnet</span></span>
    <h1>Hedge what can break your business.</h1>
    <p>Describe the dependency that takes the product down with it. Switchboard prices a hedge inside your budget, and an agent pays for backup when that dependency fails.</p>
  </div>
  <form class="composer" id="intake" novalidate>
    <textarea id="desc" rows="2" placeholder="What does your business depend on, and what happens when it fails?" aria-label="What does your business depend on, and what happens when it fails?">Northline runs customer-support on one primary model API. A fifteen-minute outage takes the product offline.</textarea>
    <div class="toolbar">
      <label class="chip" title="Where you operate">
        <select id="jurisdiction" aria-label="Where you operate">
          <option value="US">United States</option>
          <option value="EU">European Union</option>
          <option value="UK">United Kingdom</option>
          <option value="SG">Singapore</option>
        </select><span class="caret" aria-hidden="true"></span>
      </label>
      <label class="chip" title="Monthly hedge budget">$<input id="budget" type="text" inputmode="decimal" value="800" aria-label="Monthly hedge budget in USD" autocomplete="off" /><span>/mo</span></label>
      <label class="chip" title="Largest monthly loss you can absorb">$<input id="tail" class="wide" type="text" inputmode="decimal" value="8000" aria-label="Largest monthly loss you can absorb, USD" autocomplete="off" /><span>max loss</span></label>
      <label class="chip" title="What the optimizer favors"><span>Optimize</span>
        <select id="mode-select" aria-label="Optimize for">
          <option value="min_cvar">Worst case</option>
          <option value="balanced">Balanced</option>
          <option value="min_cost">Lowest cost</option>
        </select><span class="caret" aria-hidden="true"></span>
      </label>
      <span class="submit"><span class="kbd" aria-hidden="true">\u2318 \u21B5</span><button class="btn btn-primary" type="submit" id="analyze">Analyze</button></span>
    </div>
  </form>
  <div class="examples" id="examples">
    <span>Try</span>
    <button type="button" data-example="0">AI support desk</button>
    <button type="button" data-example="1">Voice agent on a GPU cloud</button>
    <button type="button" data-example="2">Ice cream shop in New York</button>
  </div>
  <div class="intro-msg" id="intro-msg"></div>
  <div id="scenarios"></div>
</section>

<section class="desk" id="desk" hidden>
  <div class="summary" id="summary"></div>
  <div class="columns">
    <main id="markets"></main>
    <aside class="slip-col"><section class="slip" id="slip" aria-live="polite" aria-label="Your hedge"></section></aside>
  </div>
</section>

<footer class="footer">
  <details>
    <summary>Integrations</summary>
    <div class="inner"><div class="sponsors" id="sponsors">Loading integrations\u2026</div></div>
  </details>
  <details>
    <summary>XRPL transaction previews</summary>
    <div class="inner">
      <div class="previews">${cards}
      </div>
    </div>
  </details>
  <details>
    <summary>What is real and what is sandbox</summary>
    <div class="inner">
      <ul class="claims">
        <li><strong>Markets.</strong> The hedge fills on the Switchboard sandbox book. A Kalshi row marked Live public price is a real public quote and is not buyable here. Synthetic rows are examples. Nothing is sent to a live US derivatives venue.</li>
        <li><strong>Mastercard AP4M.</strong> The team name on this process is Penn1. Live payment code is present and stays idle until an agent key, <code>AP4M_MODE=live</code>, a 402 resource, and a channel id or cap are set. The failover drill stops at a mock voucher.</li>
        <li><strong>QuickNode.</strong> The chain read and the PaymentLedger log read use QuickNode only when <code>QUICKNODE_RPC_URL</code> is set. Otherwise both use the public XRPL EVM testnet RPC.</li>
        <li id="claim-ledger"><strong>Ledger.</strong> <code>ledger_agent_intent</code> is unsupported on chain id 1449000. Chain id 1440000 is not used. No device session is open and nothing is signed.</li>
      </ul>
    </div>
  </details>
</footer>

<script>
(function () {
  var EXAMPLES = [
    'Northline runs customer-support on one primary model API. A fifteen-minute outage takes the product offline.',
    'Voice agent startup running LLM inference on one GPU cloud provider, where an outage or token price spike hurts margins',
    'Ice cream shop in New York'
  ];
  var MODES = [['min_cvar', 'Worst case'], ['balanced', 'Balanced'], ['min_cost', 'Lowest cost']];
  var VENUE = {
    switchboard: 'Switchboard',
    kalshi: 'Kalshi',
    polymarket_us: 'Polymarket US',
    polymarket_international: 'Polymarket Intl',
    capacity_provider: 'Capacity provider'
  };
  var SETTLEMENT = {
    binary: 'Fixed payout if it happens',
    capped_call: 'Pays above a threshold, capped',
    capacity_option: 'Right to reserved capacity'
  };
  var STEP = {
    analyze: 'Read your company',
    search: 'Re-quoted the market',
    plan: 'Rebuilt the hedge',
    orders: 'Checked for trades',
    approval: 'Opened approval',
    confirm: 'Approved in app',
    run: 'Placed orders',
    arm: 'Armed failover',
    failover: 'Ran outage drill',
    ledger: 'Signed on Ledger'
  };
  var MONEY = /^[0-9]+([.][0-9]+)?$/;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    phase: 'idle',
    analysis: null,
    confirmed: false,
    quoted: null,
    selected: null,
    filter: 'buyable',
    mode: 'min_cvar',
    result: null,
    notice: null,
    error: null,
    busy: false,
    discovery: null,
    ledgerStatus: null,
    approveWith: 'ledger'
  };

  function $(id) { return document.getElementById(id); }

  function el(tag, props, kids) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'style') node.setAttribute('style', value);
        else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(value));
      });
    }
    (kids || []).forEach(function (kid) {
      if (kid === null || kid === undefined || kid === false) return;
      node.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function num(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  // Display only. Request bodies keep the exact decimal strings from the services.
  function usd(value) {
    if (value === null || value === undefined || value === '') return 'n/a';
    var parsed = Number(value);
    if (!isFinite(parsed)) return String(value);
    var whole = Math.abs(parsed) >= 100 || parsed % 1 === 0;
    return parsed.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  }

  function pct(fraction) { return Math.round(fraction * 10000) / 100; }

  function chanceText(fraction) {
    if (!(fraction > 0)) return '\u2014';
    var value = fraction * 100;
    if (value < 1) return '<1%';
    return (value < 10 ? value.toFixed(1) : String(Math.round(value))) + '%';
  }

  function width(part, whole) {
    if (!(whole > 0)) return '0%';
    return Math.max(0, Math.min(100, (part / whole) * 100)).toFixed(2) + '%';
  }

  function isUs(value) {
    var j = String(value || '').trim().toLowerCase();
    return j === 'us' || j === 'usa' || j === 'united states' || j.indexOf('us-') === 0 || j.indexOf('us ') === 0;
  }

  function cleanName(name) {
    var text = String(name || 'Unnamed contract');
    if (text.indexOf('Synthetic ') === 0 && text.indexOf(': ') > 0) text = text.slice(text.indexOf(': ') + 2);
    if (text.indexOf('SYNTHETIC ') === 0) text = text.slice(10);
    if (text.indexOf('EXAMPLE ') === 0) text = text.slice(8);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function cleanLabel(text) {
    return String(text || '').replace(/s*[(](fictional|synthetic)[)]/gi, '');
  }

  function companyName(name) {
    return cleanLabel(name).replace(/^Demo /, '');
  }

  function shortHash(hash) {
    var text = String(hash || '').replace(/^sha256:/, '');
    return text.length > 16 ? text.slice(0, 6) + '\u2026' + text.slice(-6) : text;
  }

  function hashEnding(hash) { return String(hash || '').slice(-8); }

  function message(tone, text) { return el('p', { class: 'msg ' + tone, role: tone === 'bad' ? 'alert' : 'status', text: text }); }
  function working(text) { return el('span', { class: 'working' }, [el('span', { class: 'spinner', 'aria-hidden': 'true' }), text]); }

  async function post(path, body) {
    try {
      var response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      var parsed = {};
      try { parsed = await response.json(); } catch (error) { parsed = {}; }
      return { status: response.status, ok: response.ok, body: parsed || {} };
    } catch (error) {
      return { status: 0, ok: false, body: { message: 'The server did not answer. Check your connection and try again.' } };
    }
  }

  function messageOf(body, fallback) {
    if (body && typeof body.message === 'string' && body.message.trim()) return body.message;
    return fallback;
  }

  function toTop() { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); }

  /* Views */

  function render() {
    var desk = state.phase === 'pricing' || state.phase === 'priced' || state.phase === 'error';
    $('intro').hidden = desk;
    $('desk').hidden = !desk;
    $('hero').hidden = state.phase !== 'idle';
    $('backdrop').hidden = state.phase !== 'idle';
    $('examples').hidden = state.phase !== 'idle';
    $('intro').classList.toggle('compact', state.phase !== 'idle');
    $('analyze').textContent = state.phase === 'review' ? 'Re-analyze' : 'Analyze';
    if (desk) {
      renderSummary();
      renderMarkets();
      renderSlip();
    } else {
      renderScenarios();
    }
  }

  /* Intake */

  function autoGrow() {
    var area = $('desc');
    area.style.height = 'auto';
    area.style.height = Math.min(area.scrollHeight, 192) + 'px';
  }
  $('desc').addEventListener('input', autoGrow);

  function inputsChanged() {
    clear($('intro-msg'));
    if (!state.analysis) return;
    state.analysis = null;
    state.discovery = null;
    state.confirmed = false;
    state.phase = 'draft';
    clear($('scenarios'));
    $('intro-msg').appendChild(message('info', 'Your description or limits changed. Analyze again to update the scenarios.'));
    render();
  }
  ['desc', 'budget', 'tail', 'jurisdiction'].forEach(function (id) { $(id).addEventListener('input', inputsChanged); });

  $('mode-select').addEventListener('change', function () { state.mode = $('mode-select').value; });

  $('desc').addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) $('intake').requestSubmit();
  });

  document.querySelectorAll('[data-example]').forEach(function (button) {
    button.addEventListener('click', function () {
      $('desc').value = EXAMPLES[Number(button.getAttribute('data-example'))];
      autoGrow();
      $('intake').requestSubmit();
    });
  });

  $('intake').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (state.busy) return;
    var description = $('desc').value.trim();
    var budget = $('budget').value.trim();
    var tail = $('tail').value.trim();
    $('budget').setAttribute('aria-invalid', String(!MONEY.test(budget)));
    $('tail').setAttribute('aria-invalid', String(!MONEY.test(tail)));
    clear($('intro-msg'));
    if (!description) {
      $('intro-msg').appendChild(message('bad', 'Describe the business first: what it depends on and what a bad month looks like.'));
      $('desc').focus();
      return;
    }
    if (!MONEY.test(budget) || !MONEY.test(tail)) {
      $('intro-msg').appendChild(message('bad', 'Enter the budget and max loss as plain numbers, like 800 or 8000.'));
      return;
    }
    state.busy = true;
    var button = $('analyze');
    button.disabled = true;
    clear(button);
    button.appendChild(el('span', { class: 'spinner', 'aria-hidden': 'true' }));
    button.appendChild(document.createTextNode('Analyzing'));
    var loader = thinkingPanel();
    $('scenarios').appendChild(loader.node);
    var result = await post('/demo/analyze', {
      description: description,
      jurisdiction: $('jurisdiction').value,
      monthlyHedgeBudgetUsd: budget,
      maxTolerableTailLossUsd: tail
    });
    loader.stop();
    state.busy = false;
    button.disabled = false;
    if (!result.ok || !result.body.company) {
      render();
      $('intro-msg').appendChild(message('bad', messageOf(result.body, 'The analyzer could not read that. Say what the business depends on and what a failure costs.')));
      return;
    }
    state.analysis = result.body;
    state.discovery = result.body.discovery || null;
    state.confirmed = false;
    state.quoted = null;
    state.result = null;
    state.phase = 'review';
    render();
  });

    // Shown while the analyzer works. The steps describe what the server is actually doing.
  function thinkingPanel() {
    var steps = [
      'Reading the business',
      'Working out what moves its monthly P&L',
      'Scanning 458 live Kalshi weather and climate markets',
      'Matching contracts that pay out in the bad case',
      'Sizing losses and chances for each scenario'
    ];
    var items = steps.map(function (text) { return el('li', { text: text }); });
    var index = 0;
    items[0].className = 'on';
    var timer = setInterval(function () {
      if (index >= items.length - 1) return;
      items[index].className = 'done';
      index += 1;
      items[index].className = 'on';
    }, 2600);
    return {
      node: el('div', { class: 'thinking', role: 'status', 'aria-live': 'polite' }, [
        el('div', { class: 'thinking-head' }, [el('span', { class: 'orb', 'aria-hidden': 'true' }), 'Switchboard is analyzing your business']),
        el('ol', { class: 'thinking-steps' }, items),
        el('div', { class: 'thinking-bar', 'aria-hidden': 'true' })
      ]),
      stop: function () { clearInterval(timer); if (this.node && this.node.parentNode) this.node.parentNode.removeChild(this.node); }
    };
  }

  function renderInsights() {
    var found = state.discovery;
    if (!found || !found.insights || !found.insights.length) return null;
    var markets = found.markets || [];
    return el('section', { class: 'insights' }, [
      el('h2', {}, [el('i', { 'aria-hidden': 'true' }), 'What Switchboard noticed']),
      el('p', { text: 'Risks in your P&L, including the ones that are easy to miss, and the live markets that pay out when they hit.' }),
      el('div', { class: 'insight-grid' }, found.insights.map(function (item) {
        var count = markets.filter(function (m) { return m.exposureId === item.exposureId; }).length;
        return el('article', { class: 'insight' }, [
          el('h3', { text: item.label }),
          el('p', { text: item.insight }),
          el('div', { class: 'bad' }, ['Bad case: ', el('b', { text: item.badOutcome })]),
          el('div', { class: 'mk', text: count ? count + (count === 1 ? ' live Kalshi market matched' : ' live Kalshi markets matched') : 'No listed market tracks this yet' })
        ]);
      }))
    ]);
  }

  /* Scenarios */

  function scenarioSum(company) {
    return company.scenarios.reduce(function (sum, scenario) { return sum + Number(scenario.probability); }, 0);
  }

  function renderScenarios() {
    var root = $('scenarios');
    clear(root);
    if (state.phase !== 'review' || !state.analysis) return;
    var analysis = state.analysis;
    var company = analysis.company;
    var exposure = company.exposures[0];
    var check = el('div', {});
    var go = el('button', { class: 'btn btn-primary', type: 'button', id: 'confirm', onclick: confirmScenarios }, ['Find markets']);

    function refresh() {
      clear(check);
      var sum = scenarioSum(company);
      var badLoss = company.scenarios.some(function (scenario) { return !MONEY.test(String(scenario.baselineLossUsd)); });
      var badSum = !isFinite(sum) || Math.abs(sum - 1) > 0.001;
      if (badSum) check.appendChild(message('warn', 'Chances add up to ' + pct(sum || 0) + '%. Make them 100%.'));
      if (badLoss) check.appendChild(message('warn', 'Each loss needs to be a plain number, like 5000.'));
      go.disabled = badSum || badLoss;
    }

    var cells = company.scenarios.map(function (scenario) {
      var chance = el('input', { type: 'text', inputmode: 'decimal', value: String(pct(Number(scenario.probability))), 'aria-label': 'Chance of ' + scenario.label + ' in a month, percent' });
      chance.addEventListener('input', function () {
        var value = Number(chance.value);
        scenario.probability = chance.value.trim() === '' || !isFinite(value) ? NaN : Math.round(value * 100) / 10000;
        chance.setAttribute('aria-invalid', String(!isFinite(scenario.probability)));
        refresh();
      });
      var loss = el('input', { type: 'text', inputmode: 'decimal', value: String(scenario.baselineLossUsd), 'aria-label': 'Loss if ' + scenario.label + ' happens, USD' });
      loss.addEventListener('input', function () {
        scenario.baselineLossUsd = loss.value.trim();
        loss.setAttribute('aria-invalid', String(!MONEY.test(scenario.baselineLossUsd)));
        refresh();
      });
      return el('div', { class: 'scenario' }, [
        el('p', { class: 'scenario-label', text: scenario.label }),
        el('div', { class: 'scenario-values' }, [
          el('label', { class: 'inline big' }, [el('span', { text: '$' }), loss]),
          el('label', { class: 'inline' }, [chance, el('span', { text: '% chance a month', style: 'white-space:nowrap' })])
        ])
      ]);
    });

    var notes = (analysis.assumptions || []).concat(analysis.warnings || []).filter(function (note) { return !/fictional|synthetic|sandbox|template/i.test(note); });
    var insights = renderInsights();
    if (insights) root.appendChild(insights);
    root.appendChild(el('div', { class: 'scenarios' }, [
      el('div', { class: 'scenarios-head' }, [
        el('div', {}, [
          el('h2', { text: companyName(company.name) }),
          el('p', { text: (exposure ? exposure.label + '. ' : '') + 'Estimated from your description. Edit any number to match your business.' })
        ])
      ]),
      el('div', { class: 'scenario-grid' }, cells),
      check,
      el('div', { class: 'scenarios-foot' }, [
        exposure ? el('span', { class: 'faint', style: 'font-size:12.5px', text: 'Analyzer confidence ' + Math.round(exposure.confidence * 100) + '%' }) : el('span', {}),
        go
      ]),
      notes.length ? el('details', { class: 'notes' }, [
        el('summary', { text: 'Analyzer notes' }),
        el('ul', {}, notes.map(function (note) { return el('li', { text: note }); }))
      ]) : null
    ]));
    refresh();
  }

  function confirmScenarios() {
    if (!state.analysis) return;
    state.analysis.company.confirmedByUser = true;
    state.confirmed = true;
    priceHedge();
  }

  function editCompany() {
    if (state.busy) return;
    state.confirmed = false;
    if (state.analysis) state.analysis.company.confirmedByUser = false;
    state.quoted = null;
    state.result = null;
    state.notice = null;
    state.phase = state.analysis ? 'review' : 'idle';
    render();
    toTop();
  }

  /* Pricing */

  async function priceHedge() {
    if (!state.analysis || state.busy) return;
    state.busy = true;
    state.phase = 'pricing';
    state.quoted = null;
    state.result = null;
    state.notice = null;
    render();
    toTop();
    var result = await post('/demo/quote', { company: state.analysis.company, mode: state.mode, liveMarkets: state.discovery ? state.discovery.markets : [] });
    state.busy = false;
    if (!result.ok || !result.body.plan) {
      state.phase = 'error';
      state.error = messageOf(result.body, 'The market search did not return a plan. Try again, or change your limits.');
      render();
      return;
    }
    acceptQuote(result.body);
  }

  function acceptQuote(body) {
    state.quoted = { search: body.search || null, plan: body.plan, books: body.books || [] };
    state.phase = 'priced';
    var held = marketItems().filter(function (item) { return item.held; })[0];
    state.selected = held ? held.id : null;
    var lamp = $('mode-lamp-text');
    if (lamp) {
      var live = ((body.search && body.search.quotes) || []).some(function (quote) { return quote.source === 'live'; });
      lamp.textContent = live ? 'Sandbox hedge, live Kalshi price' : 'Sandbox hedge';
    }
    render();
  }

  function setMode(mode) {
    if (state.mode === mode || state.busy) return;
    state.mode = mode;
    $('mode-select').value = mode;
    priceHedge();
  }

  /* Summary bar */

  function renderSummary() {
    var root = $('summary');
    clear(root);
    var company = state.analysis && state.analysis.company;
    if (!company) return;
    var jurisdiction = $('jurisdiction');
    var place = jurisdiction.options[jurisdiction.selectedIndex] ? jurisdiction.options[jurisdiction.selectedIndex].text : company.jurisdiction;
    root.appendChild(el('span', { class: 'summary-name', text: companyName(company.name) }));
    root.appendChild(el('span', { class: 'summary-facts' }, [
      el('span', { text: place }),
      el('span', { text: usd(company.monthlyHedgeBudgetUsd) + ' a month' }),
      el('span', { text: usd(company.maxTolerableTailLossUsd) + ' max loss' })
    ]));
    root.appendChild(el('div', { class: 'summary-right' }, [
      el('div', { class: 'segmented', role: 'group', 'aria-label': 'Optimize for' }, MODES.map(function (mode) {
        return el('button', { type: 'button', 'aria-pressed': String(state.mode === mode[0]), onclick: function () { setMode(mode[0]); } }, [mode[1]]);
      })),
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: editCompany }, ['Edit'])
    ]));
  }

  /* Markets */

  function quoteStatus(quote, jurisdiction) {
    if (isUs(jurisdiction) && quote.venue === 'polymarket_international') return { label: 'Reference only in the US', buyable: false };
    if (quote.capability === 'read_only') return { label: 'Read only', buyable: false };
    if (quote.capability === 'unsupported') return { label: 'Unsupported', buyable: false };
    if (quote.comparison === 'not_comparable') return { label: 'Not comparable to your risk', buyable: false };
    if (Date.parse(quote.expiresAt) <= Date.now()) return { label: 'Quote expired', buyable: false };
    if (quote.capability === 'sandbox') return { label: '', buyable: true };
    return { label: 'Live quote, not traded here', buyable: false };
  }

  function heldQuantity(plan, id) {
    if (!plan) return null;
    for (var i = 0; i < plan.legs.length; i += 1) {
      if (plan.legs[i].quoteId === id || plan.legs[i].capacityOfferId === id) return plan.legs[i].quantity;
    }
    return null;
  }

  function marketItems() {
    var quoted = state.quoted;
    if (!quoted) return [];
    var company = state.analysis && state.analysis.company;
    var jurisdiction = company ? company.jurisdiction : 'US';
    var items = [];
    ((quoted.search && quoted.search.quotes) || []).forEach(function (quote) {
      var instrument = quote.instrument || {};
      var payout = num(instrument.payoutPerUnitUsd);
      items.push({
        id: quote.quoteId,
        quote: quote,
        venue: quote.venue,
        source: quote.source,
        name: cleanName(instrument.name),
        status: quoteStatus(quote, jurisdiction),
        held: heldQuantity(quoted.plan, quote.quoteId),
        chance: payout > 0 ? num(quote.askUsd) / payout : 0,
        book: (quoted.books || []).filter(function (book) { return book.instrumentId === instrument.instrumentId; })[0] || null
      });
    });
    ((quoted.search && quoted.search.capacityOffers) || []).forEach(function (offer) {
      items.push({
        id: offer.offerId,
        offer: offer,
        venue: 'capacity_provider',
        source: offer.capability === 'live' ? 'live' : 'sandbox',
        name: /sandbox|demo/i.test(offer.providerName) ? 'Standby inference capacity' : 'Standby capacity from ' + cleanLabel(offer.providerName),
        status: offer.capability === 'sandbox' ? { label: '', buyable: true } : { label: offer.capability === 'live' ? 'Live offer, not traded here' : 'Not reservable', buyable: false },
        held: heldQuantity(quoted.plan, offer.offerId),
        chance: 0,
        book: null
      });
    });
    items.sort(function (a, b) {
      if (!!a.held !== !!b.held) return a.held ? -1 : 1;
      if (a.status.buyable !== b.status.buyable) return a.status.buyable ? -1 : 1;
      return 0;
    });
    return items;
  }

  function renderMarkets() {
    var root = $('markets');
    clear(root);
    if (state.phase === 'pricing') {
      root.appendChild(el('div', { class: 'markets-head' }, [el('h2', { text: 'Markets' })]));
      root.appendChild(el('p', { style: 'padding:1.5rem 0' }, [working('Searching venues and building your hedge')]));
      return;
    }
    if (state.phase === 'error') {
      root.appendChild(message('bad', state.error));
      root.appendChild(el('button', { class: 'btn btn-ghost', type: 'button', style: 'margin-top:1rem', onclick: priceHedge }, ['Try again']));
      return;
    }
    var items = marketItems();
    var buyable = items.filter(function (item) { return item.status.buyable; });
    var shown = state.filter === 'all' ? items : buyable;
    var liveCount = items.filter(function (item) { return item.source === 'live'; }).length;
    root.appendChild(el('div', { class: 'markets-head' }, [
      el('h2', { text: 'Markets' }),
      el('div', { class: 'tabs', role: 'group', 'aria-label': 'Filter markets' }, [
        el('button', { class: 'tab', type: 'button', 'aria-pressed': String(state.filter !== 'all'), onclick: function () { state.filter = 'buyable'; renderMarkets(); } }, ['Buyable ' + buyable.length]),
        el('button', { class: 'tab', type: 'button', 'aria-pressed': String(state.filter === 'all'), onclick: function () { state.filter = 'all'; renderMarkets(); } }, ['All ' + items.length])
      ])
    ]));
    if (liveCount && state.filter !== 'all') {
      root.appendChild(el('p', { class: 'muted', style: 'font-size:12.5px;margin:-0.35rem 0 0.75rem', text: liveCount + (liveCount === 1 ? ' live Kalshi price is under All. It is a public quote, and it is not in this hedge.' : ' live Kalshi prices are under All. They are public quotes, and they are not in this hedge.') }));
    }
    root.appendChild(el('div', { class: 'thead', 'aria-hidden': 'true' }, [
      el('span', { text: 'Market' }),
      el('span', { text: 'Chance' }),
      el('span', { text: 'Ask' }),
      el('span', { class: 'col-bid', text: 'Bid' }),
      el('span', { class: 'col-chev' })
    ]));
    if (!shown.length) {
      root.appendChild(el('div', { style: 'padding:1.5rem 0.75rem' }, [
        el('p', { class: 'muted', text: 'Nothing you can buy matches this exposure right now.' }),
        items.length ? el('button', { class: 'link', type: 'button', style: 'margin-top:0.5rem', onclick: function () { state.filter = 'all'; renderMarkets(); } }, ['See reference markets']) : null
      ]));
    } else {
      shown.forEach(function (item) { root.appendChild(renderRow(item)); });
    }
    var plan = state.quoted && state.quoted.plan;
    if (plan && plan.legs.length) root.appendChild(renderCoverage(plan));
  }

  function renderRow(item) {
    var quote = item.quote;
    var offer = item.offer;
    var open = state.selected === item.id;
    var id = 'detail-' + item.id;
    var meta = [el('span', { text: VENUE[item.venue] || item.venue })];
    if (item.held) meta.push(el('span', { class: 'held', text: item.held + ' in your hedge' }));
    if (item.status.label) meta.push(el('span', { class: 'flag', text: item.status.label }));
    if (item.source === 'live') meta.push(el('span', { class: 'flag', text: 'Live public price' }));
    if (item.source === 'synthetic') meta.push(el('span', { text: 'Synthetic quote' }));
    var cells = quote
      ? [
        el('span', { class: 'cell-num chance', text: chanceText(item.chance) }),
        el('span', { class: 'cell-num', text: usd(quote.askUsd) }),
        el('span', { class: 'cell-num col-bid', text: usd(quote.bidUsd) })
      ]
      : [
        el('span', { class: 'cell-num chance', text: '\u2014' }),
        el('span', { class: 'cell-num' }, [usd(offer.reservationPremiumUsd), el('small', { text: 'to reserve' })]),
        el('span', { class: 'cell-num col-bid' }, [usd(offer.guaranteedPricePerRequestUsd), el('small', { text: 'per call' })])
      ];
    return el('div', { class: 'market' + (open ? ' open' : '') + (item.held ? ' held' : '') }, [
      el('button', {
        class: 'row', type: 'button', 'aria-expanded': String(open), 'aria-controls': id,
        onclick: function () { state.selected = open ? null : item.id; renderMarkets(); }
      }, [
        el('span', {}, [el('span', { class: 'row-title', text: item.name }), el('span', { class: 'row-meta' }, meta)])
      ].concat(cells).concat([el('span', { class: 'chev', 'aria-hidden': 'true', text: '\u203A' })])),
      open ? renderDetail(item, id) : null
    ]);
  }

  function factList(rows) {
    return el('dl', { class: 'facts' }, rows.map(function (row) { return el('div', {}, [el('dt', { text: row[0] }), el('dd', { text: cleanLabel(row[1]) })]); }));
  }

  function renderBook(book) {
    var bids = (book.bids || []).slice(0, 5);
    var asks = (book.asks || []).slice(0, 5);
    var max = Math.max.apply(null, [1].concat(bids.concat(asks).map(function (level) { return num(level.quantity); })));
    function row(level, side) {
      return el('tr', { class: side }, [
        el('td', { class: 'px' }, [el('span', { text: usd(level.priceUsd) })]),
        el('td', {}, [el('i', { class: 'depth', style: 'width:' + width(num(level.quantity), max) }), el('span', { text: String(level.quantity) })])
      ]);
    }
    var rows = asks.slice().reverse().map(function (level) { return row(level, 'ask'); });
    rows.push(el('tr', { class: 'spread' }, [el('td', { colspan: '2', text: bids.length && asks.length ? 'Spread ' + usd(num(asks[0].priceUsd) - num(bids[0].priceUsd)) : 'One side of the book is empty' })]));
    bids.forEach(function (level) { rows.push(row(level, 'bid')); });
    return el('table', { class: 'book', 'aria-label': 'Order book' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Price' }), el('th', { text: 'Contracts' })])]),
      el('tbody', {}, rows)
    ]);
  }

  function renderDetail(item, id) {
    var quote = item.quote;
    var offer = item.offer;
    var left;
    var facts;
    var more;
    if (quote) {
      var instrument = quote.instrument || {};
      var fees = quote.fees || {};
      var feeTotal = num(fees.tradingFeeUsd) + num(fees.networkFeeUsd) + num(fees.conversionFeeUsd) + num(fees.modeledSlippageUsd) + num(fees.otherFeeUsd);
      left = item.book ? renderBook(item.book) : el('p', { class: 'note-line', text: 'No order book on Switchboard for this venue. The price is a snapshot quote.' });
      facts = [
        ['Pays', usd(instrument.payoutPerUnitUsd) + ' per contract'],
        ['Resolves when', instrument.eventRule || 'n/a'],
        ['Expires', instrument.expiresAt ? new Date(instrument.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'n/a'],
        ['Cost for ' + quote.requestedQuantity, usd(quote.estimatedAllInBuyCostUsd) + ' with fees']
      ];
      more = [
        ['Type', SETTLEMENT[instrument.settlementType] || String(instrument.settlementType || 'n/a')],
        ['Available', quote.availableQuantity + ' contracts'],
        ['Fees', usd(feeTotal)],
        ['Basis risk', quote.basisRiskDescription],
        ['Eligibility', quote.eligibilityReason || 'n/a']
      ];
    } else {
      left = el('p', { class: 'note-line', text: 'If your primary provider fails, the agent can pay for this backup through Mastercard Agent Pay, inside the failover budget you approve.' });
      facts = [
        ['Price', usd(offer.guaranteedPricePerRequestUsd) + ' per request'],
        ['Reservation', usd(offer.reservationPremiumUsd)],
        ['Capacity', offer.throughputPerSecond + ' requests a second'],
        ['Verified', offer.verifiedCapacity ? 'Yes' : 'Pending']
      ];
      more = [['Task', offer.qualifiedTask], ['Region', offer.region], ['Benchmark', offer.qualificationBenchmark]];
    }
    return el('div', { class: 'detail', id: id }, [
      el('div', { class: 'detail-grid' }, [
        left,
        el('div', {}, [factList(facts), el('details', { class: 'more' }, [el('summary', { text: 'More details' }), factList(more)])])
      ])
    ]);
  }

  function renderCoverage(plan) {
    var company = state.analysis && state.analysis.company;
    var scenarios = (company && company.scenarios) || [];
    var maxLoss = Math.max.apply(null, [1].concat(scenarios.map(function (scenario) { return num(scenario.baselineLossUsd); })));
    return el('section', { class: 'coverage', 'aria-label': 'What your hedge pays' }, [
      el('h2', { text: 'What your hedge pays' }),
      el('p', { text: 'Your loss in each scenario, and how much of it the hedge covers.' }),
      el('div', { class: 'cov-rows' }, scenarios.map(function (scenario) {
        var loss = num(scenario.baselineLossUsd);
        var pays = plan.legs.reduce(function (sum, leg) { return sum + num(leg.payoffByScenarioUsd && leg.payoffByScenarioUsd[scenario.scenarioId]); }, 0);
        return el('div', { class: 'cov-row' }, [
          el('div', { class: 'cov-top' }, [
            el('span', {}, [scenario.label, el('small', { text: pct(Number(scenario.probability)) + '% a month' })]),
            el('span', {}, loss > 0 ? ['Pays ', el('b', { text: usd(pays) }), ' against a ' + usd(loss) + ' loss'] : ['No loss'])
          ]),
          el('div', { class: 'cov-bar', 'aria-hidden': 'true' }, [
            el('i', { class: 'loss', style: 'width:' + width(loss, maxLoss) }),
            el('i', { class: 'covered', style: 'width:' + width(Math.min(pays, loss), maxLoss) })
          ])
        ]);
      }))
    ]);
  }

  /* Slip */

  function legName(leg) {
    var items = marketItems();
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].id === leg.quoteId || items[i].id === leg.capacityOfferId) return items[i].name;
    }
    return leg.kind === 'capacity' ? 'Standby capacity' : 'Market contract';
  }

  function renderSlip() {
    var root = $('slip');
    clear(root);
    var plan = state.quoted && state.quoted.plan;
    root.appendChild(el('div', { class: 'slip-head' }, [
      el('h2', { text: state.result ? 'Receipt' : 'Your hedge' }),
      el('span', { text: MODES.filter(function (mode) { return mode[0] === state.mode; })[0][1] })
    ]));
    if (state.result) { renderReceipt(root, state.result); return; }
    if (!plan) {
      root.appendChild(el('div', { class: 'slip-sec' }, [
        state.phase === 'error'
          ? el('p', { class: 'muted', style: 'font-size:13px', text: 'No hedge yet.' })
          : el('div', { class: 'skeleton', 'aria-hidden': 'true' }, [el('i', { style: 'width:70%' }), el('i', { style: 'width:45%' }), el('i', { style: 'width:85%' })])
      ]));
      return;
    }
    if (state.notice) root.appendChild(el('div', { class: 'slip-sec' }, [message('warn', state.notice)]));
    if (!plan.legs.length) {
      root.appendChild(el('div', { class: 'slip-sec' }, [
        el('p', { style: 'font-size:13.5px', text: 'No contract fits inside this budget, so the plan is to hold the risk.' }),
        el('p', { class: 'muted', style: 'font-size:13px;margin-top:0.5rem', text: 'That is a valid answer. Try a bigger budget, another priority, or a business these markets cover.' })
      ]));
      return;
    }
    root.appendChild(el('div', { class: 'slip-sec' }, plan.legs.map(function (leg) {
      var qty = num(leg.quantity);
      var each = qty > 0 ? num(leg.estimatedAllInCostUsd) / qty : 0;
      return el('div', { class: 'leg' }, [
        el('span', { class: 'leg-name', text: legName(leg) }),
        el('span', { class: 'leg-cost', text: usd(leg.estimatedAllInCostUsd) }),
        el('span', { class: 'leg-sub', text: leg.quantity + ' contracts at ' + usd(each) + ' on ' + (VENUE[leg.venue] || leg.venue) })
      ]);
    })));
    var budget = num(plan.budgetUsd);
    var premium = num(plan.estimatedTotalCostUsd);
    root.appendChild(el('div', { class: 'slip-sec' }, [
      el('div', { class: 'total' }, [el('span', { text: 'Premium' }), el('strong', { text: usd(plan.estimatedTotalCostUsd) })]),
      el('div', { class: 'meter', 'aria-hidden': 'true' }, [el('i', { style: 'width:' + width(premium, budget) })]),
      el('p', { class: 'meter-label', text: (budget > 0 ? Math.round((premium / budget) * 100) : 0) + '% of your ' + usd(plan.budgetUsd) + ' monthly budget' })
    ]));
    root.appendChild(el('div', { class: 'slip-sec' }, [
      ['Worst scenario', 'worstScenarioLossUsd'],
      ['Average of worst 5%', 'cvar95LossUsd']
    ].map(function (row) {
      var before = num(plan.before[row[1]]);
      var after = num(plan.after[row[1]]);
      return el('div', { class: 'line-item' }, [
        el('span', { text: row[0] }),
        el('span', { 'aria-label': usd(before) + ' without the hedge, ' + usd(after) + ' with it' }, [usd(before), el('span', { class: 'arrow', text: '\u2192' }), el('b', { class: after < before ? 'up' : '', text: usd(after) })])
      ]);
    }).concat([el('p', { class: 'meter-label', style: 'margin-top:0.6rem', text: 'Monthly loss without and with the hedge, premium included.' })])));

    var ledgerOn = ledgerReady();
    var useLedger = ledgerOn && state.approveWith !== 'app';
    var toggle = ledgerOn ? el('div', { class: 'segmented method', role: 'group', 'aria-label': 'Approve with' }, [
      el('button', { type: 'button', 'aria-pressed': String(useLedger), onclick: function () { state.approveWith = 'ledger'; renderSlip(); } }, ['Ledger']),
      el('button', { type: 'button', 'aria-pressed': String(!useLedger), onclick: function () { state.approveWith = 'app'; renderSlip(); } }, ['In app'])
    ]) : null;
    var consentBlock;
    var go;
    if (useLedger) {
      go = el('button', { class: 'btn btn-primary btn-lg', type: 'button', id: 'run' }, ['Approve on Ledger']);
      go.addEventListener('click', function () { execute(plan, 'ledger'); });
      consentBlock = el('p', { class: 'note-line', style: 'font-size:12.5px', text: 'The Ledger shows this plan\u2019s hash, ending in ' + hashEnding(plan.planHash) + '. Check it, then hold to sign. That approves the hedge and a $10 failover budget for a sandbox run.' });
    } else {
      var check = el('input', { type: 'checkbox', id: 'consent' });
      go = el('button', { class: 'btn btn-primary btn-lg', type: 'button', id: 'run' }, ['Approve hedge']);
      go.disabled = true;
      check.addEventListener('change', function () { go.disabled = !check.checked || state.busy; });
      go.addEventListener('click', function () { execute(plan, 'app'); });
      consentBlock = el('label', { class: 'consent', for: 'consent' }, [check, el('span', { text: 'Approve this hedge and a $10 failover budget for a sandbox run. In-app approval, not a Ledger signature.' })]);
    }
    root.appendChild(el('div', { class: 'slip-sec' }, [
      toggle,
      consentBlock,
      el('div', { class: 'slip-cta' }, [go]),
      el('div', { id: 'run-status', role: 'status' }),
      el('p', { class: 'slip-foot', title: plan.planHash, text: 'Prices are re-checked when you approve. Plan ' + shortHash(plan.planHash) })
    ]));
  }

  function ledgerReady() {
    return !!(state.ledgerStatus && state.ledgerStatus.enabled && state.ledgerStatus.reachable);
  }

  function modelName() {
    var model = String((state.ledgerStatus && state.ledgerStatus.model) || 'STAX').toLowerCase().replace(/_/g, ' ');
    return 'Ledger ' + model.charAt(0).toUpperCase() + model.slice(1);
  }

  // The emulator screen, live. Click to tap; keep the mouse down to hold to sign.
  function devicePanel(planHash) {
    var img = el('img', { class: 'device-screen', alt: 'Ledger screen. Click to tap, keep the mouse down to hold.', draggable: 'false' });
    var pressed = null;
    function send(action, point) {
      fetch('/demo/ledger/finger', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: action, x: point.x, y: point.y }) }).catch(function () {});
    }
    img.addEventListener('pointerdown', function (event) {
      if (!img.naturalWidth) return;
      event.preventDefault();
      img.setPointerCapture(event.pointerId);
      var rect = img.getBoundingClientRect();
      pressed = {
        x: Math.round(((event.clientX - rect.left) * img.naturalWidth) / rect.width),
        y: Math.round(((event.clientY - rect.top) * img.naturalHeight) / rect.height)
      };
      send('press', pressed);
    });
    function release() {
      if (!pressed) return;
      send('release', pressed);
      pressed = null;
    }
    img.addEventListener('pointerup', release);
    img.addEventListener('pointercancel', release);
    function refresh() {
      var next = new Image();
      next.onload = function () { img.src = next.src; };
      next.src = '/demo/ledger/screen?t=' + Date.now();
    }
    refresh();
    var timer = setInterval(refresh, 450);
    return {
      node: el('div', { class: 'device' }, [
        el('p', { class: 'device-hint', text: 'Review on the device. The memo is this plan, ending in ' + hashEnding(planHash) + '. Then hold to sign.' }),
        img,
        el('p', { class: 'device-foot', text: modelName() + ' emulator (Speculos) running the XRP app' })
      ]),
      stop: function () { clearInterval(timer); }
    };
  }

  async function execute(plan, method) {
    if (state.busy) return;
    state.busy = true;
    var go = $('run');
    go.disabled = true;
    if ($('consent')) $('consent').disabled = true;
    clear(go);
    go.appendChild(el('span', { class: 'spinner', 'aria-hidden': 'true' }));
    go.appendChild(document.createTextNode(method === 'ledger' ? 'Waiting for the Ledger' : 'Approving'));
    var panel = method === 'ledger' ? devicePanel(plan.planHash) : null;
    if (panel) $('run-status').appendChild(panel.node);
    var result = await post('/demo/execute', { company: state.analysis.company, mode: state.mode, reviewedPlan: plan, confirm: true, liveMarkets: state.discovery ? state.discovery.markets : [], approval: method === 'ledger' ? 'ledger' : 'app' });
    if (panel) panel.stop();
    state.busy = false;
    if (result.status === 409 && result.body.requote && result.body.plan) {
      acceptQuote(result.body);
      state.notice = messageOf(result.body, 'The market moved since you reviewed it. Check the new hedge and approve again.');
      renderSlip();
      return;
    }
    if (!result.body.steps) {
      renderSlip();
      $('run-status').appendChild(message('bad', messageOf(result.body, 'The run did not start. Nothing was ordered.')));
      return;
    }
    state.result = result.body;
    renderSlip();
  }

  function drillCopy(failover) {
    var state = failover && failover.state ? String(failover.state) : '';
    var spend = usd((failover && failover.ap4mSpendingUsd) || '0');
    if (state === 'RLUSD_SETTLED') return 'The agent paid ' + spend + ' and settlement returned an RLUSD payout.';
    if (state === 'VOUCHER_SIGNED') return 'Inside the $10 budget you approved, the agent signed a mock voucher for backup capacity. No RLUSD moved. Mastercard Agent Pay stays idle until the portal credentials are set.';
    if (!state) return 'The outage drill did not run.';
    return 'The drill stopped at ' + state.replace(/_/g, ' ').toLowerCase() + '. Agent spend ' + spend + '.';
  }

  function chainCopy(network) {
    if (!network || network.blockNumber === null || network.blockNumber === undefined) return 'The testnet head was not read on this run.';
    var via = network.provider === 'quicknode' ? 'QuickNode' : 'the public XRPL EVM testnet RPC';
    return 'Read block ' + network.blockNumber + ' through ' + via + '.';
  }

  function renderReceipt(root, body) {
    var steps = body.steps || [];
    var run = body.run || {};
    var failover = body.failover || {};
    var network = body.network || {};
    var orders = Array.isArray(run.orders) ? run.orders : [];
    var plan = body.plan || (state.quoted && state.quoted.plan) || {};
    var noTrade = !orders.length && steps.some(function (step) { return step.name === 'orders'; });
    var headline = body.ok ? (noTrade ? 'Nothing to place' : 'Outage handled in sandbox') : 'Run stopped';
    var sub = orders.length
      ? orders.length + (orders.length === 1 ? ' simulated fill, ' : ' simulated fills, ') + usd(plan.estimatedTotalCostUsd) + ' premium'
      : 'No order submitted';
    root.appendChild(el('div', { class: 'slip-sec' }, [
      el('div', { class: 'receipt-head' }, [
        el('span', { class: 'tick ' + (body.ok ? 'ok' : 'bad'), 'aria-hidden': 'true', text: body.ok ? '\u2713' : '!' }),
        el('div', {}, [el('strong', { text: headline }), el('span', { text: sub })])
      ])
    ]));
    if (body.ok && !noTrade) {
      root.appendChild(el('div', { class: 'slip-sec' }, [
        el('ol', { class: 'story' }, [
          el('li', {}, [el('span', { class: 'n', text: '1' }), el('div', {}, [el('b', { text: 'The hedge is on' }), el('span', { text: 'Sandbox fill at ' + (orders.map(function (order) { return usd(order.averageFillPriceUsd); }).join(', ') || 'the quoted price') + '. Simulated. Nothing reached a live venue.' })])]),
          el('li', {}, [el('span', { class: 'n', text: '2' }), el('div', {}, [el('b', { text: 'The primary API goes down' }), el('span', { text: drillCopy(failover) })])]),
          el('li', {}, [el('span', { class: 'n', text: '3' }), el('div', {}, [el('b', { text: 'The chain was read' }), el('span', { text: chainCopy(network) })])]),
          body.ledger ? el('li', {}, [el('span', { class: 'n', text: '4' }), el('div', {}, [el('b', { text: 'Approved on the Ledger' }), el('span', {}, [el('a', { href: body.ledger.explorerUrl, target: '_blank', rel: 'noopener', title: body.ledger.txHash, text: shortHash(body.ledger.txHash) })])])]) : null
        ])
      ]));
    }
    root.appendChild(el('div', { class: 'slip-sec' }, [
      body.note ? el('p', { class: 'note-line', text: body.note }) : null,
      el('details', { class: 'trace' }, [
        el('summary', { text: 'Run trace' }),
        el('ol', { class: 'steps' }, steps.map(function (step) {
          var good = step.status >= 200 && step.status < 300;
          return el('li', { class: good ? '' : 'bad' }, [el('span', {}, [STEP[step.name] || step.name, good ? null : el('small', { text: step.detail })])]);
        }))
      ]),
      el('button', { class: 'btn btn-ghost btn-lg', type: 'button', style: 'margin-top:1rem', onclick: function () { state.result = null; renderSlip(); } }, ['Back to the hedge'])
    ]));
  }

  /* Sample */

  async function runSample() {
    if (state.busy) return;
    var button = $('sample');
    state.busy = true;
    button.disabled = true;
    $('desc').value = EXAMPLES[0];
    $('jurisdiction').value = 'US';
    $('budget').value = '800';
    $('tail').value = '8000';
    $('mode-select').value = 'min_cvar';
    state.mode = 'min_cvar';
    autoGrow();
    clear($('intro-msg'));
    state.phase = 'pricing';
    state.analysis = { company: { name: 'Sample company', jurisdiction: 'US', monthlyHedgeBudgetUsd: '800', maxTolerableTailLossUsd: '8000', exposures: [], scenarios: [] } };
    state.quoted = null;
    state.result = null;
    render();
    toTop();
    var result = await post('/demo/proof', { confirm: true });
    state.busy = false;
    button.disabled = false;
    var body = result.body || {};
    if (!body.company) {
      state.phase = 'error';
      state.error = messageOf(body, body.note || 'The sample run failed before the company was read.');
      render();
      return;
    }
    state.analysis = { company: body.company, assumptions: [], warnings: [] };
    state.discovery = null;
    state.confirmed = true;
    if (body.plan) acceptQuote({ search: body.marketSearch, plan: body.plan, books: body.books });
    else { state.phase = 'error'; state.error = body.note || 'The sample run did not return a plan.'; }
    state.result = body;
    render();
  }

  $('sample').addEventListener('click', runSample);

  /* Integrations */

  function sponsor(title, color, label, detail) {
    return el('div', { class: 'sponsor' }, [
      el('h4', { text: title }),
      el('span', { class: 'state', style: 'color:' + color }, [el('i', { style: 'background:' + color }), label]),
      el('p', { text: detail })
    ]);
  }

  var ledgerStatusLoad = fetch('/demo/ledger/status').then(function (response) { return response.json(); }).then(function (status) {
    state.ledgerStatus = status;
    if (ledgerReady()) {
      var claim = $('claim-ledger');
      clear(claim);
      claim.appendChild(el('strong', { text: 'Ledger.' }));
      claim.appendChild(document.createTextNode(' Plans can be approved on a ' + modelName() + ' emulator (Speculos) running the real XRP app. The server verifies each signature, account, and plan hash, then submits it to XRPL testnet. This is an emulator, not a physical device. ledger_agent_intent stays unsupported on chain id 1449000.'));
    }
    if (state.phase === 'priced' && !state.busy) renderSlip();
    return status;
  }).catch(function () { return null; });

  fetch('/demo/network').then(function (response) { return response.json(); }).then(function (network) {
    var meta = $('chain-meta');
    if (!meta || !network || network.blockNumber === null || network.blockNumber === undefined || !network.chainMatches) return;
    meta.textContent = 'XRPL EVM testnet, block ' + network.blockNumber;
  }).catch(function () {});

  Promise.all([fetch('/demo/sponsors').then(function (response) { return response.json(); }), ledgerStatusLoad]).then(function (loaded) {
    var s = loaded[0];
    var device = loaded[1];
    var root = $('sponsors');
    clear(root);
    var ap4m = s.ap4m || {};
    var quicknode = s.quicknode || {};
    var aws = s.aws || {};
    var ledger = s.ledger || {};
    var missing = Array.isArray(ap4m.missing) ? ap4m.missing : [];
    var amber = 'var(--amber)';
    var green = 'var(--green)';
    var grey = 'var(--faint)';
    root.appendChild(sponsor('Mastercard Agent Pay', missing.length ? amber : green, missing.length ? 'Setting up' : 'Configured', 'Pays for backup capacity when your provider goes down, inside the budget you approve.' + (missing.length ? ' Not live yet, so the outage drill signs a mock voucher.' : '')));
    root.appendChild(sponsor('QuickNode', quicknode.provider === 'quicknode' ? green : amber, quicknode.provider === 'quicknode' ? 'Connected' : 'Public RPC instead', 'Reads XRPL EVM blocks and PaymentLedger events.' + (typeof quicknode.eventCount === 'number' ? ' ' + quicknode.eventCount + ' recent ' + (quicknode.eventCount === 1 ? 'event' : 'events') + '.' : '')));
    if (s.aws) root.appendChild(sponsor('AWS AgentCore', aws.deployed ? green : amber, aws.deployed ? 'Deployed' : 'Local contract only', aws.note || ''));
    if (device && device.enabled && device.reachable) {
      root.appendChild(sponsor('Ledger', green, 'Emulator connected', device.note + ' Account ' + device.address + ' on XRPL testnet.'));
    } else {
      root.appendChild(sponsor('Ledger', ledger.signed ? green : grey, ledger.signed ? 'Signed' : 'Connect a device', 'Plain-language previews of every XRPL transaction before you sign.'));
    }
  }).catch(function () {
    var root = $('sponsors');
    clear(root);
    root.appendChild(message('bad', 'Integration status did not load. Reload the page to try again.'));
  });

  autoGrow();
  render();
})();
</script>
</body>
</html>`;
}

// services/execution/src/ap4m.ts
import { createHmac, randomUUID as randomUUID2 } from "node:crypto";

// services/execution/src/money.ts
import { createRequire } from "node:module";
var require2 = createRequire(import.meta.url);
var loaded = require2("decimal.js");
var Decimal = loaded;
var MONEY = /^-?[0-9]+(?:\.[0-9]+)?$/;
function isMoney(value) {
  return typeof value === "string" && MONEY.test(value);
}
function toDecimalString(value) {
  const amount = typeof value === "string" ? new Decimal(value) : value;
  if (!amount.isFinite()) throw new Error("non-finite decimal");
  let text2 = amount.toFixed(Math.max(0, amount.decimalPlaces()));
  if (text2.includes(".")) {
    text2 = text2.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (text2 === "-0") return "0";
  return text2;
}
function greaterThan(left, right) {
  return new Decimal(left).gt(right);
}
function minDecimal(values) {
  if (values.length === 0) throw new Error("empty decimal list");
  let best = new Decimal(values[0]);
  for (const value of values.slice(1)) best = Decimal.min(best, value);
  return toDecimalString(best);
}
function maxDecimal(left, right) {
  return toDecimalString(Decimal.max(left, right));
}
function addMoney(left, right) {
  return toDecimalString(new Decimal(left).plus(right));
}
function subtractMoney(left, right) {
  return toDecimalString(new Decimal(left).minus(right));
}
function allInUnitPrice(costUsd, quantity) {
  const qty = new Decimal(quantity);
  if (!qty.gt(0)) throw new Error("INVALID_QUANTITY");
  return toDecimalString(new Decimal(costUsd).div(qty));
}
function sumMoney(values) {
  return toDecimalString(values.reduce((acc, value) => acc.plus(value), new Decimal(0)));
}

// services/execution/src/plan-hash.ts
import { createHash as createHash2 } from "node:crypto";
import { createRequire as createRequire2 } from "node:module";
var require3 = createRequire2(import.meta.url);
var canonicalize = require3("canonicalize");
var PLACEHOLDER_PLAN_HASH = "sha256:demo_only_untrusted_digest_replace_in_production";
function canonicalJson(value) {
  const json = canonicalize(value);
  if (json === void 0) throw new Error("value cannot be canonicalized");
  return json;
}
function sha256Prefixed(value) {
  const hex = createHash2("sha256").update(canonicalJson(value), "utf8").digest("hex");
  return `sha256:${hex}`;
}
function planHashPayload(plan) {
  return {
    planId: plan.planId,
    companyId: plan.companyId,
    version: plan.version,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    budgetUsd: plan.budgetUsd,
    estimatedTotalCostUsd: plan.estimatedTotalCostUsd,
    before: plan.before,
    after: plan.after,
    legs: plan.legs,
    rationale: plan.rationale,
    warnings: plan.warnings,
    syntheticDemo: plan.syntheticDemo
  };
}
function computePlanHash(plan) {
  return sha256Prefixed(planHashPayload(plan));
}
function isPlaceholderPlanHash(value) {
  return value === PLACEHOLDER_PLAN_HASH;
}
function withComputedPlanHash(plan) {
  const clone = structuredClone(plan);
  clone.planHash = computePlanHash(clone);
  return clone;
}

// services/execution/src/settlement.ts
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// services/execution/src/capability-registry.ts
var XRPL_EVM_CHAIN_ID = 1449e3;
var LEDGER_AGENT_INTENT_DOC_URL = "https://developers.ledger.com/docs/ai-tools/agent-intent";
function ledgerAgentIntentWarning() {
  return `ledger_agent_intent is unsupported for XRPL EVM chain id ${XRPL_EVM_CHAIN_ID}. Ledger Agent Intent beta supports Ethereum and Solana only. ${LEDGER_AGENT_INTENT_DOC_URL}`;
}
function ledgerDmkUnsupportedWarning() {
  return "ledger_dmk_verified is UNSUPPORTED unless LEDGER_DMK_VERIFIED=true, deviceProofId is present, and signedIntent starts with dmk:. No physical Ledger device was observed. This is not Ledger Agent Intent.";
}
function ledgerDmkOperatorWarning() {
  return "method is ledger_dmk_verified because LEDGER_DMK_VERIFIED=true and a dmk: intent was presented. This process did not observe a physical Ledger device, device screen, or DMK session. Not Ledger Agent Intent and not hardware proof.";
}

// services/execution/src/settlement.ts
var REAL_TX_HASH = /^0x[0-9a-fA-F]{64}$/;
var SYNTHETIC_TX_HASH = "synthetic_not_a_transaction";
function unconfirmedReceipt(input) {
  return {
    receiptId: `receipt_${randomUUID()}`,
    kind: "exchange_settlement",
    chainId: XRPL_EVM_CHAIN_ID,
    transactionHash: SYNTHETIC_TX_HASH,
    confirmed: false,
    observedAt: input.now.toISOString(),
    metadata: {
      mode: input.mode,
      canReportRealTxHash: "false",
      note: input.note,
      ...input.extra
    }
  };
}
var SandboxSettlementSimulator = class {
  constructor(reason) {
    this.reason = reason;
  }
  mode = "sandbox_simulator";
  canReportRealTxHash = false;
  async observe(input) {
    return unconfirmedReceipt({
      now: input.now,
      mode: "sandbox_simulator",
      note: "Sandbox simulator cannot report a real transaction hash. No chain receipt was observed.",
      extra: {
        clientOrderId: input.clientOrderId,
        reason: this.reason,
        ...input.instrumentId ? { instrumentId: input.instrumentId } : {}
      }
    });
  }
};
var AbiLoadedSettlementClient = class {
  constructor(abiSummary) {
    this.abiSummary = abiSummary;
  }
  mode = "abi_loaded";
  canReportRealTxHash = false;
  async observe(input) {
    return unconfirmedReceipt({
      now: input.now,
      mode: "abi_loaded",
      note: "ABI was loaded but no RPC receipt was observed. Refusing to invent a transaction hash.",
      extra: {
        clientOrderId: input.clientOrderId,
        abi: this.abiSummary,
        ...input.instrumentId ? { instrumentId: input.instrumentId } : {}
      }
    });
  }
};
function createSettlementClient(abiPath, readText = (filePath) => readFileSync(filePath, "utf8")) {
  if (!abiPath) return new SandboxSettlementSimulator("EXECUTION_EXCHANGE_ABI_PATH unset");
  try {
    const parsed = JSON.parse(readText(abiPath));
    const summary = Array.isArray(parsed) ? `array:${parsed.length}` : typeof parsed;
    return new AbiLoadedSettlementClient(summary);
  } catch {
    return new SandboxSettlementSimulator("abi_path_unreadable");
  }
}
function isRealTxHash(value) {
  return typeof value === "string" && REAL_TX_HASH.test(value);
}

// services/execution/src/ap4m.ts
function decide402(input) {
  const minQuality = input.minQuality ?? 0.5;
  if (!input.fallbackHealthy) {
    return { pay: false, outcome: "unavailable", reason: "Fallback failed the availability or quality benchmark." };
  }
  if (input.quality !== void 0 && input.quality < minQuality) {
    return { pay: false, outcome: "fail_closed", reason: "Circuit breaker: fallback quality below the gate." };
  }
  if (!input.balanceAvailable) {
    return { pay: false, outcome: "budget_blocked", reason: "No AP4M agent balance is available to this process." };
  }
  if (!input.quotedUsd || !isMoney(input.quotedUsd)) {
    return { pay: false, outcome: "fail_closed", reason: "HTTP 402 did not include a decimal quote this process can authorize." };
  }
  const cap = minDecimal([input.remainingBudgetUsd, input.maxPerTriggerUsd]);
  if (greaterThan(input.quotedUsd, cap)) {
    return {
      pay: false,
      outcome: "budget_blocked",
      reason: `Budget exceeded: quote ${input.quotedUsd} exceeds remaining cap ${cap}.`
    };
  }
  if (!input.voucherValid) {
    return { pay: false, outcome: "fail_closed", reason: "HTTP 402 was presented but the voucher is invalid." };
  }
  return { pay: true, outcome: "pay", reason: "Quote is within the preapproved cap and the fallback passed the local gates." };
}
var localHmacSigner = {
  async sign(payload, privateKey) {
    return createHmac("sha256", privateKey).update(payload).digest("hex");
  }
};
var InMemoryAp4mClient = class {
  constructor(config, signer = localHmacSigner) {
    this.config = config;
    this.signer = signer;
  }
  creations = [];
  byKey = /* @__PURE__ */ new Map();
  async createVoucher(input) {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return existing;
    let signatureProduced = false;
    if (input.mode === "live" && this.config.ap4mAgentPrivateKey && this.config.xrplEvmRpcUrl) {
      const payload = canonicalJson({
        quotedUsd: input.quotedUsd,
        idempotencyKey: input.idempotencyKey,
        note: "not an AP4M EIP-712 voucher"
      });
      await this.signer.sign(payload, this.config.ap4mAgentPrivateKey);
      signatureProduced = true;
    }
    const record = {
      voucherId: `voucher_${randomUUID2()}`,
      submitted: false,
      signatureProduced
    };
    this.byKey.set(input.idempotencyKey, record);
    this.creations.push(record.voucherId);
    return record;
  }
};
function createAp4mClient(config) {
  return new InMemoryAp4mClient(config);
}

// services/execution/src/ap4m-live.ts
function filled(env, names) {
  return names.some((name) => {
    const value = env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
}
function valueOf(env, names) {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return void 0;
}
function ap4mRpcUrl(env) {
  const quicknode = valueOf(env, ["QUICKNODE_RPC_URL", "QUICKNODE_XRPL_EVM_HTTP"]);
  if (quicknode) return { url: quicknode, via: "quicknode" };
  return {
    url: valueOf(env, ["XRPL_EVM_RPC_URL", "AP4M_RPC_URL"]) ?? "https://rpc.testnet.xrplevm.org",
    via: "public-xrpl-evm-testnet"
  };
}
function missingAp4mPayment(env) {
  const missing = [];
  if (!filled(env, ["AP4M_AGENT_PRIVATE_KEY", "AGENT_PRIVATE_KEY"])) missing.push("AP4M_AGENT_PRIVATE_KEY");
  if (!filled(env, ["AP4M_TEAM_NAME", "TEAM_NAME"])) missing.push("AP4M_TEAM_NAME");
  if (env.AP4M_MODE !== "live") missing.push("AP4M_MODE=live");
  if (!filled(env, ["AP4M_RESOURCE_URL", "RESOURCE_URL"])) missing.push("AP4M_RESOURCE_URL");
  if (!filled(env, ["AP4M_CHANNEL_ID", "CHANNEL_ID"]) && !filled(env, ["AP4M_CHANNEL_CAP", "CHANNEL_CAP"])) {
    missing.push("AP4M_CHANNEL_ID or AP4M_CHANNEL_CAP");
  }
  return missing;
}
function amountFrom402(body) {
  if (!body || typeof body !== "object") return void 0;
  const source = body;
  for (const key of ["amountUsd", "amount", "maxAmountRequired", "value", "price"]) {
    const value = source[key];
    if (typeof value === "string" && /^[0-9]+(?:\.[0-9]+)?$/.test(value.trim())) return value.trim();
  }
  return void 0;
}
async function readJson2(response) {
  const text2 = await response.text();
  if (!text2) return {};
  try {
    return JSON.parse(text2);
  } catch {
    return { message: text2.slice(0, 300) };
  }
}
var empty = (missing, note, stepsRun = []) => ({
  settled: false,
  attempted: false,
  missing,
  stepsRun,
  txHash: null,
  payoutTx: null,
  receiptUrl: null,
  amountRlusd: null,
  note
});
async function runAp4mPayment(env = process.env, options = {}) {
  const missing = missingAp4mPayment(env);
  if (missing.length > 0) {
    return empty(missing, "Live RLUSD settlement was not attempted. No voucher was signed and no transaction hash was created.");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiUrl = (env.AP4M_BASE_URL ?? "https://hackathon.ap4m.build").replace(/\/$/, "");
  const resourceUrl = valueOf(env, ["AP4M_RESOURCE_URL", "RESOURCE_URL"]);
  const teamName = valueOf(env, ["AP4M_TEAM_NAME", "TEAM_NAME"]);
  const stepsRun = [];
  const resource = await fetchImpl(resourceUrl, { method: "GET" });
  const resourceBody = await readJson2(resource);
  stepsRun.push("fetch-resource");
  if (resource.status !== 402) {
    return {
      ...empty([], "The resource did not return HTTP 402, so no voucher was signed.", stepsRun),
      attempted: true
    };
  }
  const price = amountFrom402(resourceBody);
  if (!price) {
    return {
      ...empty([], "HTTP 402 had no decimal price this process will authorize. No voucher was signed.", stepsRun),
      attempted: true
    };
  }
  const signIn = options.signIn ?? (async () => {
    const { signInToAp4m: signInToAp4m2 } = await Promise.resolve().then(() => (init_ap4m_chain(), ap4m_chain_exports));
    const key = valueOf(env, ["AP4M_AGENT_PRIVATE_KEY", "AGENT_PRIVATE_KEY"]);
    return signInToAp4m2({ apiUrl, teamName, privateKey: key, fetchImpl });
  });
  const session = await signIn({ apiUrl, teamName });
  stepsRun.push("sign-in");
  const rpc2 = ap4mRpcUrl(env);
  const payOnChain = options.payOnChain ?? (async (input) => {
    const { redeemAp4mVoucher: redeemAp4mVoucher2 } = await Promise.resolve().then(() => (init_ap4m_chain(), ap4m_chain_exports));
    const key = valueOf(env, ["AP4M_AGENT_PRIVATE_KEY", "AGENT_PRIVATE_KEY"]);
    return redeemAp4mVoucher2({
      apiUrl,
      token: input.token,
      privateKey: key,
      rpcUrl: input.rpcUrl,
      priceRlusd: input.priceRlusd,
      ledgerAddress: valueOf(env, ["AP4M_PAYMENT_LEDGER"]) ?? "0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91",
      channelId: valueOf(env, ["AP4M_CHANNEL_ID", "CHANNEL_ID"]),
      capRlusd: valueOf(env, ["AP4M_CHANNEL_CAP", "CHANNEL_CAP"]),
      merchantId: valueOf(env, ["AP4M_MERCHANT_ID", "MERCHANT_ID"]),
      fetchImpl
    });
  });
  const paid = await payOnChain({ token: session.token, priceRlusd: price, rpcUrl: rpc2.url });
  stepsRun.push("redeem-voucher");
  if (!isRealTxHash(paid.txHash)) {
    return {
      ...empty([], "The chain step did not return a transaction hash. Nothing is marked settled.", stepsRun),
      attempted: true
    };
  }
  const recorded = await fetchImpl(`${apiUrl}/public/participant/record-redemption`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ tx_hash: paid.txHash })
  });
  stepsRun.push("record-redemption");
  if (!recorded.ok) {
    const body = await readJson2(recorded);
    const message = body && typeof body === "object" && "error" in body ? String(body.error) : `HTTP ${recorded.status}`;
    return {
      settled: false,
      attempted: true,
      missing: [],
      stepsRun,
      txHash: paid.txHash,
      payoutTx: null,
      receiptUrl: null,
      amountRlusd: null,
      note: `Voucher transaction ${paid.txHash} was submitted. record-redemption failed (${message}). RLUSD settlement is not confirmed.`
    };
  }
  let payoutTx = null;
  let receiptUrl = null;
  let amountRlusd = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const settled2 = await fetchImpl(`${apiUrl}/public/participant/settle`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.token}` },
      body: JSON.stringify(paid.channelId ? { channel_id: paid.channelId } : {})
    });
    const body = await readJson2(settled2);
    stepsRun.push(attempt === 0 ? "settle" : "settle-poll");
    if (!settled2.ok) {
      return {
        settled: false,
        attempted: true,
        missing: [],
        stepsRun,
        txHash: paid.txHash,
        payoutTx: null,
        receiptUrl: null,
        amountRlusd: null,
        note: `Redeem transaction ${paid.txHash} exists. Settle failed with HTTP ${settled2.status}. RLUSD payout is not confirmed.`
      };
    }
    if (body && typeof body === "object") {
      const record = body;
      if (typeof record.payout_tx === "string") payoutTx = record.payout_tx;
      if (typeof record.amount_rlusd === "string") amountRlusd = record.amount_rlusd;
      if (typeof record.receipt_url === "string") receiptUrl = record.receipt_url;
    }
    if (settled2.status !== 202) break;
  }
  const settled = isRealTxHash(payoutTx ?? void 0);
  return {
    settled,
    attempted: true,
    missing: [],
    stepsRun,
    txHash: paid.txHash,
    payoutTx,
    receiptUrl,
    amountRlusd,
    note: settled ? `RLUSD settle returned payout transaction ${payoutTx}.` : `Redeem transaction ${paid.txHash} was submitted. Settle did not return a payout transaction, so this is not marked as RLUSD settled.`
  };
}

// services/execution/src/aws-agentcore.ts
var REQUIRED = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AGENTCORE_RUNTIME_ARN"];
function awsAgentCoreEnabled(env = process.env) {
  return (env.AWS_AGENTCORE_ENABLED ?? "").trim().toLowerCase() === "true";
}
function regionValue(env) {
  const explicit = (env.SWITCHBOARD_AWS_REGION ?? "").trim();
  if (explicit) return explicit;
  const access = (env.AWS_ACCESS_KEY_ID ?? "").trim();
  const secret = (env.AWS_SECRET_ACCESS_KEY ?? "").trim();
  if (!access || !secret) return "";
  return (env.AWS_REGION ?? "").trim();
}
function awsSponsorStatus(env = process.env) {
  const missing = REQUIRED.filter((name) => {
    if (name === "AWS_REGION") return regionValue(env).length === 0;
    return !(env[name] ?? "").trim();
  });
  return {
    deployed: false,
    missing: [...missing],
    localEndpoints: ["/ping", "/invocations"],
    note: missing.length > 0 ? "AWS AgentCore is not deployed. GET /ping and POST /invocations implement the AgentCore HTTP contract on this process. Pasting AWS credentials does not by itself create a runtime." : "AWS credentials are present. This process still has no deployed AgentCore runtime. POST /invocations runs the local payment decision here."
  };
}
async function handleInvocation(body, env = process.env, fetchImpl = fetch) {
  const resourceUrl = body && typeof body === "object" && typeof body.resourceUrl === "string" ? body.resourceUrl : void 0;
  if (!resourceUrl) {
    return {
      protocol: "agentcore-http",
      pay: false,
      reason: "No resourceUrl was provided, so the agent did not look for an HTTP 402.",
      resourceStatus: null,
      awsDeployed: false,
      settlement: null
    };
  }
  const response = await fetchImpl(resourceUrl, { method: "GET" });
  if (response.status !== 402) {
    return {
      protocol: "agentcore-http",
      pay: false,
      reason: `Resource returned HTTP ${response.status}. The agent pays only after a 402.`,
      resourceStatus: response.status,
      awsDeployed: false,
      settlement: null
    };
  }
  let quoted = "1";
  try {
    const parsed = await response.json();
    if (typeof parsed.amountUsd === "string") quoted = parsed.amountUsd;
    else if (typeof parsed.amount === "string") quoted = parsed.amount;
  } catch {
    quoted = "1";
  }
  const cap = (env.AP4M_FALLBACK_BUDGET_USD ?? "25").trim() || "25";
  const decision = decide402({
    quotedUsd: quoted,
    remainingBudgetUsd: cap,
    maxPerTriggerUsd: cap,
    fallbackHealthy: true,
    voucherValid: true,
    balanceAvailable: true
  });
  if (!decision.pay) {
    return {
      protocol: "agentcore-http",
      pay: false,
      reason: decision.reason,
      resourceStatus: 402,
      awsDeployed: false,
      settlement: null
    };
  }
  const settlement = await runAp4mPayment({ ...env, AP4M_RESOURCE_URL: resourceUrl }, { fetchImpl });
  return {
    protocol: "agentcore-http",
    pay: true,
    reason: settlement.settled ? settlement.note : `${decision.reason} ${settlement.note}`,
    resourceStatus: 402,
    awsDeployed: false,
    settlement
  };
}

// services/execution/src/clear-sign.ts
var CLEAR_SIGN_DISCLAIMER = "Plain-language preview only. This process did not sign anything. It is not a Ledger device signature, not Ledger Clear Signing, and not an ERC-7730 file loaded on a device. ledger_agent_intent stays unsupported on XRPL EVM chain id 1449000. XRPL EVM mainnet chain id 1440000 is not used.";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (isRecord(value)) {
    const currency = typeof value.currency === "string" ? value.currency : "issued currency";
    const issuer = typeof value.issuer === "string" ? value.issuer : "unknown issuer";
    const amount = typeof value.value === "string" ? value.value : "unspecified amount";
    return `${amount} ${currency} issued by ${issuer}`;
  }
  return "not provided";
}
function drops(value) {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return `${value} drops of XRP (1 XRP = 1000000 drops)`;
  }
  return text(value);
}
function linesFrom(entries, format = text) {
  return entries.filter(([, value]) => value !== void 0).map(([label, value]) => ({ label, value: format(value) }));
}
function previewXrplTransaction(tx) {
  if (!isRecord(tx) || typeof tx.TransactionType !== "string") {
    return {
      transactionType: "unknown",
      summary: "This payload has no XRPL TransactionType. There is no type-aware summary, and nothing was signed.",
      lines: [],
      disclaimer: CLEAR_SIGN_DISCLAIMER
    };
  }
  const type = tx.TransactionType;
  const account = text(tx.Account);
  let summary = `${type} from ${account}. No type-aware field summary is available yet, so a device signer would only see raw bytes. Nothing was signed.`;
  let lines = linesFrom([
    ["Account", tx.Account],
    ["Destination", tx.Destination]
  ]);
  if (type === "TrustSet") {
    const limit = text(tx.LimitAmount);
    summary = `${account} would set a trust line for ${limit}. This lets that issuer's currency be held. It does not by itself send a payment. Nothing was signed.`;
    lines = linesFrom([
      ["Account", tx.Account],
      ["Limit", tx.LimitAmount],
      ["Flags", tx.Flags]
    ]);
  } else if (type === "OfferCreate") {
    summary = `${account} would place an order-book offer, paying ${drops(tx.TakerPays)} and asking ${drops(tx.TakerGets)}. Nothing was signed.`;
    lines = linesFrom([
      ["Account", tx.Account],
      ["Taker pays", tx.TakerPays],
      ["Taker gets", tx.TakerGets]
    ], drops);
  } else if (type === "AMMDeposit") {
    summary = `${account} would add liquidity to an AMM pool of ${text(tx.Asset)} and ${text(tx.Asset2)}. Amount ${drops(tx.Amount)}. Nothing was signed.`;
    lines = linesFrom([
      ["Account", tx.Account],
      ["Asset", tx.Asset],
      ["Asset 2", tx.Asset2],
      ["Amount", tx.Amount]
    ]);
    lines = lines.map((line) => line.label === "Amount" ? { ...line, value: drops(tx.Amount) } : line);
  } else if (type === "EscrowCreate") {
    summary = `${account} would lock ${drops(tx.Amount)} in escrow for ${text(tx.Destination)}. Nothing was signed.`;
    lines = linesFrom([
      ["Account", tx.Account],
      ["Destination", tx.Destination],
      ["Amount", tx.Amount],
      ["Cancel after", tx.CancelAfter],
      ["Finish after", tx.FinishAfter]
    ]);
    lines = lines.map((line) => line.label === "Amount" ? { ...line, value: drops(tx.Amount) } : line);
  } else if (type === "Payment") {
    summary = `${account} would pay ${drops(tx.Amount)} to ${text(tx.Destination)}. Nothing was signed.`;
    lines = linesFrom([
      ["Account", tx.Account],
      ["Destination", tx.Destination],
      ["Amount", tx.Amount],
      ["Send max", tx.SendMax]
    ]);
    lines = lines.map((line) => line.label === "Amount" || line.label === "Send max" ? { ...line, value: drops(tx[line.label === "Amount" ? "Amount" : "SendMax"]) } : line);
  }
  return { transactionType: type, summary, lines, disclaimer: CLEAR_SIGN_DISCLAIMER };
}
var SAMPLE_XRPL_TRANSACTIONS = [
  {
    TransactionType: "TrustSet",
    Account: "rDemoAccount111111111111111111",
    LimitAmount: { currency: "USD", issuer: "rIssuerDemo222222222222222222", value: "100" },
    Flags: 131072
  },
  {
    TransactionType: "OfferCreate",
    Account: "rDemoAccount111111111111111111",
    TakerPays: "1000000",
    TakerGets: { currency: "USD", issuer: "rIssuerDemo222222222222222222", value: "1" }
  },
  {
    TransactionType: "AMMDeposit",
    Account: "rDemoAccount111111111111111111",
    Asset: { currency: "XRP" },
    Asset2: { currency: "USD", issuer: "rIssuerDemo222222222222222222" },
    Amount: "5000000"
  },
  {
    TransactionType: "EscrowCreate",
    Account: "rDemoAccount111111111111111111",
    Destination: "rDestination333333333333333333",
    Amount: "2000000",
    CancelAfter: 84e7,
    FinishAfter: 83e7
  }
];

// services/execution/src/network.ts
function hostOf(rpcUrl) {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "invalid-rpc-url";
  }
}
function hexQuantity(value) {
  if (typeof value !== "string" || !value.startsWith("0x")) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : null;
}
async function rpc(fetchImpl, rpcUrl, method) {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] })
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(body.error?.message || `RPC HTTP ${response.status}`);
  }
  return body.result;
}
async function readNetwork(env = process.env, fetchImpl = fetch) {
  const quicknode = (env.QUICKNODE_RPC_URL ?? env.QUICKNODE_XRPL_EVM_HTTP ?? "").trim();
  const rpcUrl = quicknode || (env.XRPL_EVM_RPC_URL ?? "").trim() || "https://rpc.testnet.xrplevm.org";
  const provider = quicknode ? "quicknode" : "public-xrpl-evm-testnet";
  const expectedChainId = Number(env.XRPL_EVM_CHAIN_ID ?? 1449e3);
  const label = quicknode ? "QuickNode HTTP endpoint. The URL path is hidden because it can contain an API token." : "Public XRPL EVM testnet RPC (rpc.testnet.xrplevm.org). This request did not use QuickNode.";
  const base = {
    provider,
    label,
    rpcHost: hostOf(rpcUrl),
    expectedChainId: Number.isFinite(expectedChainId) ? expectedChainId : 1449e3
  };
  try {
    const chainHex = await rpc(fetchImpl, rpcUrl, "eth_chainId");
    const blockHex = await rpc(fetchImpl, rpcUrl, "eth_blockNumber");
    const chainId = hexQuantity(chainHex);
    const blockNumber = hexQuantity(blockHex);
    return {
      ...base,
      ok: chainId !== null && blockNumber !== null,
      chainId,
      blockNumber,
      chainMatches: chainId === base.expectedChainId,
      ...chainId !== null && chainId !== base.expectedChainId ? { error: `RPC chain id ${chainId} is not the expected XRPL EVM testnet chain id ${base.expectedChainId}.` } : {}
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      chainId: null,
      blockNumber: null,
      chainMatches: false,
      error: error instanceof Error ? error.message : "RPC request failed."
    };
  }
}

// services/execution/src/ap4m-status.ts
function filled2(env, names) {
  return names.some((name) => {
    const value = env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
}
function ap4mReadiness(env = process.env) {
  const missing = [];
  const present = [];
  if (filled2(env, ["AP4M_AGENT_PRIVATE_KEY", "AGENT_PRIVATE_KEY"])) present.push("agent key");
  else missing.push("AP4M_AGENT_PRIVATE_KEY");
  if (filled2(env, ["AP4M_TEAM_NAME", "TEAM_NAME"])) present.push("team name");
  else missing.push("AP4M_TEAM_NAME");
  const mode = env.AP4M_MODE === "live" ? "live" : "mock";
  if (mode !== "live") missing.push("AP4M_MODE=live");
  const note = missing.length > 0 ? "Live RLUSD settlement is not available. No voucher was signed and no transaction hash was created." : "Credentials are present in the environment. This status check does not open a channel, sign a voucher, or settle RLUSD.";
  return {
    mode,
    chainId: 1449e3,
    settled: false,
    missing,
    present,
    note,
    ledgerAgentIntent: "UNSUPPORTED on XRPL EVM chain id 1449000. Ledger Agent Intent is not claimed. Mainnet chain id 1440000 is not used."
  };
}

// services/execution/src/ledger-device.ts
async function ledgerDeviceStatus() {
  let packageLoaded = false;
  try {
    const packageName = "@ledgerhq/device-signer-kit-xrp";
    await import(packageName);
    packageLoaded = true;
  } catch {
    packageLoaded = false;
  }
  return {
    deviceSeen: false,
    signed: false,
    agentIntent: "UNSUPPORTED",
    chainId: 1449e3,
    signerPackage: "@ledgerhq/device-signer-kit-xrp",
    packageLoaded,
    clearSignFormat: "switchboard.xrpl-clear-sign.v1",
    note: packageLoaded ? "The Ledger XRP signer package loaded. No device session was opened, and ledger_agent_intent stays unsupported on chain id 1449000. Nothing was signed." : "No Ledger device is connected and the XRP signer package is not installed. The clear-signing parser is a preview. ledger_agent_intent stays unsupported on chain id 1449000. Nothing was signed."
  };
}

// services/execution/src/quicknode.ts
init_ap4m_chain();
var PAYMENT_LEDGER = "0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91";
var LOG_WINDOW = 20;
var LOG_CHUNK = 5;
function hostOf2(rpcUrl) {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "invalid-rpc-url";
  }
}
function target(env) {
  const quicknode = (env.QUICKNODE_RPC_URL ?? env.QUICKNODE_XRPL_EVM_HTTP ?? "").trim();
  if (quicknode) {
    return {
      url: quicknode,
      provider: "quicknode",
      label: "QuickNode HTTP endpoint. The URL path is hidden because it can contain an API token."
    };
  }
  return {
    url: (env.XRPL_EVM_RPC_URL ?? "").trim() || "https://rpc.testnet.xrplevm.org",
    provider: "public-xrpl-evm-testnet",
    label: "Public XRPL EVM testnet RPC. This log read did not use QuickNode."
  };
}
async function readPaymentLedgerLogs(env = process.env, fetchImpl = fetch, topic = REDEEMED_TOPIC) {
  const rpc2 = target(env);
  const contract = (env.AP4M_PAYMENT_LEDGER ?? PAYMENT_LEDGER).trim();
  const base = {
    provider: rpc2.provider,
    label: rpc2.label,
    rpcHost: hostOf2(rpc2.url),
    contract
  };
  try {
    const headResponse = await fetchImpl(rpc2.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal: AbortSignal.timeout(4e3)
    });
    const head = await headResponse.json();
    if (!headResponse.ok || typeof head.result !== "string") {
      throw new Error(head.error?.message || `RPC HTTP ${headResponse.status}`);
    }
    const toBlock = Number.parseInt(head.result, 16);
    const fromBlock = Math.max(0, toBlock - LOG_WINDOW);
    const ranges = [];
    for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK) {
      ranges.push([start, Math.min(start + LOG_CHUNK - 1, toBlock)]);
    }
    const chunks = await Promise.all(ranges.map(async ([start, end], index) => {
      const logsResponse = await fetchImpl(rpc2.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(4e3),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2 + index,
          method: "eth_getLogs",
          params: [{
            address: contract,
            fromBlock: `0x${start.toString(16)}`,
            toBlock: `0x${end.toString(16)}`,
            topics: [topic]
          }]
        })
      });
      const logsBody = await logsResponse.json();
      if (!logsResponse.ok || !Array.isArray(logsBody.result)) {
        throw new Error(logsBody.error?.message || `eth_getLogs HTTP ${logsResponse.status}`);
      }
      return logsBody.result;
    }));
    const logs = chunks.flat();
    const newest = logs.length > 0 ? logs[logs.length - 1] : void 0;
    return {
      ...base,
      ok: true,
      fromBlock,
      toBlock,
      eventCount: logs.length,
      newestTransactionHash: typeof newest?.transactionHash === "string" ? newest.transactionHash : null
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      fromBlock: null,
      toBlock: null,
      eventCount: 0,
      newestTransactionHash: null,
      error: error instanceof Error ? error.message : "Log read failed."
    };
  }
}

// services/execution/src/sponsors.ts
async function sponsorStatus(env = process.env, fetchImpl = fetch) {
  const [quicknode, ledger] = await Promise.all([
    readPaymentLedgerLogs(env, fetchImpl),
    ledgerDeviceStatus()
  ]);
  return {
    ap4m: ap4mReadiness(env),
    quicknode,
    ...awsAgentCoreEnabled(env) ? { aws: awsSponsorStatus(env) } : {},
    ledger
  };
}

// services/execution/src/app.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import Fastify from "fastify";

// services/execution/src/config.ts
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}
function clean(value) {
  if (value === void 0) return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function firstExisting(paths) {
  return paths.find((candidate) => candidate.length > 0 && existsSync(candidate));
}
function loadConfig(env = process.env) {
  const root = packageRoot();
  const privateKeyPath = clean(env.EXECUTION_AUTH_PRIVATE_KEY_PATH) ? path.resolve(env.EXECUTION_AUTH_PRIVATE_KEY_PATH) : firstExisting([
    path.join(process.cwd(), "services/execution/dev-keys/execution-auth-private.pem"),
    path.join(root, "dev-keys", "execution-auth-private.pem")
  ]) ?? path.join(root, "dev-keys", "execution-auth-private.pem");
  const publicKeyPath = clean(env.EXECUTION_AUTH_PUBLIC_KEY_PATH) ? path.resolve(env.EXECUTION_AUTH_PUBLIC_KEY_PATH) : firstExisting([
    path.join(process.cwd(), "services/execution/dev-keys/execution-auth-public.pem"),
    path.join(root, "dev-keys", "execution-auth-public.pem")
  ]) ?? path.join(root, "dev-keys", "execution-auth-public.pem");
  const port = Number(env.PORT ?? 4103);
  return {
    port: Number.isFinite(port) && port > 0 ? port : 4103,
    bearer: env.SWITCHBOARD_DEV_BEARER ?? "switchboard-dev-platform-token",
    marketsBaseUrl: (env.MARKETS_BASE_URL ?? "http://localhost:4102").replace(/\/$/, ""),
    serviceVersion: env.SERVICE_VERSION ?? "1.0.0",
    allowLive: env.EXECUTION_ALLOW_LIVE === "true",
    exchangeAbiPath: clean(env.EXECUTION_EXCHANGE_ABI_PATH),
    ap4mMode: env.AP4M_MODE === "live" ? "live" : "mock",
    ap4mBaseUrl: env.AP4M_BASE_URL ?? "https://hackathon.ap4m.build",
    ap4mAgentPrivateKey: clean(env.AP4M_AGENT_PRIVATE_KEY),
    xrplEvmRpcUrl: clean(env.XRPL_EVM_RPC_URL),
    xrplEvmChainId: Number(env.XRPL_EVM_CHAIN_ID ?? 1449e3),
    ledgerMode: env.LEDGER_MODE ?? "unsupported_until_verified",
    ledgerDmkVerified: env.LEDGER_DMK_VERIFIED === "true",
    privateKeyPath,
    publicKeyPath
  };
}

// services/execution/src/errors.ts
function apiError(code, message, correlationId2, retryable = false, details) {
  const body = { code, message, correlationId: correlationId2, retryable };
  if (details) body.details = details;
  return body;
}
var HttpError = class extends Error {
  constructor(statusCode, body, headers = {}) {
    super(body.message);
    this.statusCode = statusCode;
    this.body = body;
    this.headers = headers;
  }
};
function correlationId(headers, fallback) {
  const raw = headers["x-correlation-id"] ?? headers["x-request-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return fallback();
}
function headerString(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}

// services/execution/src/execution.ts
import { randomUUID as randomUUID3 } from "node:crypto";

// services/execution/src/store.ts
function createMemoryStore() {
  return {
    approvals: /* @__PURE__ */ new Map(),
    runs: /* @__PURE__ */ new Map(),
    runJtis: /* @__PURE__ */ new Map(),
    idempotency: /* @__PURE__ */ new Map(),
    revokedJtis: /* @__PURE__ */ new Set(),
    monitors: /* @__PURE__ */ new Map(),
    failovers: /* @__PURE__ */ new Map()
  };
}
function publicApproval(stored) {
  const approval = {
    approvalId: stored.approvalId,
    request: stored.request,
    status: stored.status,
    method: stored.method
  };
  if (stored.deviceProofId) approval.deviceProofId = stored.deviceProofId;
  if (stored.approvedAt) approval.approvedAt = stored.approvedAt;
  return approval;
}

// services/execution/src/execution.ts
var VENUES = [
  "kalshi",
  "polymarket_us",
  "polymarket_international",
  "switchboard",
  "capacity_provider"
];
var METHODS = ["app_manual", "ledger_agent_intent", "ledger_dmk_verified", "external_wallet"];
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isVenue(value) {
  return typeof value === "string" && VENUES.includes(value);
}
function readNow(raw, clock) {
  if (!raw) return { ok: true, now: clock() };
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return { ok: false, message: "X-Switchboard-Now must be an ISO-8601 timestamp." };
  return { ok: true, now: new Date(parsed) };
}
function validation(correlationId2, message) {
  return { status: 400, body: apiError("VALIDATION_ERROR", message, correlationId2, false) };
}
function parseApprovalRequest(body, correlationId2) {
  const { planId, planHash: planHash2, expiresAt, maxTotalSpendUsd, maxCollateralUsd, allowedVenues, ap4mFallbackBudgetUsd } = body;
  if (typeof planId !== "string" || planId.length === 0) return validation(correlationId2, "planId is required.");
  if (typeof planHash2 !== "string" || planHash2.length === 0) return validation(correlationId2, "planHash is required.");
  if (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt))) return validation(correlationId2, "expiresAt must be an ISO-8601 timestamp.");
  if (!isMoney(maxTotalSpendUsd) || !isMoney(maxCollateralUsd) || !isMoney(ap4mFallbackBudgetUsd)) {
    return validation(correlationId2, "Spend, collateral, and AP4M budget must be decimal strings.");
  }
  if (!Array.isArray(allowedVenues) || allowedVenues.length === 0 || !allowedVenues.every(isVenue)) {
    return validation(correlationId2, "allowedVenues must be a non-empty venue list.");
  }
  return {
    planId,
    planHash: planHash2,
    expiresAt,
    maxTotalSpendUsd,
    maxCollateralUsd,
    allowedVenues,
    ap4mFallbackBudgetUsd
  };
}
function isHandler(value) {
  return "status" in value && "body" in value;
}
function hashMismatch(correlationId2, message) {
  return { status: 409, body: apiError("PLAN_HASH_MISMATCH", message, correlationId2, false) };
}
async function createApproval(ctx, body, correlationId2) {
  if (!isRecord2(body)) return validation(correlationId2, "JSON object body is required.");
  if (!isRecord2(body.plan)) return { status: 400, body: apiError("PLAN_SNAPSHOT_REQUIRED", "Approval creation requires the hedge plan snapshot so the plan hash can be recomputed.", correlationId2, false) };
  const request = parseApprovalRequest(body, correlationId2);
  if (isHandler(request)) return request;
  const plan = body.plan;
  if (plan.planId !== request.planId) {
    return { status: 409, body: apiError("PLAN_ID_MISMATCH", "plan.planId does not match the approval planId.", correlationId2, false) };
  }
  let computed;
  try {
    computed = computePlanHash(plan);
  } catch {
    return validation(correlationId2, "Plan snapshot could not be canonicalized.");
  }
  if (isPlaceholderPlanHash(request.planHash) || typeof plan.planHash === "string" && isPlaceholderPlanHash(plan.planHash) || request.planHash !== computed || plan.planHash !== computed) {
    return hashMismatch(correlationId2, "Submitted planHash does not match the canonical SHA-256 of the plan snapshot. Placeholder digests are rejected.");
  }
  const stored = {
    approvalId: `approval_${randomUUID3()}`,
    request,
    planSnapshot: withComputedPlanHash(plan),
    status: "PENDING",
    method: "app_manual",
    issuedJtis: []
  };
  ctx.store.approvals.set(stored.approvalId, stored);
  return { status: 200, body: publicApproval(stored) };
}
function expired(expiresAt, now) {
  return now.getTime() >= Date.parse(expiresAt);
}
async function confirmApproval(ctx, approvalId, body, now, correlationId2) {
  const stored = ctx.store.approvals.get(approvalId);
  if (!stored) return { status: 404, body: apiError("APPROVAL_NOT_FOUND", "Approval was not found.", correlationId2, false) };
  if (!isRecord2(body) || typeof body.method !== "string" || typeof body.signedIntent !== "string") {
    return validation(correlationId2, "method and signedIntent are required.");
  }
  if (!METHODS.includes(body.method)) return validation(correlationId2, "Unknown approval method.");
  const confirm = body;
  if (expired(stored.request.expiresAt, now) || stored.status === "EXPIRED") {
    stored.status = "EXPIRED";
    ctx.tokens.revoke(stored.issuedJtis);
    return { status: 409, body: apiError("APPROVAL_EXPIRED", "Expired approval cannot be confirmed.", correlationId2, false, { status: "EXPIRED" }) };
  }
  if (stored.status === "APPROVED" || stored.status === "REJECTED") {
    return { status: 409, body: apiError("APPROVAL_ALREADY_DECIDED", "Approval was already decided.", correlationId2, false, { status: stored.status }) };
  }
  if (confirm.method === "ledger_agent_intent") {
    stored.status = "UNSUPPORTED";
    stored.method = "ledger_agent_intent";
    stored.approvedAt = void 0;
    stored.deviceProofId = void 0;
    stored.warning = ledgerAgentIntentWarning();
    ctx.tokens.revoke(stored.issuedJtis);
    return { status: 200, body: publicApproval(stored), headers: { "x-switchboard-warning": stored.warning } };
  }
  if (confirm.method === "ledger_dmk_verified") {
    const enabled = ctx.config.ledgerDmkVerified;
    const proof = typeof confirm.deviceProofId === "string" && confirm.deviceProofId.trim().length > 0;
    const intentOk = confirm.signedIntent.startsWith("dmk:");
    stored.method = "ledger_dmk_verified";
    if (enabled && proof && intentOk) {
      stored.status = "APPROVED";
      stored.deviceProofId = confirm.deviceProofId;
      stored.approvedAt = now.toISOString();
      stored.warning = ledgerDmkOperatorWarning();
    } else {
      stored.status = "UNSUPPORTED";
      stored.approvedAt = void 0;
      stored.deviceProofId = void 0;
      stored.warning = ledgerDmkUnsupportedWarning();
      ctx.tokens.revoke(stored.issuedJtis);
    }
    return { status: 200, body: publicApproval(stored), headers: { "x-switchboard-warning": stored.warning } };
  }
  const expected = `${confirm.method}:${stored.request.planHash}`;
  if (confirm.signedIntent !== expected) {
    return {
      status: 400,
      body: apiError("INVALID_SIGNED_INTENT", `signedIntent must equal ${expected}. Status was not changed.`, correlationId2, false, { status: stored.status })
    };
  }
  stored.status = "APPROVED";
  stored.method = confirm.method;
  stored.approvedAt = now.toISOString();
  if (confirm.method === "external_wallet") {
    stored.warning = "Authorization method is external_wallet. This is not a Ledger device signature.";
    return { status: 200, body: publicApproval(stored), headers: { "x-switchboard-warning": stored.warning } };
  }
  return { status: 200, body: publicApproval(stored) };
}
function legLimitPrice(leg) {
  const ask = leg.askUsd;
  if (typeof ask === "string" && isMoney(ask)) return ask;
  return allInUnitPrice(leg.estimatedAllInCostUsd, leg.quantity);
}
function failedOrder(clientOrderId) {
  return {
    clientOrderId,
    venueOrderId: "not_submitted",
    status: "REJECTED",
    filledQuantity: "0",
    averageFillPriceUsd: "0",
    syntheticDemo: true
  };
}
function executionMode(config) {
  return config.allowLive ? "live" : "sandbox";
}
async function createRun(ctx, body, now, correlationId2) {
  if (!isRecord2(body) || !isRecord2(body.plan) || typeof body.approvalId !== "string" || typeof body.idempotencyKey !== "string") {
    return validation(correlationId2, "plan, approvalId, and idempotencyKey are required.");
  }
  const request = body;
  const plan = request.plan;
  const approval = ctx.store.approvals.get(request.approvalId);
  if (!approval) {
    return { status: 403, body: apiError("APPROVAL_NOT_FOUND", "Approval was not found. No order was submitted.", correlationId2, false) };
  }
  if (expired(approval.request.expiresAt, now) || approval.status === "EXPIRED") {
    approval.status = "EXPIRED";
    ctx.tokens.revoke(approval.issuedJtis);
    return { status: 409, body: apiError("APPROVAL_EXPIRED", "Approval is expired. No order was submitted.", correlationId2, false) };
  }
  if (approval.status !== "APPROVED") {
    return { status: 403, body: apiError("APPROVAL_NOT_APPROVED", "Approval is not APPROVED. No order was submitted.", correlationId2, false, { status: approval.status }) };
  }
  if (plan.version !== approval.planSnapshot.version) {
    return { status: 409, body: apiError("PLAN_VERSION_MISMATCH", "Plan version does not match the approved snapshot. No order was submitted.", correlationId2, false) };
  }
  let computed;
  let snapshotHash;
  try {
    computed = computePlanHash(plan);
    snapshotHash = computePlanHash(approval.planSnapshot);
  } catch {
    return validation(correlationId2, "Plan could not be canonicalized.");
  }
  if (isPlaceholderPlanHash(plan.planHash) || isPlaceholderPlanHash(approval.request.planHash) || plan.planHash !== computed || computed !== snapshotHash || plan.planHash !== approval.request.planHash) {
    return hashMismatch(correlationId2, "Plan hash does not match the approved snapshot. No order was submitted.");
  }
  if (plan.planId !== approval.request.planId) {
    return { status: 409, body: apiError("PLAN_ID_MISMATCH", "Plan id does not match the approval. No order was submitted.", correlationId2, false) };
  }
  if (greaterThan(plan.estimatedTotalCostUsd, approval.request.maxTotalSpendUsd)) {
    return { status: 409, body: apiError("SPEND_CAP_EXCEEDED", "estimatedTotalCostUsd exceeds the approved maxTotalSpendUsd. No order was submitted.", correlationId2, false) };
  }
  if (greaterThan(sumMoney(plan.legs.map((leg) => leg.maxAdditionalObligationUsd)), approval.request.maxCollateralUsd)) {
    return { status: 409, body: apiError("COLLATERAL_CAP_EXCEEDED", "Additional obligations exceed maxCollateralUsd. No order was submitted.", correlationId2, false) };
  }
  for (const leg of plan.legs) {
    if (leg.venue === "polymarket_international") {
      return { status: 403, body: apiError("VENUE_NOT_ELIGIBLE", "polymarket_international is reference-only and cannot be executed. No order was submitted.", correlationId2, false) };
    }
    if (!approval.request.allowedVenues.includes(leg.venue)) {
      return { status: 403, body: apiError("VENUE_NOT_ALLOWED", `Venue ${leg.venue} is not in the approval allow-list. No order was submitted.`, correlationId2, false) };
    }
  }
  if (expired(plan.expiresAt, now)) {
    return { status: 409, body: apiError("QUOTE_EXPIRED", "Plan expiry has passed, so quotes are stale. No order was submitted.", correlationId2, false) };
  }
  let revalidation;
  try {
    revalidation = await ctx.revalidation.check({ plan, now });
  } catch {
    return { status: 409, body: apiError("REVALIDATION_FAILED", "Quote revalidation failed closed. No order was submitted.", correlationId2, false) };
  }
  if (revalidation.quoteExpired) {
    return { status: 409, body: apiError("QUOTE_EXPIRED", revalidation.reason ?? "Quote is expired. No order was submitted.", correlationId2, false) };
  }
  if (revalidation.materialPriceChange) {
    return { status: 409, body: apiError("REAPPROVAL_REQUIRED", revalidation.reason ?? "Material price change requires a new approval. No order was submitted.", correlationId2, false) };
  }
  const financial = plan.legs.filter((leg) => leg.kind === "financial");
  for (const leg of financial) {
    if (!leg.quoteId || !leg.instrumentId) {
      return validation(correlationId2, `Financial leg ${leg.legId} requires quoteId and instrumentId.`);
    }
    try {
      legLimitPrice(leg);
    } catch {
      return validation(correlationId2, `Financial leg ${leg.legId} has a non-positive quantity.`);
    }
  }
  const runId = `run_${randomUUID3()}`;
  const orders = [];
  const jtis = [];
  let reapproval = false;
  const mode = executionMode(ctx.config);
  for (const leg of financial) {
    const maxPriceUsd = legLimitPrice(leg);
    const clientOrderId = `${runId}:${leg.legId}`;
    const signed = await ctx.tokens.signOrder({
      approvalId: approval.approvalId,
      planHash: computed,
      quoteId: leg.quoteId,
      instrumentId: leg.instrumentId,
      venue: leg.venue,
      maxQuantity: leg.quantity,
      maxPriceUsd,
      maxSpendUsd: leg.estimatedAllInCostUsd,
      mode,
      now
    });
    if (ctx.tokens.isRevoked(signed.jti)) {
      return { status: 409, body: apiError("AUTHORIZATION_REVOKED", "Refusing to submit a revoked execution authorization.", correlationId2, false) };
    }
    jtis.push(signed.jti);
    approval.issuedJtis.push(signed.jti);
    const orderBody = {
      approvalId: approval.approvalId,
      planHash: computed,
      quoteId: leg.quoteId,
      side: "BUY",
      quantity: leg.quantity,
      limitPriceUsd: maxPriceUsd,
      clientOrderId
    };
    let outcome;
    try {
      outcome = await ctx.markets.placeOrder({
        body: orderBody,
        idempotencyKey: clientOrderId,
        authorization: signed.jwt,
        correlationId: correlationId2
      });
    } catch {
      outcome = { kind: "unreachable" };
    }
    if (outcome.kind === "reapproval") {
      reapproval = true;
      orders.push(failedOrder(clientOrderId));
      break;
    }
    if (outcome.kind === "unreachable" || outcome.kind === "rejected") {
      orders.push(failedOrder(clientOrderId));
      continue;
    }
    if (outcome.result.status === "SIMULATED") {
      outcome.result.status = "SIMULATED";
      outcome.result.syntheticDemo = true;
    }
    orders.push(outcome.result);
  }
  const successes = orders.filter((order) => order.status === "SIMULATED" || order.status === "FILLED" || order.status === "PARTIALLY_FILLED");
  let status;
  if (reapproval) status = "REAPPROVAL_REQUIRED";
  else if (orders.length === 0 || orders.every((order) => order.status === "SIMULATED" || order.status === "FILLED")) status = "ACTIVE";
  else if (successes.length > 0) status = "PARTIAL";
  else status = "FAILED";
  const receipts = [];
  if (!reapproval) {
    for (const order of orders) {
      if (order.status !== "SIMULATED" && order.status !== "FILLED" && order.status !== "PARTIALLY_FILLED") continue;
      receipts.push({
        receiptId: `receipt_${randomUUID3()}`,
        kind: "market_fill",
        confirmed: false,
        observedAt: now.toISOString(),
        metadata: {
          mode,
          orderStatus: order.status,
          clientOrderId: order.clientOrderId,
          note: order.status === "SIMULATED" ? "Markets returned SIMULATED. Status was not relabeled FILLED. No chain settlement was observed." : "Order result stored as returned. confirmed is false until a chain receipt is observed."
        }
      });
      try {
        receipts.push(await ctx.settlement.observe({ clientOrderId: order.clientOrderId, now }));
      } catch {
        receipts.push({
          receiptId: `receipt_${randomUUID3()}`,
          kind: "exchange_settlement",
          confirmed: false,
          observedAt: now.toISOString(),
          metadata: {
            mode: "sandbox_simulator",
            note: "Settlement client failed. No transaction hash was invented.",
            clientOrderId: order.clientOrderId
          }
        });
      }
    }
  }
  if (status === "FAILED" || status === "PARTIAL" || status === "REAPPROVAL_REQUIRED") {
    ctx.tokens.revoke(jtis);
  }
  const run = {
    runId,
    planId: plan.planId,
    approvalId: approval.approvalId,
    status,
    orders,
    receipts,
    correlationId: correlationId2
  };
  ctx.store.runs.set(runId, run);
  ctx.store.runJtis.set(runId, jtis);
  return { status: 200, body: run };
}
function getRun(ctx, runId, correlationId2) {
  const run = ctx.store.runs.get(runId);
  if (!run) return { status: 404, body: apiError("NOT_FOUND", "Execution run was not found.", correlationId2, false) };
  return { status: 200, body: run };
}

// services/execution/src/failover.ts
import { randomUUID as randomUUID4 } from "node:crypto";
var FAILURE_MODES = ["timeout", "http_500", "latency_spike", "provider_down"];
var FAILOVER_SCENARIO_HEADER = "x-failover-scenario";
var FAILOVER_QUOTE_HEADER = "x-failover-quote-usd";
var SCENARIOS = [
  "success",
  "failing_backup",
  "invalid_voucher",
  "no_balance",
  "budget_exceeded",
  "receipt_failed",
  "proof_missing"
];
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validation2(correlationId2, message) {
  return { status: 400, body: apiError("VALIDATION_ERROR", message, correlationId2, false) };
}
function policyDigest(policy) {
  return sha256Prefixed({
    planId: policy.planId,
    approvalId: policy.approvalId,
    primaryService: policy.primaryService,
    fallbackOfferId: policy.fallbackOfferId,
    maxPerTriggerUsd: policy.maxPerTriggerUsd,
    maxDailySpendUsd: policy.maxDailySpendUsd,
    triggerRuleId: policy.triggerRuleId
  });
}
function parseArm(body, correlationId2) {
  if (!isRecord3(body)) return validation2(correlationId2, "JSON object body is required.");
  const fields = ["planId", "approvalId", "primaryService", "fallbackOfferId", "triggerRuleId"];
  for (const field of fields) {
    if (typeof body[field] !== "string" || body[field].length === 0) {
      return validation2(correlationId2, `${field} is required.`);
    }
  }
  if (!isMoney(body.maxPerTriggerUsd) || !isMoney(body.maxDailySpendUsd)) {
    return validation2(correlationId2, "maxPerTriggerUsd and maxDailySpendUsd must be decimal strings.");
  }
  return body;
}
function isHandler2(value) {
  return "status" in value;
}
async function armFailover(ctx, body, now, correlationId2) {
  const policy = parseArm(body, correlationId2);
  if (isHandler2(policy)) return policy;
  const approval = ctx.store.approvals.get(policy.approvalId);
  if (!approval) return { status: 403, body: apiError("APPROVAL_NOT_FOUND", "Approval was not found.", correlationId2, false) };
  if (now.getTime() >= Date.parse(approval.request.expiresAt) || approval.status === "EXPIRED") {
    approval.status = "EXPIRED";
    return { status: 409, body: apiError("APPROVAL_EXPIRED", "Expired approval cannot arm failover.", correlationId2, false) };
  }
  if (approval.status !== "APPROVED") {
    return { status: 403, body: apiError("APPROVAL_NOT_APPROVED", "Failover can be armed only for an APPROVED approval.", correlationId2, false, { status: approval.status }) };
  }
  if (policy.planId !== approval.request.planId) {
    return { status: 409, body: apiError("PLAN_ID_MISMATCH", "Arm planId does not match the approval.", correlationId2, false) };
  }
  const digest = policyDigest(policy);
  const approved = approval.request.ap4mFallbackBudgetUsd;
  const raises = greaterThan(policy.maxPerTriggerUsd, approved) || greaterThan(policy.maxDailySpendUsd, approved) || greaterThan(policy.maxPerTriggerUsd, policy.maxDailySpendUsd);
  const monitorId = `monitor_${randomUUID4()}`;
  if (raises) {
    ctx.store.monitors.set(monitorId, {
      monitorId,
      status: "REJECTED",
      policyDigest: digest,
      policy,
      spentUsd: "0"
    });
    return {
      status: 200,
      body: { monitorId, status: "REJECTED", policyDigest: digest }
    };
  }
  ctx.store.monitors.set(monitorId, {
    monitorId,
    status: "ARMED",
    policyDigest: digest,
    policy,
    spentUsd: "0"
  });
  return { status: 200, body: { monitorId, status: "ARMED", policyDigest: digest } };
}
async function disableFailover(ctx, body, correlationId2) {
  if (!isRecord3(body) || typeof body.monitorId !== "string" || typeof body.reason !== "string" || body.reason.length === 0) {
    return validation2(correlationId2, "monitorId and reason are required.");
  }
  const monitor = ctx.store.monitors.get(body.monitorId);
  if (!monitor) return { status: 404, body: apiError("NOT_FOUND", "Failover monitor was not found.", correlationId2, false) };
  monitor.status = "DISABLED";
  monitor.disabledReason = body.reason;
  return { status: 200, body: { monitorId: monitor.monitorId, status: "DISABLED", policyDigest: monitor.policyDigest } };
}
function parseScenario(raw) {
  if (!raw) return "success";
  return SCENARIOS.includes(raw) ? raw : void 0;
}
function findMonitor(ctx, planId, primaryService, status) {
  let found;
  for (const monitor of ctx.store.monitors.values()) {
    if (monitor.policy.planId === planId && monitor.policy.primaryService === primaryService && monitor.status === status) {
      found = monitor;
    }
  }
  return found;
}
function honest(run) {
  const lyingState = run.state === "RLUSD_SETTLED" || run.state === "FALLBACK_ACTIVE";
  const lyingReceipt = run.receipts.some((receipt) => receipt.kind === "rlusd_settlement" && receipt.confirmed || receipt.confirmed && isRealTxHash(receipt.transactionHash));
  if (!lyingState && !lyingReceipt) return run;
  return {
    ...run,
    state: "UNVERIFIED",
    ap4mSpendingUsd: "0",
    receipts: run.receipts.map((receipt) => ({
      ...receipt,
      confirmed: false,
      transactionHash: isRealTxHash(receipt.transactionHash) ? SYNTHETIC_TX_HASH : receipt.transactionHash
    })),
    errors: [
      ...run.errors,
      "Refusing RLUSD_SETTLED, FALLBACK_ACTIVE, or a confirmed chain hash. No chain observation was recorded in this process."
    ]
  };
}
function baseRun(input) {
  return honest({
    failoverId: `failover_${randomUUID4()}`,
    planId: input.planId,
    primaryService: input.primaryService,
    fallbackService: input.fallbackService,
    state: input.state,
    ap4mSpendingUsd: input.spendingUsd ?? "0",
    receipts: input.receipts ?? [],
    correlationId: input.correlationId,
    errors: input.errors
  });
}
async function simulateFailover(ctx, body, now, correlationId2, scenarioHeader, quoteHeader, idempotencyKey) {
  if (!isRecord3(body)) return validation2(correlationId2, "JSON object body is required.");
  const { planId, primaryService, fallbackService, failureMode } = body;
  if (typeof planId !== "string" || typeof primaryService !== "string" || typeof fallbackService !== "string") {
    return validation2(correlationId2, "planId, primaryService, and fallbackService are required.");
  }
  if (typeof failureMode !== "string" || !FAILURE_MODES.includes(failureMode)) {
    return validation2(correlationId2, "failureMode must be timeout, http_500, latency_spike, or provider_down.");
  }
  const scenario = parseScenario(scenarioHeader);
  if (!scenario) return validation2(correlationId2, "X-Failover-Scenario is not a known fault-injector case.");
  if (quoteHeader !== void 0 && !isMoney(quoteHeader)) return validation2(correlationId2, "X-Failover-Quote-Usd must be a decimal string.");
  const request = body;
  const armed = findMonitor(ctx, request.planId, request.primaryService, "ARMED");
  if (!armed) {
    const disabled = findMonitor(ctx, request.planId, request.primaryService, "DISABLED");
    if (disabled) {
      const run2 = baseRun({
        planId: request.planId,
        primaryService: request.primaryService,
        fallbackService: request.fallbackService,
        correlationId: correlationId2,
        state: "FAIL_CLOSED",
        errors: [`Disabled policy does not pay. Reason: ${disabled.disabledReason ?? "disabled"}.`, `correlationId=${correlationId2}`]
      });
      ctx.store.failovers.set(run2.failoverId, run2);
      return { status: 200, body: run2 };
    }
    return { status: 403, body: apiError("POLICY_NOT_ARMED", "Simulate requires an armed failover policy for this plan and primary service. /simulate is a fault injector, not a live monitor.", correlationId2, false) };
  }
  const approval = ctx.store.approvals.get(armed.policy.approvalId);
  if (!approval || approval.status !== "APPROVED") {
    const run2 = baseRun({
      planId: request.planId,
      primaryService: request.primaryService,
      fallbackService: request.fallbackService,
      correlationId: correlationId2,
      state: "FAIL_CLOSED",
      errors: ["Armed policy's approval is no longer APPROVED. No spend."]
    });
    ctx.store.failovers.set(run2.failoverId, run2);
    return { status: 200, body: run2 };
  }
  const transitions = ["HEALTHY", "SUSPECT", "VERIFIED_FAILURE", "SEARCHING_FALLBACK"];
  const approvedBudget = approval.request.ap4mFallbackBudgetUsd;
  const remaining = maxDecimal("0", subtractMoney(armed.policy.maxDailySpendUsd, armed.spentUsd));
  const quote = quoteHeader ?? (scenario === "budget_exceeded" ? addMoney(approvedBudget, "1") : "1");
  const decision = decide402({
    quotedUsd: quote,
    remainingBudgetUsd: minDecimal([remaining, approvedBudget]),
    maxPerTriggerUsd: armed.policy.maxPerTriggerUsd,
    fallbackHealthy: scenario !== "failing_backup",
    voucherValid: scenario !== "invalid_voucher",
    balanceAvailable: scenario !== "no_balance",
    quality: scenario === "failing_backup" ? 0 : 1
  });
  const prefix = `Primary failure injected (${request.failureMode}). transitions so far ${transitions.join(">")}. correlationId=${correlationId2}.`;
  if (scenario === "failing_backup" || decision.outcome === "unavailable") {
    transitions.push("UNAVAILABLE");
    const run2 = baseRun({
      planId: request.planId,
      primaryService: request.primaryService,
      fallbackService: request.fallbackService,
      correlationId: correlationId2,
      state: "UNAVAILABLE",
      errors: [prefix, "Backup failed the availability or quality benchmark. No voucher created. No spend.", `transitions=${transitions.join(">")}`]
    });
    ctx.store.failovers.set(run2.failoverId, run2);
    return { status: 200, body: run2 };
  }
  if (scenario === "no_balance" || scenario === "budget_exceeded" && decision.outcome === "budget_blocked" || decision.outcome === "budget_blocked") {
    transitions.push("QUOTED_402", "BUDGET_BLOCKED");
    const run2 = baseRun({
      planId: request.planId,
      primaryService: request.primaryService,
      fallbackService: request.fallbackService,
      correlationId: correlationId2,
      state: "BUDGET_BLOCKED",
      errors: [
        prefix,
        `${decision.reason} No voucher created. Spend remains ${armed.spentUsd} and does not exceed the approved cap ${approvedBudget}.`,
        `transitions=${transitions.join(">")}`
      ]
    });
    ctx.store.failovers.set(run2.failoverId, run2);
    return { status: 200, body: run2 };
  }
  if (scenario === "invalid_voucher" || scenario === "receipt_failed" || scenario === "proof_missing") {
    const breaker = scenario === "invalid_voucher" ? { open: true, reasons: ["HTTP 402 was presented but the voucher is invalid. Fail closed. Not FALLBACK_ACTIVE."] } : scenario === "receipt_failed" ? { open: true, reasons: ["Circuit breaker: receipt failed. Not RLUSD_SETTLED."] } : { open: true, reasons: ["Circuit breaker: settlement proof missing."] };
    transitions.push("QUOTED_402", "FAIL_CLOSED");
    const run2 = baseRun({
      planId: request.planId,
      primaryService: request.primaryService,
      fallbackService: request.fallbackService,
      correlationId: correlationId2,
      state: "FAIL_CLOSED",
      errors: [prefix, ...breaker.reasons, "No spend.", `transitions=${transitions.join(">")}`]
    });
    ctx.store.failovers.set(run2.failoverId, run2);
    return { status: 200, body: run2 };
  }
  if (ctx.config.ap4mMode === "live") {
    transitions.push("QUOTED_402");
    const keyPresent = Boolean(ctx.config.ap4mAgentPrivateKey);
    const rpcPresent = Boolean(ctx.config.xrplEvmRpcUrl);
    if (!keyPresent || !rpcPresent) {
      transitions.push("UNVERIFIED");
      const run3 = baseRun({
        planId: request.planId,
        primaryService: request.primaryService,
        fallbackService: request.fallbackService,
        correlationId: correlationId2,
        state: "UNVERIFIED",
        errors: [
          prefix,
          "AP4M_MODE=live but AP4M_AGENT_PRIVATE_KEY or XRPL_EVM_RPC_URL is absent. Refusing to fabricate VoucherRedeemed or RLUSD settlement.",
          "The 402 used here is fault-injector input, not a merchant response observed on the network.",
          `Guide steps not called: requestChannel, redeemVoucher, POST /record-redemption, recordSettlement, closeChannel.`,
          `transitions=${transitions.join(">")}`
        ]
      });
      ctx.store.failovers.set(run3.failoverId, run3);
      return { status: 200, body: run3 };
    }
    const voucher2 = await ctx.ap4m.createVoucher({ idempotencyKey, quotedUsd: quote, mode: "live" });
    transitions.push("UNVERIFIED");
    const run2 = baseRun({
      planId: request.planId,
      primaryService: request.primaryService,
      fallbackService: request.fallbackService,
      correlationId: correlationId2,
      state: "UNVERIFIED",
      errors: [
        prefix,
        "A local signature step ran, but it is not an AP4M EIP-712 voucher. Official x402 bodies were authentication-required, so redeemVoucher was not submitted.",
        "No VoucherRedeemed event and no RLUSD balance were observed.",
        `voucherSubmitted=${voucher2.submitted}`,
        `transitions=${transitions.join(">")}`
      ]
    });
    ctx.store.failovers.set(run2.failoverId, run2);
    return { status: 200, body: run2 };
  }
  const voucher = await ctx.ap4m.createVoucher({ idempotencyKey, quotedUsd: quote, mode: "mock" });
  transitions.push("QUOTED_402", "VOUCHER_SIGNED");
  const receipt = {
    receiptId: `receipt_${randomUUID4()}`,
    kind: "voucher_redeemed",
    chainId: XRPL_EVM_CHAIN_ID,
    transactionHash: SYNTHETIC_TX_HASH,
    confirmed: false,
    observedAt: now.toISOString(),
    metadata: {
      mode: "mock",
      stage: "VOUCHER_SIGNED",
      voucherId: voucher.voucherId,
      transitions: transitions.join(">"),
      correlationId: correlationId2,
      note: "Mock voucher was not submitted. confirmed is false. This is not a VoucherRedeemed event."
    }
  };
  const run = baseRun({
    planId: request.planId,
    primaryService: request.primaryService,
    fallbackService: request.fallbackService,
    correlationId: correlationId2,
    state: "VOUCHER_SIGNED",
    spendingUsd: armed.spentUsd,
    receipts: [receipt],
    errors: [
      "Live AP4M credentials and chain observation were not available. Mock mode stopped at VOUCHER_SIGNED. No voucher was submitted, no VoucherRedeemed event was observed, and no RLUSD balance was observed.",
      `correlationId=${correlationId2}`,
      `transitions=${transitions.join(">")}`
    ]
  });
  ctx.store.failovers.set(run.failoverId, run);
  return { status: 200, body: run };
}
function getFailover(ctx, failoverId, correlationId2) {
  const run = ctx.store.failovers.get(failoverId);
  if (!run) return { status: 404, body: apiError("NOT_FOUND", "Failover run was not found.", correlationId2, false) };
  return { status: 200, body: honest(run) };
}

// services/execution/src/idempotency.ts
async function withIdempotency(store, scope, key, body, correlationId2, handler2) {
  if (!key) {
    return {
      status: 400,
      body: apiError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required on mutating requests.", correlationId2, false)
    };
  }
  const bodyHash = sha256Prefixed(body ?? null);
  const mapKey = `${scope}|${key}`;
  const existing = store.idempotency.get(mapKey);
  if (existing) {
    if (existing.bodyHash !== bodyHash) {
      return {
        status: 409,
        body: apiError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was reused with a different request body.", correlationId2, false)
      };
    }
    return { status: existing.statusCode, body: existing.body, headers: existing.headers };
  }
  const result = await handler2();
  store.idempotency.set(mapKey, {
    bodyHash,
    statusCode: result.status,
    body: structuredClone(result.body),
    headers: { ...result.headers ?? {} }
  });
  return result;
}

// services/execution/src/keys.ts
import { createPrivateKey, createPublicKey } from "node:crypto";
import { mkdirSync, readFileSync as readFileSync2, writeFileSync, existsSync as existsSync2 } from "node:fs";
import path2 from "node:path";
import { calculateJwkThumbprint, exportJWK, exportPKCS8, exportSPKI, importPKCS8, importSPKI } from "jose";
var AUTH_SEED_LABEL = "switchboard-sandbox-auth-seed-v1";
var ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
function authSeedBytes() {
  const seed = new TextEncoder().encode(AUTH_SEED_LABEL);
  if (seed.length !== 32) {
    throw new Error(`seed length ${seed.length}`);
  }
  return seed;
}
function ed25519Pkcs8PemFromSeed(seed) {
  if (seed.length !== 32) throw new Error(`seed length ${seed.length}`);
  const der = Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed)]);
  const body = der.toString("base64").replace(/.{1,64}/g, (line) => `${line}
`);
  return `-----BEGIN PRIVATE KEY-----
${body}-----END PRIVATE KEY-----
`;
}
async function ensureDeterministicKeyFiles(privatePath, publicPath) {
  if (existsSync2(privatePath) && existsSync2(publicPath)) return;
  const seed = authSeedBytes();
  const privateObject = createPrivateKey({ key: ed25519Pkcs8PemFromSeed(seed), format: "pem" });
  const publicObject = createPublicKey(privateObject);
  mkdirSync(path2.dirname(privatePath), { recursive: true });
  writeFileSync(privatePath, await exportPKCS8(privateObject));
  writeFileSync(publicPath, await exportSPKI(publicObject));
}
async function loadAuthKeys(privatePath, publicPath) {
  await ensureDeterministicKeyFiles(privatePath, publicPath);
  const privatePem = readFileSync2(privatePath, "utf8");
  const publicPem = readFileSync2(publicPath, "utf8");
  const privateKey = await importPKCS8(privatePem, "EdDSA");
  const publicKey = await importSPKI(publicPem, "EdDSA");
  const publicJwk = await exportJWK(publicKey);
  delete publicJwk.d;
  publicJwk.alg = "EdDSA";
  publicJwk.use = "sig";
  publicJwk.kty = publicJwk.kty ?? "OKP";
  publicJwk.crv = publicJwk.crv ?? "Ed25519";
  const kid = await calculateJwkThumbprint(publicJwk);
  publicJwk.kid = kid;
  return { privateKey, publicKey, publicJwk, kid };
}

// services/execution/src/markets.ts
var DefaultRevalidation = class {
  async check(input) {
    const expires = Date.parse(input.plan.expiresAt);
    return {
      materialPriceChange: false,
      quoteExpired: Number.isFinite(expires) && input.now.getTime() >= expires
    };
  }
};
var ORDER_STATUSES = [
  "CREATED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "FILLED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "SIMULATED"
];
function isOrderStatus(value) {
  return typeof value === "string" && ORDER_STATUSES.includes(value);
}
function parseMarketOrderResult(value, fallbackClientOrderId) {
  if (!value || typeof value !== "object") return void 0;
  const raw = value;
  if (!isOrderStatus(raw.status)) return void 0;
  if (typeof raw.venueOrderId !== "string" || typeof raw.filledQuantity !== "string" || typeof raw.averageFillPriceUsd !== "string") {
    return void 0;
  }
  const status = raw.status;
  const result = {
    clientOrderId: typeof raw.clientOrderId === "string" ? raw.clientOrderId : fallbackClientOrderId,
    venueOrderId: raw.venueOrderId,
    status,
    filledQuantity: raw.filledQuantity,
    averageFillPriceUsd: raw.averageFillPriceUsd,
    syntheticDemo: status === "SIMULATED" ? true : raw.syntheticDemo === true
  };
  if (typeof raw.txHash === "string" && raw.txHash.length > 0) result.txHash = raw.txHash;
  return result;
}
function reapprovalReason(status, code, orderStatus) {
  if (orderStatus === "EXPIRED") return "EXPIRED";
  if (status === 409 && /STALE|PRICE|REAPPROVAL/i.test(code)) return code || "REAPPROVAL_REQUIRED";
  return void 0;
}
var HttpMarketsClient = class {
  constructor(options) {
    this.options = options;
  }
  async placeOrder(input) {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    try {
      const response = await fetchImpl(`${this.options.baseUrl}/v1/markets/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.bearer}`,
          "idempotency-key": input.idempotencyKey,
          "x-execution-authorization": input.authorization,
          "x-correlation-id": input.correlationId
        },
        body: JSON.stringify(input.body)
      });
      const text2 = await response.text();
      let parsed = {};
      if (text2.length > 0) {
        try {
          parsed = JSON.parse(text2);
        } catch {
          return { kind: "rejected", message: `markets returned non-JSON HTTP ${response.status}` };
        }
      }
      const code = parsed && typeof parsed === "object" && "code" in parsed && typeof parsed.code === "string" ? parsed.code : "";
      const order = parseMarketOrderResult(parsed, input.body.clientOrderId);
      const reason = reapprovalReason(response.status, code, order?.status);
      if (reason) return { kind: "reapproval", reason };
      if (!response.ok) {
        const message = parsed && typeof parsed === "object" && "message" in parsed && typeof parsed.message === "string" ? parsed.message : `markets HTTP ${response.status}`;
        return { kind: "rejected", message };
      }
      if (!order) return { kind: "rejected", message: "markets response did not match MarketOrderResult" };
      return { kind: "result", result: order };
    } catch {
      return { kind: "unreachable" };
    }
  }
};

// services/execution/src/tokens.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import { SignJWT } from "jose";
var TokenService = class {
  constructor(keys, store) {
    this.keys = keys;
    this.store = store;
  }
  jwks() {
    const { d: _private, ...publicJwk } = this.keys.publicJwk;
    return { keys: [publicJwk] };
  }
  revoke(jtis) {
    for (const jti of jtis) this.store.revokedJtis.add(jti);
  }
  isRevoked(jti) {
    return this.store.revokedJtis.has(jti);
  }
  async signOrder(claims) {
    const jti = randomUUID5();
    if (this.isRevoked(jti)) {
      throw new Error("refusing to issue a revoked jti");
    }
    const iat = Math.floor(claims.now.getTime() / 1e3);
    const exp = iat + 60;
    const jwt = await new SignJWT({
      planHash: claims.planHash,
      quoteId: claims.quoteId,
      instrumentId: claims.instrumentId,
      venue: claims.venue,
      side: "BUY",
      maxQuantity: claims.maxQuantity,
      maxPriceUsd: claims.maxPriceUsd,
      maxSpendUsd: claims.maxSpendUsd,
      mode: claims.mode
    }).setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: this.keys.kid }).setIssuer("switchboard-execution").setAudience("markets").setSubject(claims.approvalId).setJti(jti).setIssuedAt(iat).setExpirationTime(exp).sign(this.keys.privateKey);
    return { jwt, jti };
  }
};

// services/execution/src/app.ts
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function send(reply, result) {
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) reply.header(key, value);
  }
  return reply.code(result.status).send(result.body);
}
function scopeOf(method, url, fallback) {
  return `${method} ${url ?? fallback}`;
}
async function buildApp(options = {}) {
  const config = options.config ?? loadConfig(options.env ?? process.env);
  const store = options.store ?? createMemoryStore();
  const keys = await loadAuthKeys(config.privateKeyPath, config.publicKeyPath);
  const tokens = new TokenService(keys, store);
  const ctx = {
    config,
    store,
    tokens,
    markets: options.markets ?? new HttpMarketsClient({
      baseUrl: config.marketsBaseUrl,
      bearer: config.bearer,
      ...options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}
    }),
    revalidation: options.revalidation ?? new DefaultRevalidation(),
    settlement: options.settlement ?? createSettlementClient(config.exchangeAbiPath),
    ap4m: options.ap4m ?? createAp4mClient(config),
    clock: options.clock ?? (() => /* @__PURE__ */ new Date())
  };
  const app = Fastify({ logger: false });
  app.addHook("onRequest", (request, reply, done) => {
    const pathOnly = request.url.split("?")[0] ?? request.url;
    if (pathOnly === "/healthz" || pathOnly === "/.well-known/execution-jwks.json") {
      done();
      return;
    }
    const header2 = headerString(request.headers.authorization);
    if (header2 !== `Bearer ${config.bearer}`) {
      const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
      reply.code(401).send(apiError("UNAUTHORIZED", "Bearer token was missing or did not match.", correlation, false));
      return;
    }
    done();
  });
  app.setErrorHandler((error, request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
    if (error instanceof HttpError) return reply.code(error.statusCode).send(error.body);
    return reply.code(500).send(apiError("INTERNAL", "Internal error", correlation, true));
  });
  app.get("/healthz", async () => ({ status: "ok", service: "execution", version: config.serviceVersion }));
  app.get("/v1/execution/network", async () => readNetwork(process.env));
  app.get("/v1/execution/sponsors", async () => sponsorStatus(process.env));
  app.post("/v1/execution/ap4m/pay", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
    const headerKey = headerString(request.headers["idempotency-key"]);
    if (!headerKey) {
      return reply.code(400).send(apiError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.", correlation, false));
    }
    const report = await runAp4mPayment(process.env);
    return { correlationId: correlation, ...report };
  });
  app.get("/v1/execution/clear-sign/samples", async () => ({
    disclaimer: previewXrplTransaction(SAMPLE_XRPL_TRANSACTIONS[0]).disclaimer,
    previews: SAMPLE_XRPL_TRANSACTIONS.map((tx) => previewXrplTransaction(tx))
  }));
  app.post("/v1/execution/clear-sign/preview", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
    if (!isRecord4(request.body) || !isRecord4(request.body.tx)) {
      return reply.code(400).send(apiError("VALIDATION_ERROR", "Body must be { tx: XRPL transaction object }.", correlation, false));
    }
    return { preview: previewXrplTransaction(request.body.tx) };
  });
  app.get("/.well-known/execution-jwks.json", async () => tokens.jwks());
  app.get("/v1/execution/revocations", async () => ({
    behavior: "in-memory",
    note: "Revoked jti values are process memory only and disappear on restart. Outstanding execution authorizations are revoked when an approval expires or is unsupported after issuance, and when a run fails closed (FAILED, PARTIAL, or REAPPROVAL_REQUIRED). A later run mints a new jti and must not reuse a revoked token.",
    revokedJtis: [...store.revokedJtis].sort()
  }));
  app.post("/v1/execution/approvals", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/execution/approvals"),
      headerString(request.headers["idempotency-key"]),
      request.body,
      correlation,
      () => createApproval(ctx, request.body, correlation)
    );
    return send(reply, result);
  });
  app.post("/v1/execution/approvals/:approvalId/confirm", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
    const nowResult = readNow(headerString(request.headers["x-switchboard-now"]), ctx.clock);
    if (!nowResult.ok) return reply.code(400).send(apiError("VALIDATION_ERROR", nowResult.message, correlation, false));
    const { approvalId } = request.params;
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/execution/approvals/:approvalId/confirm"),
      headerString(request.headers["idempotency-key"]),
      request.body,
      correlation,
      () => confirmApproval(ctx, approvalId, request.body, nowResult.now, correlation)
    );
    return send(reply, result);
  });
  app.post("/v1/execution/runs", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
    const headerKey = headerString(request.headers["idempotency-key"]);
    const bodyKey = isRecord4(request.body) && typeof request.body.idempotencyKey === "string" ? request.body.idempotencyKey : void 0;
    if (headerKey && bodyKey && headerKey !== bodyKey) {
      return reply.code(400).send(apiError("IDEMPOTENCY_KEY_MISMATCH", "Idempotency-Key header must match body.idempotencyKey. The header is the idempotency key.", correlation, false));
    }
    const nowResult = readNow(headerString(request.headers["x-switchboard-now"]), ctx.clock);
    if (!nowResult.ok) return reply.code(400).send(apiError("VALIDATION_ERROR", nowResult.message, correlation, false));
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/execution/runs"),
      headerKey,
      request.body,
      correlation,
      () => createRun(ctx, request.body, nowResult.now, correlation)
    );
    return send(reply, result);
  });
  app.get("/v1/execution/runs/:runId", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
    const { runId } = request.params;
    return send(reply, getRun(ctx, runId, correlation));
  });
  app.post("/v1/failover/arm", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
    const nowResult = readNow(headerString(request.headers["x-switchboard-now"]), ctx.clock);
    if (!nowResult.ok) return reply.code(400).send(apiError("VALIDATION_ERROR", nowResult.message, correlation, false));
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/failover/arm"),
      headerString(request.headers["idempotency-key"]),
      request.body,
      correlation,
      () => armFailover(ctx, request.body, nowResult.now, correlation)
    );
    return send(reply, result);
  });
  app.post("/v1/failover/disable", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/failover/disable"),
      headerString(request.headers["idempotency-key"]),
      request.body,
      correlation,
      () => disableFailover(ctx, request.body, correlation)
    );
    return send(reply, result);
  });
  app.post("/v1/failover/simulate", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
    const headerKey = headerString(request.headers["idempotency-key"]);
    const scenario = headerString(request.headers[FAILOVER_SCENARIO_HEADER]);
    const quote = headerString(request.headers[FAILOVER_QUOTE_HEADER]);
    const nowResult = readNow(headerString(request.headers["x-switchboard-now"]), ctx.clock);
    if (!nowResult.ok) return reply.code(400).send(apiError("VALIDATION_ERROR", nowResult.message, correlation, false));
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/failover/simulate"),
      headerKey,
      { body: request.body ?? null, scenario: scenario ?? "success", quoteUsd: quote ?? null },
      correlation,
      () => simulateFailover(
        ctx,
        request.body,
        nowResult.now,
        correlation,
        headerString(request.headers[FAILOVER_SCENARIO_HEADER]),
        headerString(request.headers[FAILOVER_QUOTE_HEADER]),
        headerKey ?? ""
      )
    );
    return send(reply, result);
  });
  app.get("/v1/failover/runs/:failoverId", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID6()}`);
    const { failoverId } = request.params;
    return send(reply, getFailover(ctx, failoverId, correlation));
  });
  return app;
}

// services/markets/src/app.ts
import { timingSafeEqual } from "node:crypto";
import { randomUUID as randomUUID7 } from "node:crypto";
import Fastify2 from "fastify";

// services/markets/src/book.ts
import { Decimal as Decimal3 } from "decimal.js";

// services/markets/src/errors.ts
var ApiException = class extends Error {
  status;
  code;
  retryable;
  details;
  constructor(status, code, message, retryable = false, details) {
    super(message);
    this.name = "ApiException";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
  toJSON(correlationId2) {
    const body = {
      code: this.code,
      message: this.message,
      correlationId: correlationId2,
      retryable: this.retryable
    };
    if (this.details) body.details = this.details;
    return body;
  }
};

// services/markets/src/money.ts
import { Decimal as Decimal2 } from "decimal.js";
Decimal2.set({ precision: 40, rounding: Decimal2.ROUND_HALF_UP });
var MONEY2 = /^-?[0-9]+(?:\.[0-9]+)?$/;
function D(value) {
  if (value instanceof Decimal2) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return new Decimal2(value);
  }
  if (!MONEY2.test(value)) throw new Error(`invalid decimal ${value}`);
  return new Decimal2(value);
}
function isMoney2(value) {
  return typeof value === "string" && MONEY2.test(value);
}
function money(value) {
  const rounded = value.toDecimalPlaces(8, Decimal2.ROUND_HALF_UP);
  if (rounded.isZero()) return "0";
  return rounded.toFixed(8).replace(/\.?0+$/, "");
}

// services/markets/src/book.ts
var LIQUIDITY_MAKER = "sandbox-liquidity";
var EXECUTION_FLOW = "execution-flow";
var OrderBook = class {
  constructor(payoutPerUnit, endowmentFor) {
    this.payoutPerUnit = payoutPerUnit;
    this.endowmentFor = endowmentFor;
  }
  accounts = /* @__PURE__ */ new Map();
  orders = [];
  byClient = /* @__PURE__ */ new Map();
  nonces = /* @__PURE__ */ new Set();
  sequence = 0;
  orderNumber = 0;
  snapshot() {
    return {
      accounts: [...this.accounts.entries()].map(([id2, account]) => ({
        id: id2,
        free: money(account.free),
        locked: money(account.locked)
      })),
      open: this.orders.filter((order) => order.remaining.gt(0)).map((order) => ({
        clientOrderId: order.clientOrderId,
        makerId: order.makerId,
        side: order.side,
        price: money(order.price),
        remaining: money(order.remaining),
        filled: money(order.filled),
        sequence: order.sequence
      }))
    };
  }
  levels(instrumentId, nowMs) {
    this.sweepExpired(nowMs);
    return {
      bids: this.aggregate(instrumentId, "BUY", true),
      asks: this.aggregate(instrumentId, "SELL", false)
    };
  }
  /** Paper collateral lock used by RFQ quotes. Rejects with no state change when short. */
  lockFunds(makerId, amount) {
    if (amount.lte(0)) throw new ApiException(400, "BAD_REQUEST", "Collateral amount must be positive");
    if (this.available(makerId).lt(amount)) {
      throw new ApiException(409, "INSUFFICIENT_COLLATERAL", "Insufficient collateral; no state was changed");
    }
    const account = this.materialize(makerId);
    account.free = account.free.sub(amount);
    account.locked = account.locked.add(amount);
  }
  releaseFunds(makerId, amount) {
    const account = this.accounts.get(makerId);
    if (!account || account.locked.lt(amount)) {
      throw new ApiException(409, "COLLATERAL_ACCOUNTING", "Cannot release collateral that is not locked");
    }
    account.locked = account.locked.sub(amount);
    account.free = account.free.add(amount);
  }
  place(input) {
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
    const order = {
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
      fingerprint
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
  cancel(makerId, clientOrderId, nowMs) {
    this.sweepExpired(nowMs);
    const order = this.byClient.get(`${makerId}|${clientOrderId}`);
    if (!order) throw new ApiException(404, "ORDER_NOT_FOUND", "Unknown clientOrderId");
    if (order.status === "CANCELLED" || order.status === "EXPIRED") return this.toResult(order);
    if (order.remaining.eq(0)) throw new ApiException(409, "ORDER_NOT_OPEN", "Order has no resting quantity");
    this.releaseResting(order);
    order.status = "CANCELLED";
    return this.toResult(order);
  }
  available(makerId) {
    const account = this.accounts.get(makerId);
    return account ? account.free : this.endowmentFor(makerId);
  }
  materialize(makerId) {
    const existing = this.accounts.get(makerId);
    if (existing) return existing;
    const created = { free: this.endowmentFor(makerId), locked: D(0) };
    this.accounts.set(makerId, created);
    return created;
  }
  fillable(input, limit, quantity) {
    const opposite = input.side === "BUY" ? this.sorted(input.instrumentId, "SELL", input.nowMs) : this.sorted(input.instrumentId, "BUY", input.nowMs);
    let remaining = quantity;
    for (const resting of opposite) {
      if (remaining.lte(0)) break;
      if (resting.makerId === input.makerId) continue;
      const crosses = input.side === "BUY" ? resting.price.lte(limit) : resting.price.gte(limit);
      if (!crosses) break;
      remaining = remaining.sub(Decimal3.min(remaining, resting.remaining));
    }
    return quantity.sub(remaining);
  }
  match(incoming, nowMs) {
    const opposite = this.sorted(incoming.instrumentId, incoming.side === "BUY" ? "SELL" : "BUY", nowMs);
    for (const resting of opposite) {
      if (incoming.remaining.lte(0)) break;
      if (resting.makerId === incoming.makerId) continue;
      const crosses = incoming.side === "BUY" ? resting.price.lte(incoming.price) : resting.price.gte(incoming.price);
      if (!crosses) break;
      this.applyFill(resting, incoming, Decimal3.min(incoming.remaining, resting.remaining));
    }
  }
  applyFill(resting, incoming, qty) {
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
    seller.locked = seller.locked.sub(sellerReserve);
    for (const order of [buyer, seller]) {
      order.remaining = order.remaining.sub(qty);
      order.filled = order.filled.add(qty);
      order.notional = order.notional.add(premium);
    }
    if (resting.remaining.eq(0)) resting.status = "FILLED";
    else resting.status = "PARTIALLY_FILLED";
  }
  releaseResting(order) {
    const account = this.accounts.get(order.makerId);
    if (!account || account.locked.lt(order.locked)) throw new Error("locked collateral missing");
    account.locked = account.locked.sub(order.locked);
    account.free = account.free.add(order.locked);
    order.locked = D(0);
    order.remaining = D(0);
  }
  sweepExpired(nowMs) {
    for (const order of this.orders) {
      if (order.remaining.gt(0) && Date.parse(order.goodTil) <= nowMs) {
        this.releaseResting(order);
        order.status = "EXPIRED";
      }
    }
  }
  sorted(instrumentId, side, nowMs) {
    return this.orders.filter((order) => order.instrumentId === instrumentId && order.side === side && order.remaining.gt(0) && Date.parse(order.goodTil) > nowMs).sort((a, b) => {
      const price = side === "BUY" ? b.price.cmp(a.price) : a.price.cmp(b.price);
      return price || a.sequence - b.sequence;
    });
  }
  aggregate(instrumentId, side, highFirst) {
    const totals = /* @__PURE__ */ new Map();
    const open = this.orders.filter((order) => order.instrumentId === instrumentId && order.side === side && order.remaining.gt(0));
    for (const order of open) {
      const key = money(order.price);
      totals.set(key, (totals.get(key) ?? D(0)).add(order.remaining));
    }
    const levels = [...totals.entries()].map(([priceUsd, quantity]) => ({ priceUsd, quantity: money(quantity) }));
    levels.sort((a, b) => highFirst ? D(b.priceUsd).cmp(D(a.priceUsd)) : D(a.priceUsd).cmp(D(b.priceUsd)));
    return levels;
  }
  toResult(order) {
    const status = order.status === "FILLED" ? "FILLED" : order.status;
    return {
      clientOrderId: order.clientOrderId,
      venueOrderId: order.orderId,
      status,
      filledQuantity: money(order.filled),
      averageFillPriceUsd: order.filled.eq(0) ? "0" : money(order.notional.div(order.filled)),
      syntheticDemo: true
    };
  }
};
function parsePositive(value, field) {
  let parsed;
  try {
    parsed = D(value);
  } catch {
    throw new ApiException(400, "BAD_REQUEST", `${field} must be a decimal string`);
  }
  if (parsed.lte(0)) throw new ApiException(400, "BAD_REQUEST", `${field} must be positive`);
  return parsed;
}
function orderFingerprint(input) {
  return [input.instrumentId, input.side, input.priceUsd, input.quantity, input.nonce, input.goodTil].join("|");
}

// services/markets/src/clock.ts
function systemClock() {
  return { now: () => /* @__PURE__ */ new Date() };
}

// services/markets/src/config.ts
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var packageRoot2 = join(dirname(fileURLToPath2(import.meta.url)), "..");
function intEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function firstExisting2(paths) {
  for (const candidate of paths) {
    if (!candidate) continue;
    if (existsSync3(candidate)) return candidate;
  }
  return void 0;
}
function loadConfig2(overrides = {}) {
  const pemPath = firstExisting2([
    process.env.EXECUTION_AUTH_PUBLIC_KEY_PEM_PATH,
    process.env.EXECUTION_AUTH_PUBLIC_KEY_PATH,
    join(process.cwd(), "services/markets/dev-keys/execution-auth-public.pem"),
    join(process.cwd(), "services/execution/dev-keys/execution-auth-public.pem"),
    join(process.cwd(), "dev-keys/execution-auth-public.pem"),
    join(packageRoot2, "dev-keys/execution-auth-public.pem")
  ]);
  const fixturePath = firstExisting2([
    process.env.MARKET_FIXTURE_PATH,
    join(process.cwd(), "fixtures/market-search.json"),
    join(packageRoot2, "../../fixtures/market-search.json")
  ]);
  if (!overrides.publicKeyPem && !pemPath) {
    throw new Error("Execution auth public key PEM was not found. Set EXECUTION_AUTH_PUBLIC_KEY_PEM_PATH.");
  }
  if (!overrides.fixturePath && !fixturePath) {
    throw new Error("Market search fixture was not found. Set MARKET_FIXTURE_PATH.");
  }
  const config = {
    port: intEnv("PORT", 4102),
    version: "1.0.0",
    bearerToken: process.env.SWITCHBOARD_DEV_BEARER ?? "switchboard-dev-platform-token",
    makerKey: process.env.SANDBOX_MAKER_KEY ?? "sandbox-maker-dev",
    allowLive: process.env.EXECUTION_ALLOW_LIVE === "true",
    quoteTtlMs: intEnv("QUOTE_TTL_SECONDS", 30) * 1e3,
    makerCollateralUsd: process.env.SANDBOX_MAKER_COLLATERAL_USD ?? "1000000",
    publicKeyPem: overrides.publicKeyPem ?? readFileSync3(pemPath, "utf8"),
    fixturePath: overrides.fixturePath ?? fixturePath,
    kalshiEnabled: process.env.KALSHI_ENABLED !== "false",
    kalshiBaseUrl: process.env.KALSHI_API_BASE ?? "https://external-api.kalshi.com/trade-api/v2",
    kalshiSeries: process.env.KALSHI_SERIES_TICKER ?? "KXHIGHNY",
    kalshiTimeoutMs: intEnv("KALSHI_TIMEOUT_MS", 1200),
    polymarketUsApiKey: process.env.POLYMARKET_US_API_KEY || void 0
  };
  return { ...config, ...overrides };
}

// services/markets/src/executionAuth.ts
import { importSPKI as importSPKI2, jwtVerify } from "jose";
var MAX_TTL_SECONDS = 120;
async function loadPublicKey(pem) {
  return importSPKI2(pem, "EdDSA");
}
async function verifyExecutionToken(token, publicKey, now) {
  if (!token || token.split(".").length !== 3) {
    throw new ApiException(401, "INVALID_TOKEN", "Missing or invalid X-Execution-Authorization");
  }
  let payload;
  try {
    const verified = await jwtVerify(token, publicKey, {
      algorithms: ["EdDSA"],
      issuer: "switchboard-execution",
      audience: "markets",
      clockTolerance: 0,
      currentDate: now
    });
    payload = verified.payload;
  } catch {
    throw new ApiException(401, "INVALID_TOKEN", "Execution authorization was rejected");
  }
  const iat = payload.iat;
  const exp = payload.exp;
  if (typeof iat !== "number" || typeof exp !== "number") {
    throw new ApiException(401, "MISSING_CLAIM", "iat and exp are required");
  }
  if (exp <= iat || exp - iat > MAX_TTL_SECONDS) {
    throw new ApiException(401, "TOKEN_TTL", "Execution authorization lifetime must be between 1 and 120 seconds");
  }
  const side = claimString(payload, "side");
  if (side !== "BUY" && side !== "SELL") throw new ApiException(401, "MISSING_CLAIM", "side must be BUY or SELL");
  const mode = claimString(payload, "mode");
  if (mode !== "sandbox" && mode !== "live") throw new ApiException(401, "MISSING_CLAIM", "mode must be sandbox or live");
  const maxQuantity = claimString(payload, "maxQuantity");
  const maxPriceUsd = claimString(payload, "maxPriceUsd");
  const maxSpendUsd = claimString(payload, "maxSpendUsd");
  if (!isMoney2(maxQuantity) || !isMoney2(maxPriceUsd) || !isMoney2(maxSpendUsd)) {
    throw new ApiException(401, "MISSING_CLAIM", "Size and price claims must be decimal strings");
  }
  const jti = typeof payload.jti === "string" && payload.jti.length > 0 ? payload.jti : "";
  if (!jti) throw new ApiException(401, "MISSING_CLAIM", "jti is required");
  const terms = payload.canonicalTermsHash;
  return {
    sub: typeof payload.sub === "string" ? payload.sub : claimString(payload, "sub"),
    planHash: claimString(payload, "planHash"),
    quoteId: claimString(payload, "quoteId"),
    instrumentId: claimString(payload, "instrumentId"),
    venue: claimString(payload, "venue"),
    side,
    maxQuantity,
    maxPriceUsd,
    maxSpendUsd,
    jti,
    iat,
    exp,
    mode,
    canonicalTermsHash: typeof terms === "string" ? terms : void 0
  };
}
function claimString(payload, key) {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiException(401, "MISSING_CLAIM", `Missing claim ${key}`);
  }
  return value;
}

// services/markets/src/idempotency.ts
import { createHash as createHash3 } from "node:crypto";
function headerValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}
async function withIdempotency2(request, reply, records, handler2) {
  const key = headerValue(request.headers["idempotency-key"])?.trim();
  if (!key) throw new ApiException(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required");
  const bodyHash = createHash3("sha256").update(JSON.stringify(request.body ?? null)).digest("hex");
  const existing = records.get(key);
  if (existing) {
    if (existing.bodyHash !== bodyHash) {
      throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used with a different body");
    }
    reply.code(existing.status);
    return existing.body;
  }
  try {
    const body = await handler2();
    records.set(key, { bodyHash, status: 200, body });
    return body;
  } catch (error) {
    if (error instanceof ApiException && (error.status === 403 || error.status === 404 || error.status === 409)) {
      records.set(key, { bodyHash, status: error.status, body: error.toJSON(request.requestId) });
    }
    throw error;
  }
}

// services/markets/src/comparability.ts
function norm(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
function classifyComparison(exposure, candidate) {
  const weatherVersusOutage = exposure.subject === "weather" && candidate.subject === "service_outage" || exposure.subject === "service_outage" && candidate.subject === "weather";
  if (weatherVersusOutage) return "not_comparable";
  const same = norm(exposure.eventRule) === norm(candidate.eventRule) && norm(exposure.resolutionSource) === norm(candidate.resolutionSource) && norm(exposure.window) === norm(candidate.window) && norm(exposure.payoutUnit) === norm(candidate.payoutUnit) && norm(exposure.side) === norm(candidate.side);
  if (same) return "direct";
  if (exposure.subject === candidate.subject) return "proxy";
  const operational = /* @__PURE__ */ new Set(["service_outage", "service_cost", "capacity"]);
  if (operational.has(exposure.subject) && operational.has(candidate.subject)) return "proxy";
  return "not_comparable";
}
function exposureFromIds(exposureIds) {
  const text2 = exposureIds.join(" ").toLowerCase();
  const weather = /weather|hurricane|temperature|storm|climate/.test(text2);
  const outage = /outage|uptime|downtime|availability/.test(text2);
  const cost = /cost|token|premium|price/.test(text2);
  const capacity = /capacity|failover|throughput/.test(text2);
  if (weather && !outage) return WEATHER_EXPOSURE;
  if (cost && !outage) return COST_EXPOSURE;
  if (capacity && !outage) return CAPACITY_EXPOSURE;
  return OUTAGE_EXPOSURE;
}
var OUTAGE_EXPOSURE = {
  eventRule: "Pays 1000 USD per unit if 3 of 5 independent regions each observe >15 consecutive minutes unavailable during the contract window. 24h challenge.",
  resolutionSource: "https://example.invalid/switchboard/sandbox-oracle/service-outage",
  window: "2026-11-30T23:59:59.000Z",
  payoutUnit: "USD per binary contract",
  side: "BUY",
  subject: "service_outage"
};
var COST_EXPOSURE = {
  eventRule: "Payout per unit = min(max(benchmark USD per million tokens - 12, 0), 1000) over the November 2026 hourly window. Fully collateralized; no unbounded payoff.",
  resolutionSource: "https://example.invalid/switchboard/sandbox-oracle/service-cost",
  window: "2026-11-30T23:59:59.000Z",
  payoutUnit: "USD per capped contract",
  side: "BUY",
  subject: "service_cost"
};
var CAPACITY_EXPOSURE = {
  eventRule: "On a verified primary outage trigger, buyer may consume reserved throughput at 0.006 USD per request. Unavailable capacity pays at most the collateralized cap. Not a live capacity guarantee.",
  resolutionSource: "https://example.invalid/switchboard/sandbox-oracle/capacity",
  window: "2026-11-30T23:59:59.000Z",
  payoutUnit: "USD per capacity option",
  side: "BUY",
  subject: "capacity"
};
var WEATHER_EXPOSURE = {
  eventRule: "Pays if a reference city daily high temperature exceeds a stated Fahrenheit strike. Weather observation, not a service probe.",
  resolutionSource: "https://example.invalid/weather/reference-station",
  window: "2026-10-25T23:59:59.000Z",
  payoutUnit: "USD per weather binary",
  side: "BUY",
  subject: "weather"
};

// services/markets/src/instruments.ts
var OUTAGE_ID = "sb_sandbox_service_outage_binary";
var COST_ID = "sb_sandbox_service_cost_cap";
var CAPACITY_ID = "sb_sandbox_contingent_capacity_option";
var EXPIRY = "2026-11-30T23:59:59.000Z";
var OUTAGE_INSTRUMENT = Object.freeze({
  instrumentId: OUTAGE_ID,
  venue: "switchboard",
  name: "Synthetic SERVICE_OUTAGE_BINARY: API unavailable \u226515 minutes (3 of 5 regions)",
  riskFactor: "primary_outage",
  settlementType: "binary",
  eventRule: OUTAGE_EXPOSURE.eventRule,
  resolutionSourceUrl: OUTAGE_EXPOSURE.resolutionSource,
  expiresAt: EXPIRY,
  payoutPerUnitUsd: "1000",
  maximumPayoutUsd: "1000",
  collateralCurrency: "RLUSD",
  unitDescription: "One binary contract (synthetic sandbox)",
  comparisonGroupId: "svc-outage-15m-3of5"
});
var COST_INSTRUMENT = Object.freeze({
  instrumentId: COST_ID,
  venue: "switchboard",
  name: "Synthetic SERVICE_COST_CAP: inference benchmark above $12 / million tokens",
  riskFactor: "inference_cost",
  settlementType: "capped_call",
  eventRule: COST_EXPOSURE.eventRule,
  resolutionSourceUrl: COST_EXPOSURE.resolutionSource,
  expiresAt: EXPIRY,
  payoutPerUnitUsd: "1000",
  maximumPayoutUsd: "1000",
  collateralCurrency: "RLUSD",
  unitDescription: "One capped cost contract (synthetic sandbox). Payoff cannot exceed 1000 USD.",
  comparisonGroupId: "svc-cost-cap-12"
});
var CAPACITY_INSTRUMENT = Object.freeze({
  instrumentId: CAPACITY_ID,
  venue: "switchboard",
  name: "Synthetic CONTINGENT_CAPACITY_OPTION: reserved inference throughput",
  riskFactor: "failover_capacity",
  settlementType: "capacity_option",
  eventRule: CAPACITY_EXPOSURE.eventRule,
  resolutionSourceUrl: CAPACITY_EXPOSURE.resolutionSource,
  expiresAt: EXPIRY,
  payoutPerUnitUsd: "1000",
  maximumPayoutUsd: "1000",
  collateralCurrency: "RLUSD",
  unitDescription: "One capacity option (synthetic sandbox). Not a verified live reservation.",
  comparisonGroupId: "svc-capacity-option"
});
var STANDARD_INSTRUMENTS = Object.freeze([
  OUTAGE_INSTRUMENT,
  COST_INSTRUMENT,
  CAPACITY_INSTRUMENT
]);
function instrumentById(instrumentId) {
  return STANDARD_INSTRUMENTS.find((instrument) => instrument.instrumentId === instrumentId);
}
function instrumentTerms(instrument) {
  if (instrument.instrumentId === OUTAGE_ID) return { ...OUTAGE_EXPOSURE, window: instrument.expiresAt };
  if (instrument.instrumentId === COST_ID) return { ...COST_EXPOSURE, window: instrument.expiresAt };
  if (instrument.instrumentId === CAPACITY_ID) return { ...CAPACITY_EXPOSURE, window: instrument.expiresAt };
  return {
    eventRule: instrument.eventRule,
    resolutionSource: instrument.resolutionSourceUrl,
    window: instrument.expiresAt,
    payoutUnit: instrument.unitDescription,
    side: "BUY",
    subject: "other"
  };
}
var SANDBOX_LIQUIDITY = {
  [OUTAGE_ID]: {
    bids: [
      { priceUsd: "16", quantity: "20" },
      { priceUsd: "15", quantity: "30" }
    ],
    asks: [
      { priceUsd: "18", quantity: "25" },
      { priceUsd: "19", quantity: "25" },
      { priceUsd: "21", quantity: "50" }
    ]
  },
  [COST_ID]: {
    bids: [
      { priceUsd: "28", quantity: "15" },
      { priceUsd: "27", quantity: "20" }
    ],
    asks: [
      { priceUsd: "30", quantity: "40" },
      { priceUsd: "32", quantity: "60" }
    ]
  },
  [CAPACITY_ID]: {
    bids: [
      { priceUsd: "14", quantity: "10" },
      { priceUsd: "13", quantity: "20" }
    ],
    asks: [
      { priceUsd: "15", quantity: "20" },
      { priceUsd: "16", quantity: "80" }
    ]
  }
};

// services/markets/src/validate.ts
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function assertExact(body, required, optional = []) {
  if (!isRecord5(body)) throw new ApiException(400, "BAD_REQUEST", "JSON object body is required");
  const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new ApiException(400, "BAD_REQUEST", `Unexpected field ${key}`);
  }
  for (const key of required) {
    if (body[key] === void 0 || body[key] === null) throw new ApiException(400, "BAD_REQUEST", `Missing field ${key}`);
  }
  return body;
}
function assertString(body, key) {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) throw new ApiException(400, "BAD_REQUEST", `${key} must be a string`);
  return value;
}
function assertMoney(body, key) {
  const value = assertString(body, key);
  if (!isMoney2(value)) throw new ApiException(400, "BAD_REQUEST", `${key} must be a decimal string`);
  return value;
}
function assertBoolean(body, key) {
  const value = body[key];
  if (typeof value !== "boolean") throw new ApiException(400, "BAD_REQUEST", `${key} must be a boolean`);
  return value;
}
function assertIso(value, key) {
  if (Number.isNaN(Date.parse(value))) throw new ApiException(400, "BAD_REQUEST", `${key} must be an ISO timestamp`);
  return value;
}

// services/markets/src/marketOrders.ts
function parseMarketOrder(body) {
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
    clientOrderId: assertString(record, "clientOrderId")
  };
}
function placeMarketOrder(args) {
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
    throw new ApiException(409, "INSUFFICIENT_DEPTH", "Order quantity exceeds the quoted size");
  }
  let result;
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
      syntheticDemo: true
    };
  } else {
    const filled3 = store.book.place({
      makerId: EXECUTION_FLOW,
      instrumentId: quote.instrument.instrumentId,
      side: order.side,
      priceUsd: order.limitPriceUsd,
      quantity: order.quantity,
      nonce: `exec_${order.clientOrderId}_${claims.jti}`,
      goodTil: quote.expiresAt,
      clientOrderId: `mkt_${order.clientOrderId}`,
      nowMs: now,
      timeInForce: "FOK"
    });
    result = {
      clientOrderId: order.clientOrderId,
      venueOrderId: filled3.venueOrderId,
      status: "SIMULATED",
      filledQuantity: filled3.filledQuantity,
      averageFillPriceUsd: filled3.averageFillPriceUsd,
      syntheticDemo: true
    };
  }
  if (result.status === "FILLED" && result.syntheticDemo === false) {
    throw new Error("refusing FILLED with syntheticDemo false");
  }
  if (result.status === "SIMULATED") result.syntheticDemo = true;
  store.marketOrders.set(order.clientOrderId, { fingerprint, result });
  return result;
}
function assertClaimsFit(order, claims) {
  if (claims.sub !== order.approvalId) mismatch("approvalId");
  if (claims.planHash !== order.planHash) mismatch("planHash");
  if (claims.quoteId !== order.quoteId) mismatch("quoteId");
  if (claims.side !== order.side) mismatch("side");
  if (D(order.quantity).gt(D(claims.maxQuantity))) mismatch("quantity");
  if (order.side === "BUY" && D(order.limitPriceUsd).gt(D(claims.maxPriceUsd))) mismatch("limitPriceUsd");
  const notional = D(order.quantity).mul(D(order.limitPriceUsd));
  if (notional.gt(D(claims.maxSpendUsd))) mismatch("maxSpendUsd");
}
function mismatch(field) {
  throw new ApiException(403, "CLAIM_MISMATCH", `Order does not fit the execution authorization (${field})`, false, { field });
}

// services/markets/src/rfq.ts
var TYPES = /* @__PURE__ */ new Set(["binary", "capped_call", "capacity_option"]);
function parseRfqCreate(body) {
  const record = assertExact(body, ["instrumentType", "canonicalTermsHash", "desiredQuantity", "expiresAt", "approvedJurisdiction"], ["rfqId"]);
  const instrumentType = assertString(record, "instrumentType");
  if (!TYPES.has(instrumentType)) throw new ApiException(400, "BAD_REQUEST", "instrumentType is invalid");
  const desiredQuantity = assertMoney(record, "desiredQuantity");
  if (D(desiredQuantity).lte(0)) throw new ApiException(400, "BAD_REQUEST", "desiredQuantity must be positive");
  return {
    rfqId: record.rfqId === void 0 ? void 0 : assertString(record, "rfqId"),
    instrumentType,
    canonicalTermsHash: assertString(record, "canonicalTermsHash"),
    desiredQuantity,
    expiresAt: assertIso(assertString(record, "expiresAt"), "expiresAt"),
    approvedJurisdiction: assertString(record, "approvedJurisdiction")
  };
}
function createRfq(store, request, nowMs) {
  if (Date.parse(request.expiresAt) <= nowMs) throw new ApiException(409, "RFQ_EXPIRED", "RFQ expiry is already past");
  const rfqId = request.rfqId ?? store.nextId("rfq");
  if (store.rfqs.has(rfqId)) throw new ApiException(409, "RFQ_EXISTS", "RFQ id already exists");
  const stored = {
    rfqId,
    instrumentType: request.instrumentType,
    canonicalTermsHash: request.canonicalTermsHash,
    desiredQuantity: request.desiredQuantity,
    expiresAt: request.expiresAt,
    approvedJurisdiction: request.approvedJurisdiction,
    quotes: []
  };
  store.rfqs.set(rfqId, stored);
  return toRequest(stored);
}
function getRfq(store, rfqId) {
  const rfq = store.rfqs.get(rfqId);
  if (!rfq) throw new ApiException(404, "RFQ_NOT_FOUND", "Unknown RFQ");
  return toRequest(rfq);
}
function parseFirmQuote(body) {
  const record = assertExact(body, ["rfqId", "rfqQuoteId", "makerId", "premiumUsd", "maxPayoutUsd", "firmUntil", "collateralReserved"]);
  const premiumUsd = assertMoney(record, "premiumUsd");
  const maxPayoutUsd = assertMoney(record, "maxPayoutUsd");
  if (D(premiumUsd).lte(0) || D(maxPayoutUsd).lte(0)) throw new ApiException(400, "BAD_REQUEST", "premium and max payout must be positive");
  return {
    rfqId: assertString(record, "rfqId"),
    rfqQuoteId: assertString(record, "rfqQuoteId"),
    makerId: assertString(record, "makerId"),
    premiumUsd,
    maxPayoutUsd,
    firmUntil: assertIso(assertString(record, "firmUntil"), "firmUntil"),
    collateralReserved: Boolean(record.collateralReserved)
  };
}
function publishFirmQuote(store, pathRfqId, quote, authenticatedMakerId, nowMs) {
  if (quote.rfqId !== pathRfqId) throw new ApiException(400, "BAD_REQUEST", "rfqId does not match the path");
  if (quote.makerId !== authenticatedMakerId) throw new ApiException(403, "MAKER_MISMATCH", "makerId does not match X-Sandbox-Maker-Id");
  const rfq = store.rfqs.get(pathRfqId);
  if (!rfq) throw new ApiException(404, "RFQ_NOT_FOUND", "Unknown RFQ");
  if (Date.parse(rfq.expiresAt) <= nowMs) throw new ApiException(409, "RFQ_EXPIRED", "RFQ has expired");
  const firmUntilMs = Date.parse(quote.firmUntil);
  if (firmUntilMs <= nowMs) throw new ApiException(409, "QUOTE_EXPIRED", "Firm quote expiry is already past");
  if (firmUntilMs > Date.parse(rfq.expiresAt)) throw new ApiException(400, "BAD_REQUEST", "firmUntil cannot be after the RFQ expiry");
  if (rfq.quotes.some((existing) => existing.rfqQuoteId === quote.rfqQuoteId)) {
    throw new ApiException(409, "QUOTE_EXISTS", "rfqQuoteId already exists");
  }
  const lockAmount = D(quote.maxPayoutUsd);
  store.book.lockFunds(authenticatedMakerId, lockAmount);
  const stored = {
    rfqId: rfq.rfqId,
    rfqQuoteId: quote.rfqQuoteId,
    makerId: authenticatedMakerId,
    premiumUsd: money(D(quote.premiumUsd)),
    maxPayoutUsd: money(lockAmount),
    firmUntil: quote.firmUntil,
    collateralReserved: true,
    canonicalTermsHash: rfq.canonicalTermsHash,
    lockedAmount: lockAmount,
    status: "FIRM"
  };
  rfq.quotes.push(stored);
  return toQuote(stored);
}
function parseAccept(body) {
  const record = assertExact(body, ["rfqQuoteId", "approvalId", "planHash", "idempotencyKey"]);
  return {
    rfqQuoteId: assertString(record, "rfqQuoteId"),
    approvalId: assertString(record, "approvalId"),
    planHash: assertString(record, "planHash"),
    idempotencyKey: assertString(record, "idempotencyKey")
  };
}
function acceptFirmQuote(args) {
  const { store, rfqId, body, claims, nowMs } = args;
  const rfq = store.rfqs.get(rfqId);
  if (!rfq) throw new ApiException(404, "RFQ_NOT_FOUND", "Unknown RFQ");
  const firm = rfq.quotes.find((quote) => quote.rfqQuoteId === body.rfqQuoteId);
  if (!firm) throw new ApiException(404, "QUOTE_NOT_FOUND", "Unknown firm quote");
  if (claims.sub !== body.approvalId) throw new ApiException(403, "CLAIM_MISMATCH", "approvalId does not match the execution token");
  if (claims.planHash !== body.planHash) throw new ApiException(403, "CLAIM_MISMATCH", "planHash does not match the execution token");
  if (claims.quoteId !== firm.rfqQuoteId) throw new ApiException(403, "CLAIM_MISMATCH", "quoteId claim must be the firm rfqQuoteId");
  if (claims.instrumentId !== rfq.rfqId) throw new ApiException(403, "CLAIM_MISMATCH", "instrumentId claim must be the rfqId");
  if (claims.venue !== "switchboard") throw new ApiException(403, "CLAIM_MISMATCH", "RFQ accept venue must be switchboard");
  if (claims.side !== "BUY") throw new ApiException(403, "CLAIM_MISMATCH", "RFQ accept side must be BUY");
  if (claims.mode !== "sandbox") throw new ApiException(403, "LIVE_MODE_DISABLED", "RFQ accept is sandbox-only");
  if (D(rfq.desiredQuantity).gt(D(claims.maxQuantity))) throw new ApiException(403, "CLAIM_MISMATCH", "RFQ quantity exceeds maxQuantity");
  if (D(firm.premiumUsd).gt(D(claims.maxSpendUsd))) throw new ApiException(403, "CLAIM_MISMATCH", "RFQ premium exceeds maxSpendUsd");
  if (!claims.canonicalTermsHash || claims.canonicalTermsHash !== firm.canonicalTermsHash || claims.canonicalTermsHash !== rfq.canonicalTermsHash) {
    throw new ApiException(409, "TERMS_HASH_MISMATCH", "Canonical terms hash does not match the firm quote");
  }
  if (firm.status === "ACCEPTED" && rfq.acceptedQuoteId === firm.rfqQuoteId) {
    return toQuote(firm);
  }
  if (nowMs >= Date.parse(firm.firmUntil) || nowMs >= Date.parse(rfq.expiresAt) || firm.status === "EXPIRED") {
    if (firm.status === "FIRM") {
      store.book.releaseFunds(firm.makerId, firm.lockedAmount);
      firm.status = "EXPIRED";
      firm.collateralReserved = false;
      firm.lockedAmount = D(0);
    }
    throw new ApiException(409, "QUOTE_EXPIRED", "Firm quote expired and cannot be accepted");
  }
  firm.status = "ACCEPTED";
  rfq.acceptedQuoteId = firm.rfqQuoteId;
  return toQuote(firm);
}
function toRequest(rfq) {
  return {
    rfqId: rfq.rfqId,
    instrumentType: rfq.instrumentType,
    canonicalTermsHash: rfq.canonicalTermsHash,
    desiredQuantity: rfq.desiredQuantity,
    expiresAt: rfq.expiresAt,
    approvedJurisdiction: rfq.approvedJurisdiction
  };
}
function toQuote(quote) {
  return {
    rfqId: quote.rfqId,
    rfqQuoteId: quote.rfqQuoteId,
    makerId: quote.makerId,
    premiumUsd: quote.premiumUsd,
    maxPayoutUsd: quote.maxPayoutUsd,
    firmUntil: quote.firmUntil,
    collateralReserved: quote.collateralReserved
  };
}

// services/markets/src/search.ts
import { readFileSync as readFileSync4 } from "node:fs";

// services/markets/src/pricing.ts
var SWITCHBOARD_SANDBOX_FEES = {
  version: "switchboard-sandbox-fee-v1",
  tradingFeeRate: "0.01",
  networkFeeUsd: "1",
  conversionFeeRate: "0",
  unfilledSlippageRate: "0.02"
};
var UNVERIFIED_VENUE_FEES = {
  version: "unverified-fee-not-applied-v1",
  tradingFeeRate: "0",
  networkFeeUsd: "0",
  conversionFeeRate: "0",
  unfilledSlippageRate: "0.02"
};
function priceAtSize(asks, requestedQuantity, fees) {
  const requested = D(requestedQuantity);
  const levels = asks.map((level) => ({ price: D(level.priceUsd), quantity: D(level.quantity) })).filter((level) => level.price.gt(0) && level.quantity.gt(0)).sort((a, b) => a.price.cmp(b.price));
  let available = D(0);
  for (const level of levels) available = available.add(level.quantity);
  let remaining = requested;
  let notional = D(0);
  let filled3 = D(0);
  let lastPrice = levels.length > 0 ? levels[0].price : D(0);
  for (const level of levels) {
    if (remaining.lte(0)) break;
    const take = DecimalMin(remaining, level.quantity);
    notional = notional.add(take.mul(level.price));
    filled3 = filled3.add(take);
    remaining = remaining.sub(take);
    lastPrice = level.price;
  }
  const unfilled = requested.sub(filled3);
  const trading = notional.mul(D(fees.tradingFeeRate));
  const network = D(fees.networkFeeUsd);
  const conversion = notional.mul(D(fees.conversionFeeRate));
  const slippage = unfilled.gt(0) ? unfilled.mul(lastPrice).mul(D(fees.unfilledSlippageRate)) : D(0);
  const allIn = notional.add(trading).add(network).add(conversion).add(slippage);
  const feeBreakdown = {
    tradingFeeUsd: money(trading),
    networkFeeUsd: money(network),
    conversionFeeUsd: money(conversion),
    modeledSlippageUsd: money(slippage),
    otherFeeUsd: "0"
  };
  return {
    filledQuantity: money(filled3),
    availableQuantity: money(available),
    notionalUsd: money(notional),
    fees: feeBreakdown,
    estimatedAllInBuyCostUsd: money(allIn),
    depthCoversQuantity: requested.gt(0) && unfilled.lte(0),
    bestAskUsd: levels.length > 0 ? money(levels[0].price) : "0",
    lastWalkedPriceUsd: levels.length > 0 ? money(lastPrice) : "0"
  };
}
function DecimalMin(a, b) {
  return a.lte(b) ? a : b;
}
function bestBid(bids) {
  let best;
  for (const level of bids) {
    const price = D(level.priceUsd);
    if (price.lte(0) || D(level.quantity).lte(0)) continue;
    if (!best || price.gt(best)) best = price;
  }
  return best ? money(best) : "0";
}

// services/markets/src/kalshi.ts
function asksFromKalshiNoBids(noDollars) {
  const asks = [];
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
async function loadKalshiReference(args) {
  const fetchImpl = args.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const listUrl = `${args.baseUrl}/markets?limit=5&status=open&series_ticker=${encodeURIComponent(args.series)}`;
    const listed = await getJson(fetchImpl, listUrl, controller.signal);
    const market = (listed.markets ?? []).find((row) => row.ticker && row.rules_primary && row.title && !row.mve_collection_ticker);
    if (!market?.ticker || !market.rules_primary || !market.expiration_time) return null;
    let asks = [];
    let bids = [];
    try {
      const book = await getJson(fetchImpl, `${args.baseUrl}/markets/${encodeURIComponent(market.ticker)}/orderbook?depth=10`, controller.signal);
      asks = asksFromKalshiNoBids(book.orderbook_fp?.no_dollars);
      bids = (book.orderbook_fp?.yes_dollars ?? []).map(([priceUsd, quantity]) => ({ priceUsd, quantity })).filter((level) => {
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
    const candidate = {
      eventRule: market.rules_primary,
      resolutionSource: "Kalshi contract rules_primary",
      window: market.expiration_time,
      payoutUnit: "USD per Kalshi binary contract",
      side: "BUY",
      subject: "weather"
    };
    const comparison = classifyComparison(args.exposure, candidate);
    const quote = {
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
        unitDescription: "One Kalshi binary contract from the public read API. Not executable here."
      },
      venue: "kalshi",
      capability: "read_only",
      comparison,
      eligibilityReason: "Read-only Kalshi public market data. No order credentials, so this quote is not executable and must not be shown as a fill. Category fees were not applied (zeros are not a Kalshi fee schedule). A weather contract is not arbitrage against a different resolution rule.",
      bidUsd: bid,
      askUsd: priced.bestAskUsd,
      requestedQuantity: args.requestedQuantity,
      availableQuantity: priced.availableQuantity,
      estimatedAllInBuyCostUsd: priced.estimatedAllInBuyCostUsd,
      fees: priced.fees,
      quotedAt: now.toISOString(),
      expiresAt: quoteExpiry,
      source: "live",
      basisRiskDescription: comparison === "direct" ? "Public Kalshi contract matches the compared terms. Still not executable in this service." : "Kalshi weather (or other) resolution does not match a service-outage, cost-cap, or capacity exposure unless every comparison term matches. Not arbitrage."
    };
    void args.jurisdiction;
    return quote;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
async function getJson(fetchImpl, url, signal) {
  const response = await fetchImpl(url, { signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// services/markets/src/search.ts
function parseSearchRequest(body) {
  const record = assertExact(body, ["companyId", "exposureIds", "requestedQuantity", "jurisdiction", "includeReferenceMarkets"]);
  const companyId = assertString(record, "companyId");
  const requestedQuantity = assertMoney(record, "requestedQuantity");
  if (D(requestedQuantity).lte(0)) throw new ApiException(400, "BAD_REQUEST", "requestedQuantity must be positive");
  const jurisdiction = assertString(record, "jurisdiction");
  const includeReferenceMarkets = assertBoolean(record, "includeReferenceMarkets");
  const exposureIdsRaw = record.exposureIds;
  if (!Array.isArray(exposureIdsRaw) || exposureIdsRaw.some((id2) => typeof id2 !== "string" || id2.length === 0)) {
    throw new ApiException(400, "BAD_REQUEST", "exposureIds must be an array of strings");
  }
  return { companyId, exposureIds: exposureIdsRaw, requestedQuantity, jurisdiction, includeReferenceMarkets };
}
function readFixture(path3) {
  return JSON.parse(readFileSync4(path3, "utf8"));
}
function rememberFixtureQuotes(store, response) {
  for (const quote of response.quotes) {
    store.quotes.set(quote.quoteId, {
      quote: structuredClone(quote),
      executable: quote.capability === "sandbox" && quote.venue === "switchboard" && D(quote.availableQuantity).gte(D(quote.requestedQuantity)),
      mode: "snapshot",
      snapshotRemaining: D(quote.availableQuantity)
    });
  }
}
async function buildSearch(args) {
  const { request, store, clock, config } = args;
  const exposure = exposureFromIds(request.exposureIds);
  const now = clock.now();
  const quotedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + config.quoteTtlMs).toISOString();
  const quotes = [];
  for (const instrument of STANDARD_INSTRUMENTS) {
    const depth = store.book.levels(instrument.instrumentId, now.getTime());
    const priced = priceAtSize(depth.asks, request.requestedQuantity, SWITCHBOARD_SANDBOX_FEES);
    const comparison = classifyComparison(exposure, instrumentTerms(instrument));
    const executable = priced.depthCoversQuantity;
    const quote = {
      quoteId: store.nextId(`q_${instrument.instrumentId}`),
      instrument: { ...instrument },
      venue: "switchboard",
      capability: "sandbox",
      comparison,
      eligibilityReason: executable ? `SANDBOX synthetic Switchboard book. Fee schedule ${SWITCHBOARD_SANDBOX_FEES.version}. Not a regulated live market.` : `SANDBOX synthetic Switchboard book. Fee schedule ${SWITCHBOARD_SANDBOX_FEES.version}. Insufficient depth for the requested quantity; quote is not executable.`,
      bidUsd: bestBid(depth.bids),
      askUsd: priced.bestAskUsd,
      requestedQuantity: request.requestedQuantity,
      availableQuantity: priced.availableQuantity,
      estimatedAllInBuyCostUsd: priced.estimatedAllInBuyCostUsd,
      fees: priced.fees,
      quotedAt,
      expiresAt,
      source: "sandbox",
      basisRiskDescription: basisText(comparison)
    };
    quotes.push(quote);
    store.quotes.set(quote.quoteId, {
      quote,
      executable,
      mode: "book",
      snapshotRemaining: D(priced.availableQuantity)
    });
  }
  const warnings = [
    "Switchboard quotes are synthetic sandbox liquidity, not a regulated live market and not a live fill.",
    "Kalshi order placement was not verified.",
    "Polymarket US live book was not verified and is not invented.",
    "Polymarket International is reference-only for a US jurisdiction. A price gap versus a different resolution rule is not arbitrage.",
    "Capacity offers have verifiedCapacity false until a live load test and reservation exist.",
    `Switchboard fee schedule ${SWITCHBOARD_SANDBOX_FEES.version} is a sandbox model. Kalshi and Polymarket category fees are not reused.`
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
      fetchImpl: args.fetchImpl
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
    warnings
  };
}
function basisText(comparison) {
  if (comparison === "direct") {
    return "Event rule, resolution source, window, payout unit, and side match. Residual basis remains if the firm's loss differs from the contract trigger. Not arbitrage.";
  }
  if (comparison === "proxy") {
    return "Related risk family, but the event rule, resolution source, window, payout unit, or side does not fully match. Not a direct hedge and not arbitrage.";
  }
  return "Different event. A weather contract versus a cloud or service outage is not comparable and is not arbitrage.";
}
function capacityOffer() {
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
    capability: "sandbox"
  };
}
function zeroFees() {
  return { tradingFeeUsd: "0", networkFeeUsd: "0", conversionFeeUsd: "0", modeledSlippageUsd: "0", otherFeeUsd: "0" };
}
function syntheticWeatherQuote(store, request, exposure, quotedAt, expiresAt) {
  const terms = {
    eventRule: "Pays if a reference city daily high temperature exceeds a stated Fahrenheit strike. Weather observation, not a service probe.",
    resolutionSource: "https://example.invalid/weather/reference-station",
    window: "2026-10-25T23:59:59.000Z",
    payoutUnit: "USD per weather binary",
    side: "BUY",
    subject: "weather"
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
      unitDescription: "Synthetic weather reference. Not executable."
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
    basisRiskDescription: basisText(classifyComparison(exposure, terms))
  };
}
function isUs(jurisdiction) {
  const value = jurisdiction.trim().toLowerCase();
  return value === "us" || value === "usa" || value === "united states" || value === "united states of america";
}
function syntheticInternationalQuote(store, request, exposure, quotedAt, expiresAt) {
  const us = isUs(request.jurisdiction);
  const terms = {
    eventRule: "International reference binary with its own resolution source and window. Not a Switchboard service-outage contract.",
    resolutionSource: "https://example.invalid/polymarket-international/reference",
    window: "2026-12-31T23:59:59.000Z",
    payoutUnit: "USD per international reference contract",
    side: "BUY",
    subject: "other"
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
      unitDescription: "Synthetic international reference. Not executable from this service."
    },
    venue: "polymarket_international",
    capability: "read_only",
    comparison: classifyComparison(exposure, terms),
    eligibilityReason: us ? "Reference only for a US jurisdiction. Polymarket International orders are rejected. A price gap versus a different resolution rule is not arbitrage. This row is synthetic, not a live book." : "No Polymarket International execution integration. Reference synthetic only, not a live book, and not arbitrage.",
    bidUsd: "0",
    askUsd: "0",
    requestedQuantity: request.requestedQuantity,
    availableQuantity: "0",
    estimatedAllInBuyCostUsd: "0",
    fees: zeroFees(),
    quotedAt,
    expiresAt,
    source: "synthetic",
    basisRiskDescription: "Different resolution rule from Switchboard service contracts. Not comparable as arbitrage."
  };
}

// services/markets/src/store.ts
var MemoryStore = class {
  quotes = /* @__PURE__ */ new Map();
  idempotency = /* @__PURE__ */ new Map();
  usedJti = /* @__PURE__ */ new Set();
  marketOrders = /* @__PURE__ */ new Map();
  rfqs = /* @__PURE__ */ new Map();
  book;
  sequence = 0;
  constructor(endowmentUsd) {
    const endowment = D(endowmentUsd);
    const large = D("100000000");
    this.book = new OrderBook(
      (instrumentId) => {
        const instrument = instrumentById(instrumentId);
        return instrument ? D(instrument.maximumPayoutUsd) : void 0;
      },
      (makerId) => makerId === LIQUIDITY_MAKER || makerId === EXECUTION_FLOW ? large : endowment
    );
  }
  nextId(prefix) {
    this.sequence += 1;
    return `${prefix}_${this.sequence}`;
  }
  seedLiquidity(nowMs) {
    const goodTil = new Date(nowMs + 365 * 24 * 60 * 60 * 1e3).toISOString();
    let nonce = 0;
    for (const instrument of STANDARD_INSTRUMENTS) {
      const ladder = SANDBOX_LIQUIDITY[instrument.instrumentId];
      if (!ladder) continue;
      for (const side of ["BUY", "SELL"]) {
        for (const level of side === "BUY" ? ladder.bids : ladder.asks) {
          nonce += 1;
          const input = {
            makerId: LIQUIDITY_MAKER,
            instrumentId: instrument.instrumentId,
            side,
            priceUsd: level.priceUsd,
            quantity: level.quantity,
            nonce: `seed_${nonce}`,
            goodTil,
            clientOrderId: `seed_${instrument.instrumentId}_${side}_${level.priceUsd}`,
            nowMs,
            timeInForce: "GTC"
          };
          this.book.place(input);
        }
      }
    }
  }
};

// services/markets/src/app.ts
async function buildApp2(options = {}) {
  const config = loadConfig2(options.config);
  const clock = options.clock ?? systemClock();
  const store = new MemoryStore(config.makerCollateralUsd);
  if (options.seedLiquidity !== false) store.seedLiquidity(clock.now().getTime());
  const publicKey = await loadPublicKey(config.publicKeyPem);
  const kalshiEnabled = options.kalshiEnabled ?? config.kalshiEnabled;
  const app = Fastify2({ logger: false });
  app.decorate("store", store);
  app.decorate("clock", clock);
  app.decorate("config", config);
  app.addHook("onRequest", async (request, reply) => {
    const incoming = headerValue(request.headers["x-request-id"])?.trim();
    const requestId = incoming && incoming.length > 0 ? incoming : randomUUID7();
    request.requestId = requestId;
    reply.header("x-request-id", requestId);
    const path3 = request.url.split("?")[0];
    if (path3 === "/healthz") return;
    const authorization = headerValue(request.headers.authorization);
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, config.bearerToken)) {
      throw new ApiException(401, "UNAUTHORIZED", "Bearer token was rejected");
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const correlationId2 = request.requestId || "unknown";
    if (error instanceof ApiException) {
      reply.status(error.status).send(error.toJSON(correlationId2));
      return;
    }
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    if (statusCode === 400) {
      reply.status(400).send({ code: "BAD_REQUEST", message: "Invalid request", correlationId: correlationId2, retryable: false });
      return;
    }
    reply.status(500).send({ code: "INTERNAL", message: "Internal error", correlationId: correlationId2, retryable: true });
  });
  app.get("/healthz", async () => ({ status: "ok", service: "markets", version: config.version }));
  app.post(
    "/v1/markets/search",
    async (request, reply) => withIdempotency2(request, reply, store.idempotency, async () => {
      const parsed = parseSearchRequest(request.body);
      const fixture = headerValue(request.headers["x-demo-fixture"]);
      if (fixture === "market-search" && parsed.companyId === "co_demo_ai") {
        const body = readFixture(config.fixturePath);
        rememberFixtureQuotes(store, body);
        return body;
      }
      return buildSearch({ request: parsed, store, clock, config, kalshiEnabled, fetchImpl: options.fetchImpl });
    })
  );
  app.post(
    "/v1/markets/orders",
    async (request, reply) => withIdempotency2(request, reply, store.idempotency, async () => {
      const claims = await requireExecution(request, store, publicKey, clock);
      const order = parseMarketOrder(request.body);
      return placeMarketOrder({ order, claims, store, clock, config });
    })
  );
  app.get("/v1/markets/instruments/:instrumentId", async (request) => {
    const instrumentId = request.params.instrumentId;
    const instrument = instrumentById(instrumentId);
    if (!instrument) throw new ApiException(404, "INSTRUMENT_NOT_FOUND", "Unknown instrument");
    return { ...instrument };
  });
  app.get("/v1/exchange/instruments", async () => {
    const body = {
      instruments: STANDARD_INSTRUMENTS.map((instrument) => ({ ...instrument })),
      retrievedAt: clock.now().toISOString(),
      mode: "sandbox"
    };
    return body;
  });
  app.post(
    "/v1/exchange/rfqs",
    async (request, reply) => withIdempotency2(request, reply, store.idempotency, async () => createRfq(store, parseRfqCreate(request.body), clock.now().getTime()))
  );
  app.get("/v1/exchange/rfqs/:rfqId", async (request) => getRfq(store, request.params.rfqId));
  app.post(
    "/v1/exchange/rfqs/:rfqId/quotes",
    async (request, reply) => withIdempotency2(request, reply, store.idempotency, async () => {
      const makerId = requireMaker(request, config);
      return publishFirmQuote(store, request.params.rfqId, parseFirmQuote(request.body), makerId, clock.now().getTime());
    })
  );
  app.post(
    "/v1/exchange/rfqs/:rfqId/accept",
    async (request, reply) => withIdempotency2(request, reply, store.idempotency, async () => {
      const claims = await requireExecution(request, store, publicKey, clock);
      return acceptFirmQuote({
        store,
        rfqId: request.params.rfqId,
        body: parseAccept(request.body),
        claims,
        nowMs: clock.now().getTime()
      });
    })
  );
  app.post(
    "/v1/exchange/orders",
    async (request, reply) => withIdempotency2(request, reply, store.idempotency, async () => {
      const makerId = requireMaker(request, config);
      const order = parseExchangeOrder(request.body);
      return store.book.place({
        makerId,
        instrumentId: order.instrumentId,
        side: order.side,
        priceUsd: order.priceUsd,
        quantity: order.quantity,
        nonce: order.nonce,
        goodTil: order.goodTil,
        clientOrderId: order.clientOrderId,
        nowMs: clock.now().getTime(),
        timeInForce: "GTC"
      });
    })
  );
  app.post(
    "/v1/exchange/orders/cancel",
    async (request, reply) => withIdempotency2(request, reply, store.idempotency, async () => {
      const makerId = requireMaker(request, config);
      const record = assertExact(request.body, ["clientOrderId"]);
      return store.book.cancel(makerId, assertString(record, "clientOrderId"), clock.now().getTime());
    })
  );
  app.get("/v1/exchange/orderbook/:instrumentId", async (request) => {
    const instrumentId = request.params.instrumentId;
    if (!instrumentById(instrumentId)) throw new ApiException(404, "INSTRUMENT_NOT_FOUND", "Unknown instrument");
    const nowMs = clock.now().getTime();
    const levels = store.book.levels(instrumentId, nowMs);
    return {
      instrumentId,
      bids: levels.bids,
      asks: levels.asks,
      updatedAt: new Date(nowMs).toISOString(),
      mode: "sandbox"
    };
  });
  return app;
}
async function requireExecution(request, store, publicKey, clock) {
  const token = headerValue(request.headers["x-execution-authorization"])?.trim();
  if (!token) throw new ApiException(401, "INVALID_TOKEN", "X-Execution-Authorization is required");
  const claims = await verifyExecutionToken(token, publicKey, clock.now());
  if (store.usedJti.has(claims.jti)) throw new ApiException(403, "JTI_REPLAY", "Execution authorization jti was already used");
  store.usedJti.add(claims.jti);
  return claims;
}
function requireMaker(request, config) {
  const key = headerValue(request.headers["x-sandbox-maker-key"])?.trim();
  if (!key || !safeEqual(key, config.makerKey)) {
    throw new ApiException(401, "INVALID_MAKER_KEY", "X-Sandbox-Maker-Key was rejected");
  }
  const makerId = headerValue(request.headers["x-sandbox-maker-id"])?.trim() || "sandbox-maker";
  if (makerId === LIQUIDITY_MAKER || makerId === EXECUTION_FLOW) {
    throw new ApiException(403, "RESERVED_MAKER", "That maker id is reserved for sandbox liquidity");
  }
  return makerId;
}
function parseExchangeOrder(body) {
  const record = assertExact(body, ["instrumentId", "side", "priceUsd", "quantity", "nonce", "goodTil", "clientOrderId"]);
  const side = assertString(record, "side");
  if (side !== "BUY" && side !== "SELL") throw new ApiException(400, "BAD_REQUEST", "side must be BUY or SELL");
  return {
    instrumentId: assertString(record, "instrumentId"),
    side,
    priceUsd: assertMoney(record, "priceUsd"),
    quantity: assertMoney(record, "quantity"),
    nonce: assertString(record, "nonce"),
    goodTil: assertIso(assertString(record, "goodTil"), "goodTil"),
    clientOrderId: assertString(record, "clientOrderId")
  };
}
function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// services/strategy/src/app.ts
import { createHash as createHash6, randomUUID as randomUUID8 } from "node:crypto";
import Fastify3 from "fastify";

// services/strategy/src/analyze.ts
import { createHash as createHash4 } from "node:crypto";

// services/strategy/src/errors.ts
var StrategyError = class extends Error {
  status;
  code;
  details;
  constructor(status, code, message, details) {
    super(message);
    this.name = "StrategyError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
};

// services/strategy/src/money.ts
import { Decimal as Decimal4 } from "decimal.js";
Decimal4.set({ precision: 40, rounding: Decimal4.ROUND_HALF_UP });
var MONEY_PATTERN = /^-?[0-9]+(?:\.[0-9]+)?$/;
function dec(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("non-finite number");
    }
    return new Decimal4(value.toString());
  }
  return new Decimal4(value);
}
function money2(value) {
  const parsed = value instanceof Decimal4 ? value : dec(value);
  if (!parsed.isFinite()) {
    throw new Error("non-finite money");
  }
  let rendered = parsed.toFixed(8);
  if (rendered.includes(".")) {
    rendered = rendered.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (rendered === "-0") return "0";
  return rendered;
}
function isMoneyString(value) {
  return typeof value === "string" && MONEY_PATTERN.test(value);
}

// services/strategy/src/analyze.ts
var THIN_WARNING = [
  "Description is too thin to estimate a loss distribution.",
  "Missing data: business model and revenue driver, critical dependencies or suppliers, loss magnitude or a historical shock, time horizon, and where the loss is booked.",
  "Placeholder scenarios are not a risk measurement. Do not treat the confidence score as evidence."
];
function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StrategyError(400, "INVALID_REQUEST", "Expected a JSON object.");
  }
  return value;
}
function requireMoneyField(source, field) {
  const value = source[field];
  if (!isMoneyString(value)) {
    throw new StrategyError(400, "INVALID_MONEY", `${field} must be a decimal string.`);
  }
  return value;
}
function validateAnalyzeRequest(body) {
  const source = asRecord(body);
  const allowed = /* @__PURE__ */ new Set(["description", "jurisdiction", "monthlyHedgeBudgetUsd", "maxTolerableTailLossUsd"]);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) {
      throw new StrategyError(400, "INVALID_REQUEST", `Unknown field ${key}.`);
    }
  }
  if (typeof source.description !== "string" || source.description.trim().length === 0) {
    throw new StrategyError(400, "INVALID_REQUEST", "description is required.");
  }
  if (typeof source.jurisdiction !== "string" || source.jurisdiction.trim().length === 0) {
    throw new StrategyError(400, "INVALID_REQUEST", "jurisdiction is required.");
  }
  const monthlyHedgeBudgetUsd = requireMoneyField(source, "monthlyHedgeBudgetUsd");
  const maxTolerableTailLossUsd = requireMoneyField(source, "maxTolerableTailLossUsd");
  if (monthlyHedgeBudgetUsd.startsWith("-") || maxTolerableTailLossUsd.startsWith("-")) {
    throw new StrategyError(400, "INFEASIBLE_BUDGET", "Budget and max tolerable tail loss must be non-negative.");
  }
  return {
    description: source.description.trim(),
    jurisdiction: source.jurisdiction.trim(),
    monthlyHedgeBudgetUsd,
    maxTolerableTailLossUsd
  };
}
function wordCount(description) {
  return description.trim().split(/\s+/).filter(Boolean).length;
}
function isThinDescription(description) {
  return description.trim().length < 40 || wordCount(description) < 6;
}
function countHits(text2, phrases) {
  return phrases.reduce((total, phrase) => total + (text2.includes(phrase) ? 1 : 0), 0);
}
function classifyDescription(description) {
  const text2 = description.toLowerCase();
  if (isThinDescription(description)) return "thin";
  if (text2.includes("demo support ai") || text2.includes("fictional ai customer-support") || text2.includes("customer-support") && text2.includes("primary model api")) {
    return "ai_demo";
  }
  if (text2.includes("demo coastal retailer") || text2.includes("storm-related delivery") || text2.includes("fictional retail operator")) {
    return "retail_demo";
  }
  const digital = countHits(text2, ["inference", "llm", "gpu", "uptime", "outage", "model api", "cloud", "openai", "anthropic", "token"]);
  const climate = countHits(text2, ["retail", "store", "weather", "storm", "hurricane", "climate", "rainfall", "snow", "flood", "temperature"]);
  const supply = countHits(text2, ["shipping", "freight", "port", "container", "supply chain", "importer", "logistics", "vessel", "customs"]);
  const best = Math.max(digital, climate, supply);
  if (best === 0) return "freeform";
  if (supply === best && supply >= climate && supply >= digital) return "supply_chain";
  if (climate === best && climate >= digital) return "climate";
  return "digital";
}
function stableId2(prefix, material) {
  const hex = createHash4("sha256").update(material).digest("hex").slice(0, 16);
  return `${prefix}_${hex}`;
}
function titleFrom(description, fallback) {
  const cleaned = description.replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= 80) return cleaned;
  return `${cleaned.slice(0, 77).trimEnd()}...`;
}
function provenance(template, confirmed) {
  return `Provenance: template=${template}; evidence=synthetic_template; generator=switchboard-strategy; confirmedByUser=${confirmed}.`;
}
function shell(request, companyId, name, exposures, scenarios) {
  return {
    companyId,
    name,
    description: request.description,
    jurisdiction: request.jurisdiction,
    baseCurrency: "USD",
    monthlyHedgeBudgetUsd: request.monthlyHedgeBudgetUsd,
    maxTolerableTailLossUsd: request.maxTolerableTailLossUsd,
    cvarAlpha: 0.95,
    exposures,
    scenarios,
    confirmedByUser: false
  };
}
function aiDemo(request) {
  const scenarios = [
    { scenarioId: "normal", label: "Normal operations", probability: 0.85, baselineLossUsd: "0", factorShocks: { primary_outage: 0, fallback_spread: 0 }, source: "synthetic" },
    { scenarioId: "price_spike", label: "Price spike without outage", probability: 0.1, baselineLossUsd: "2500", factorShocks: { primary_outage: 0, fallback_spread: 1 }, source: "synthetic" },
    { scenarioId: "primary_down", label: "Primary outage; fallback available", probability: 0.04, baselineLossUsd: "5000", factorShocks: { primary_outage: 1, fallback_spread: 1 }, source: "synthetic" },
    { scenarioId: "correlated_down", label: "Correlated provider outage", probability: 0.01, baselineLossUsd: "25000", factorShocks: { primary_outage: 1, fallback_spread: 2 }, source: "synthetic" }
  ];
  const exposures = [{
    exposureId: "exp_inference",
    category: "digital",
    label: "Inference provider outage and replacement-cost spread",
    description: "Loss of traffic and higher fallback inference expenses",
    riskFactors: ["primary_outage", "fallback_spread"],
    horizonDays: 30,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: 0.6
  }];
  return {
    company: shell(request, "co_demo_ai", "Northline Support", exposures, scenarios),
    assumptions: [
      provenance("ai_demo", false),
      "Illustrative case. Loss scenarios are a template until you edit them.",
      "Primary and fallback models must pass task-specific equivalence checks."
    ],
    warnings: [
      "Current amounts are not actuarially calibrated or derived from live market prices.",
      "confirmedByUser is false until this desk submits the profile on strategy generate."
    ]
  };
}
function retailDemo(request) {
  const scenarios = [
    { scenarioId: "storm_normal", label: "No significant storm", probability: 0.85, baselineLossUsd: "0", factorShocks: { storm_severity: 0, shipping_delay: 0 }, source: "synthetic" },
    { scenarioId: "storm_delay", label: "Minor storm logistics delay", probability: 0.1, baselineLossUsd: "8000", factorShocks: { storm_severity: 1, shipping_delay: 1 }, source: "synthetic" },
    { scenarioId: "storm_severe", label: "Severe storm warehouse outage", probability: 0.05, baselineLossUsd: "40000", factorShocks: { storm_severity: 3, shipping_delay: 3 }, source: "synthetic" }
  ];
  const exposures = [{
    exposureId: "exp_storm",
    category: "climate",
    label: "Coastal storm logistics interruption",
    description: "Lost retail sales and late delivery if warehouse/logistics shuts down",
    riskFactors: ["storm_severity", "shipping_delay"],
    horizonDays: 60,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: 0.5
  }];
  return {
    company: shell(request, "co_retail_demo", "Harbor Retail", exposures, scenarios),
    assumptions: [
      provenance("retail_demo", false),
      "Illustrative retailer; scenario losses and frequencies require user validation."
    ],
    warnings: [
      "Current amounts are not actuarially calibrated or derived from live market prices.",
      "confirmedByUser is false until this desk submits the profile on strategy generate."
    ]
  };
}
function digitalTemplate(request) {
  const companyId = stableId2("co", `${request.jurisdiction}|${request.description.toLowerCase()}`);
  const scenarios = [
    { scenarioId: "normal", label: "Normal API operations", probability: 0.84, baselineLossUsd: "0", factorShocks: { primary_outage: 0, fallback_spread: 0 }, source: "synthetic" },
    { scenarioId: "price_spike", label: "Token or API price spike", probability: 0.1, baselineLossUsd: "1800", factorShocks: { primary_outage: 0, fallback_spread: 1 }, source: "synthetic" },
    { scenarioId: "primary_down", label: "Primary provider outage", probability: 0.05, baselineLossUsd: "7000", factorShocks: { primary_outage: 1, fallback_spread: 1 }, source: "synthetic" },
    { scenarioId: "correlated_down", label: "Correlated provider failure", probability: 0.01, baselineLossUsd: "22000", factorShocks: { primary_outage: 1, fallback_spread: 2 }, source: "synthetic" }
  ];
  const exposures = [{
    exposureId: `exp_inference_${companyId.slice(-8)}`,
    category: "digital",
    label: "API or inference dependency",
    description: "Unhedged loss if the primary digital dependency fails or reprices.",
    riskFactors: ["primary_outage", "fallback_spread"],
    horizonDays: 30,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: 0.48
  }];
  return {
    company: shell(request, companyId, titleFrom(request.description, "Digital dependency"), exposures, scenarios),
    assumptions: [
      provenance("digital", false),
      "Loss levels are a digital-inference template, not the company ledger."
    ],
    warnings: [
      "Template scenarios only. Replace losses with the operator's figures before approval.",
      "confirmedByUser is false."
    ]
  };
}
function climateTemplate(request) {
  const companyId = stableId2("co", `${request.jurisdiction}|${request.description.toLowerCase()}`);
  const scenarios = [
    { scenarioId: "weather_normal", label: "No material weather shock", probability: 0.8, baselineLossUsd: "0", factorShocks: { storm_severity: 0, footfall: 0 }, source: "synthetic" },
    { scenarioId: "weather_disruption", label: "Weather disruption", probability: 0.15, baselineLossUsd: "5000", factorShocks: { storm_severity: 1, footfall: 1 }, source: "synthetic" },
    { scenarioId: "weather_severe", label: "Severe local weather closure", probability: 0.05, baselineLossUsd: "30000", factorShocks: { storm_severity: 3, footfall: 2 }, source: "synthetic" }
  ];
  const exposures = [{
    exposureId: `exp_climate_${companyId.slice(-8)}`,
    category: "climate",
    label: "Weather-sensitive revenue or logistics",
    description: "Sales, spoilage, or site closure if local weather is severe.",
    riskFactors: ["storm_severity", "footfall"],
    horizonDays: 60,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: 0.44
  }];
  return {
    company: shell(request, companyId, titleFrom(request.description, "Weather-sensitive business"), exposures, scenarios),
    assumptions: [
      provenance("climate", false),
      "Weather losses are a retail/climate template. They are not a forecast or an insurance quote."
    ],
    warnings: [
      "No station history was supplied. Confidence stays moderate.",
      "confirmedByUser is false."
    ]
  };
}
function supplyTemplate(request) {
  const companyId = stableId2("co", `${request.jurisdiction}|${request.description.toLowerCase()}`);
  const scenarios = [
    { scenarioId: "ship_normal", label: "Schedule holds", probability: 0.8, baselineLossUsd: "0", factorShocks: { port_delay: 0, freight_rate: 0 }, source: "synthetic" },
    { scenarioId: "ship_delay", label: "Multi-day port delay", probability: 0.15, baselineLossUsd: "6000", factorShocks: { port_delay: 1, freight_rate: 1 }, source: "synthetic" },
    { scenarioId: "ship_closed", label: "Lane closure or rolled bookings", probability: 0.05, baselineLossUsd: "28000", factorShocks: { port_delay: 3, freight_rate: 2 }, source: "synthetic" }
  ];
  const exposures = [{
    exposureId: `exp_shipping_${companyId.slice(-8)}`,
    category: "supply_chain",
    label: "Inbound freight delay",
    description: "Stockout and expedite cost if a lane, port, or booking rolls.",
    riskFactors: ["port_delay", "freight_rate"],
    horizonDays: 45,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: 0.42
  }];
  return {
    company: shell(request, companyId, titleFrom(request.description, "Shipping exposure"), exposures, scenarios),
    assumptions: [
      provenance("supply_chain", false),
      "Delay losses are a shipping template, not a carrier schedule or bill of lading."
    ],
    warnings: [
      "No lane, Incoterm, or inventory figure was supplied.",
      "confirmedByUser is false."
    ]
  };
}
function freeform(request, template) {
  const companyId = stableId2("co", `${template}|${request.jurisdiction}|${request.description.toLowerCase()}`);
  const thin = template === "thin";
  const scenarios = [
    { scenarioId: "base", label: thin ? "Placeholder base case" : "Base case", probability: 0.8, baselineLossUsd: "0", factorShocks: { demand_shock: 0, cost_shock: 0 }, source: "synthetic" },
    { scenarioId: "moderate", label: thin ? "Placeholder moderate shock" : "Moderate shock", probability: 0.15, baselineLossUsd: thin ? "1000" : "4000", factorShocks: { demand_shock: 1, cost_shock: 0 }, source: "synthetic" },
    { scenarioId: "severe", label: thin ? "Placeholder severe shock" : "Severe shock", probability: 0.05, baselineLossUsd: thin ? "5000" : "20000", factorShocks: { demand_shock: 1, cost_shock: 2 }, source: "synthetic" }
  ];
  const exposures = [{
    exposureId: `exp_general_${companyId.slice(-8)}`,
    category: "other",
    label: thin ? "Unclassified exposure" : "General operating exposure",
    description: thin ? "Not enough description to name a real exposure. Edit this before using it." : "Free-form operating loss. Map it to a concrete risk factor before hedging.",
    riskFactors: ["demand_shock", "cost_shock"],
    horizonDays: 30,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: thin ? 0.12 : 0.28
  }];
  return {
    company: shell(request, companyId, thin ? "Unclassified company" : titleFrom(request.description, "Unclassified company"), exposures, scenarios),
    assumptions: [
      provenance(template, false),
      thin ? "These numbers are placeholders so the form is editable. They are not an estimate." : "No industry template matched. Scenarios are a generic three-point sketch."
    ],
    warnings: thin ? THIN_WARNING : [
      "Free-form fallback. Confidence is low until the operator replaces the scenarios.",
      "Missing data: a named dependency, a unit of loss, and evidence for the shock probabilities.",
      "confirmedByUser is false."
    ]
  };
}
function analyzeCompany(request) {
  switch (classifyDescription(request.description)) {
    case "ai_demo":
      return aiDemo(request);
    case "retail_demo":
      return retailDemo(request);
    case "digital":
      return digitalTemplate(request);
    case "climate":
      return climateTemplate(request);
    case "supply_chain":
      return supplyTemplate(request);
    case "thin":
      return freeform(request, "thin");
    default:
      return freeform(request, "freeform");
  }
}

// services/strategy/src/hash.ts
import { createHash as createHash5 } from "node:crypto";
import { createRequire as createRequire3 } from "node:module";
var require4 = createRequire3(import.meta.url);
var canonicalize2 = require4("canonicalize");
function canonicalJson2(value) {
  const canonical = canonicalize2(value);
  if (typeof canonical !== "string") {
    throw new Error("RFC 8785 canonicalization failed");
  }
  return canonical;
}
function sha256Hex(value) {
  return createHash5("sha256").update(value).digest("hex");
}
function planHash(plan) {
  const body = {
    planId: plan.planId,
    companyId: plan.companyId,
    version: plan.version,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    budgetUsd: plan.budgetUsd,
    estimatedTotalCostUsd: plan.estimatedTotalCostUsd,
    before: plan.before,
    after: plan.after,
    legs: plan.legs,
    rationale: plan.rationale,
    warnings: plan.warnings,
    syntheticDemo: plan.syntheticDemo
  };
  return `sha256:${sha256Hex(canonicalJson2(body))}`;
}

// services/strategy/src/risk.ts
function cvar(losses, confidence) {
  const tail = new Decimal4(1).minus(confidence);
  if (tail.lte(0)) {
    throw new StrategyError(400, "INVALID_ALPHA", "CVaR confidence must be below 1.");
  }
  let remaining = tail;
  let accum = new Decimal4(0);
  const sorted = [...losses].sort((a, b) => {
    const byLoss = b.loss.comparedTo(a.loss) ?? 0;
    if (byLoss !== 0) return byLoss;
    return a.index - b.index;
  });
  for (const row of sorted) {
    const take = Decimal4.min(row.prob, remaining);
    accum = accum.plus(row.loss.times(take));
    remaining = remaining.minus(take);
    if (remaining.eq(0)) break;
  }
  if (!remaining.eq(0)) {
    throw new StrategyError(400, "INVALID_SCENARIOS", "Scenario probabilities do not cover the CVaR tail.");
  }
  return accum.div(tail);
}
function percentile(losses, alpha) {
  let cumulative = new Decimal4(0);
  const sorted = [...losses].sort((a, b) => {
    const byLoss = a.loss.comparedTo(b.loss) ?? 0;
    if (byLoss !== 0) return byLoss;
    return a.index - b.index;
  });
  for (const row of sorted) {
    cumulative = cumulative.plus(row.prob);
    if (cumulative.gte(alpha)) return row.loss;
  }
  throw new StrategyError(400, "INVALID_SCENARIOS", "Scenario probabilities do not reach the percentile.");
}
function expectedLoss(losses) {
  return losses.reduce((sum, row) => sum.plus(row.loss.times(row.prob)), new Decimal4(0));
}
function worstLoss(losses) {
  return losses.reduce((max, row) => row.loss.gt(max) ? row.loss : max, losses[0]?.loss ?? new Decimal4(0));
}
function toMetrics(losses, alpha) {
  return {
    expectedLossUsd: money2(expectedLoss(losses)),
    p95LossUsd: money2(percentile(losses, alpha)),
    cvar95LossUsd: money2(cvar(losses, alpha)),
    worstScenarioLossUsd: money2(worstLoss(losses))
  };
}
function probabilityWeights(scenarios) {
  if (scenarios.length === 0) {
    throw new StrategyError(400, "INVALID_SCENARIOS", "At least one scenario is required.");
  }
  const weights = scenarios.map((scenario) => {
    if (typeof scenario.probability !== "number" || !Number.isFinite(scenario.probability) || scenario.probability < 0 || scenario.probability > 1) {
      throw new StrategyError(400, "INVALID_SCENARIOS", `Scenario ${scenario.scenarioId} has an invalid probability.`);
    }
    return dec(scenario.probability);
  });
  const sum = weights.reduce((total, weight) => total.plus(weight), new Decimal4(0));
  const gap = new Decimal4(1).minus(sum);
  if (gap.abs().gt("0.001")) {
    throw new StrategyError(400, "INVALID_SCENARIOS", `Scenario probabilities sum to ${sum.toString()}, not 1.`);
  }
  if (!gap.eq(0)) {
    const last = weights.length - 1;
    weights[last] = weights[last].plus(gap);
  }
  return weights;
}
function stressWorstScenario(losses, alpha, shift = new Decimal4("0.02")) {
  const base = cvar(losses, alpha);
  if (losses.length < 2) return { base, stressed: base };
  let worst = 0;
  for (let i = 1; i < losses.length; i += 1) {
    if (losses[i].loss.gt(losses[worst].loss)) worst = i;
  }
  let donor = -1;
  for (let i = 0; i < losses.length; i += 1) {
    if (i === worst) continue;
    if (donor < 0 || losses[i].prob.gt(losses[donor].prob)) donor = i;
  }
  if (donor < 0) return { base, stressed: base };
  const amount = Decimal4.min(shift, losses[donor].prob);
  const stressed = losses.map((row, index) => {
    if (index === worst) return { ...row, prob: row.prob.plus(amount) };
    if (index === donor) return { ...row, prob: row.prob.minus(amount) };
    return row;
  });
  return { base, stressed: cvar(stressed, alpha) };
}
function repeatedShockFactors(scenarios) {
  const counts = /* @__PURE__ */ new Map();
  for (const scenario of scenarios) {
    for (const [factor, shock] of Object.entries(scenario.factorShocks)) {
      if (typeof shock === "number" && shock !== 0) {
        counts.set(factor, (counts.get(factor) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()].filter(([, count]) => count >= 2).map(([factor]) => factor).sort();
}

// services/strategy/src/optimizer.ts
var LOT_GRID = [0, 1, 2, 5, 10, 20, 25, 50];
var MAX_SEARCH_CANDIDATES = 5;
var MAX_QTY_PER_LEG = 100;
var PROXY_BASIS_SHORTFALL = new Decimal4("0.25");
var REPORTING_WARNING = "Reporting convention: published hedged loss adds estimatedTotalCostUsd on every scenario (same arithmetic as tests/validate_starter.py). The lot selector does not put that premium inside residual loss; premium is only the budget constraint. Proxy basis shortfall is 25% of contractual payoff and is already removed from payoffByScenarioUsd.";
var NO_ACTION_RATIONALE = "NO_ACTION: no eligible, unexpired, US-executable quote reduces tail loss inside the budget.";
function asRecord2(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StrategyError(400, "INVALID_REQUEST", message);
  }
  return value;
}
function requireString(source, field) {
  const value = source[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StrategyError(400, "INVALID_REQUEST", `${field} is required.`);
  }
  return value;
}
function isUsJurisdiction(value) {
  const jurisdiction = value.trim().toLowerCase();
  return jurisdiction === "us" || jurisdiction === "usa" || jurisdiction === "united states" || jurisdiction.startsWith("us-") || jurisdiction.startsWith("us ");
}
function normalizeIso(value, field) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new StrategyError(400, "INVALID_TIMESTAMP", `${field} is not a timestamp.`);
  }
  return new Date(parsed).toISOString().replace(/\.000Z$/, "Z");
}
function addHours(iso, hours) {
  const parsed = Date.parse(iso);
  return new Date(parsed + hours * 36e5).toISOString().replace(/\.000Z$/, "Z");
}
function companyText(company) {
  return [
    company.description,
    company.name,
    ...company.exposures.flatMap((exposure) => [exposure.category, exposure.label, exposure.description, ...exposure.riskFactors])
  ].join(" ").toLowerCase();
}
function quoteText(quote) {
  return [
    quote.instrument.name,
    quote.instrument.riskFactor,
    quote.instrument.eventRule,
    quote.basisRiskDescription,
    quote.eligibilityReason
  ].join(" ").toLowerCase();
}
var WEATHER = /\b(weather|storm|hurricane|rainfall|temperature|snow|wind|flood|climate)\b/;
var DIGITAL = /\b(cloud|uptime|outage|inference|api|compute|gpu|model|saas|server|digital)\b/;
function blocksWeatherOnDigital(quote, company) {
  const instrument = quoteText(quote);
  const business = companyText(company);
  return WEATHER.test(instrument) && DIGITAL.test(business) && !WEATHER.test(business);
}
function knownFactors(company) {
  const factors = /* @__PURE__ */ new Set();
  for (const exposure of company.exposures) {
    for (const factor of exposure.riskFactors) factors.add(factor);
  }
  for (const scenario of company.scenarios) {
    for (const factor of Object.keys(scenario.factorShocks)) factors.add(factor);
  }
  return factors;
}
function grossPayoffPerUnit(quote, scenario) {
  const shockRaw = scenario.factorShocks[quote.instrument.riskFactor];
  const shock = new Decimal4(typeof shockRaw === "number" && Number.isFinite(shockRaw) ? shockRaw.toString() : "0");
  if (shock.lte(0)) return new Decimal4(0);
  const perUnit = dec(quote.instrument.payoutPerUnitUsd);
  const cap = dec(quote.instrument.maximumPayoutUsd);
  if (quote.instrument.settlementType === "capped_call") {
    return Decimal4.min(perUnit.times(shock), cap);
  }
  return Decimal4.min(perUnit, cap);
}
function feeSum(quote) {
  const fees = quote.fees;
  return dec(fees.tradingFeeUsd).plus(fees.networkFeeUsd).plus(fees.conversionFeeUsd).plus(fees.modeledSlippageUsd).plus(fees.otherFeeUsd);
}
function unitAllIn(quote) {
  const requested = dec(quote.requestedQuantity);
  if (requested.gt(0)) return dec(quote.estimatedAllInBuyCostUsd).div(requested);
  return dec(quote.askUsd);
}
function lotsFor(maxQty) {
  const lots = /* @__PURE__ */ new Set([0]);
  for (const point of LOT_GRID) {
    if (point <= maxQty) lots.add(point);
  }
  if (maxQty > 0) lots.add(maxQty);
  return [...lots].sort((a, b) => a - b);
}
function quoteIsExecutableCapability(quote) {
  return quote.capability === "live" || quote.capability === "sandbox";
}
function eligibilityBlocked(reason) {
  return /reference only|ineligible|jurisdiction blocked|not permitted|cannot execute|not executable/i.test(reason);
}
function exclusionReason(quote, company, now) {
  if (quote.venue !== quote.instrument.venue) return "quote venue does not match instrument venue";
  if (!quoteIsExecutableCapability(quote)) return `capability ${quote.capability} is not executable`;
  if (quote.comparison === "not_comparable") return "comparison not_comparable is not executable";
  const quoteExpiry = Date.parse(quote.expiresAt);
  const instrumentExpiry = Date.parse(quote.instrument.expiresAt);
  if (Number.isNaN(quoteExpiry) || quoteExpiry <= now.getTime()) return "expired";
  if (!Number.isNaN(instrumentExpiry) && instrumentExpiry <= now.getTime()) return "instrument expired";
  if (isUsJurisdiction(company.jurisdiction) && (quote.venue === "polymarket_international" || quote.instrument.venue === "polymarket_international")) {
    return "polymarket_international is reference only for a US jurisdiction and cannot be bought";
  }
  if (eligibilityBlocked(quote.eligibilityReason)) return "source or venue is not eligible for this jurisdiction";
  if (blocksWeatherOnDigital(quote, company)) {
    return "weather or climate contract is not a direct hedge of digital uptime and is not executable";
  }
  if (!isMoneyString(quote.estimatedAllInBuyCostUsd) || !isMoneyString(quote.askUsd)) return "quote price is not a decimal string";
  const cost = unitAllIn(quote);
  if (cost.lte(0)) return "non-positive all-in cost";
  return null;
}
function effectiveComparison(quote, company) {
  if (quote.comparison === "proxy") return "proxy";
  const factor = quote.instrument.riskFactor;
  if (!knownFactors(company).has(factor)) return "proxy";
  return "direct";
}
function scaledFeeNote(quote, quantity) {
  const requested = dec(quote.requestedQuantity);
  if (requested.lte(0) || quantity === 0) return "0";
  return money2(feeSum(quote).times(quantity).div(requested));
}
function evaluate(problem, quantities) {
  const costParts = quantities.map((quantity, index) => problem.candidates[index].unitCost.times(quantity));
  const legCosts = costParts.map((cost2, index) => quantities[index] === 0 ? "0" : money2(cost2));
  const cost = legCosts.reduce((sum, part, index) => quantities[index] === 0 ? sum : sum.plus(dec(part)), new Decimal4(0));
  const residual = problem.baselineLoss.map((loss, index) => {
    let payoff = new Decimal4(0);
    problem.candidates.forEach((candidate, candidateIndex) => {
      payoff = payoff.plus(candidate.payoffPerUnit[index].times(quantities[candidateIndex] ?? 0));
    });
    return { loss: loss.minus(payoff), prob: problem.probabilities[index], index };
  });
  const published = residual.map((row) => ({ ...row, loss: row.loss.plus(cost) }));
  const metricsResidual = toMetrics(residual, problem.alpha);
  const metricsPublished = toMetrics(published, problem.alpha);
  return {
    cost,
    legCosts,
    residual,
    published,
    residualCvar: dec(metricsResidual.cvar95LossUsd),
    publishedCvar: dec(metricsPublished.cvar95LossUsd)
  };
}
function lexLess(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return false;
}
function better(mode, left, right, balancedCeiling) {
  if (mode === "min_cost") {
    if (!left.cost.eq(right.cost)) return left.cost.lt(right.cost);
    if (!left.residualCvar.eq(right.residualCvar)) return left.residualCvar.lt(right.residualCvar);
    return lexLess(left.quantities, right.quantities);
  }
  if (mode === "balanced") {
    const leftIn = balancedCeiling ? left.publishedCvar.lte(balancedCeiling) : true;
    const rightIn = balancedCeiling ? right.publishedCvar.lte(balancedCeiling) : true;
    if (leftIn !== rightIn) return leftIn;
    if (!left.cost.eq(right.cost)) return left.cost.lt(right.cost);
    if (!left.publishedCvar.eq(right.publishedCvar)) return left.publishedCvar.lt(right.publishedCvar);
    return lexLess(left.quantities, right.quantities);
  }
  if (!left.residualCvar.eq(right.residualCvar)) return left.residualCvar.lt(right.residualCvar);
  if (!left.publishedCvar.eq(right.publishedCvar)) return left.publishedCvar.lt(right.publishedCvar);
  if (!left.cost.eq(right.cost)) return left.cost.lt(right.cost);
  return lexLess(left.quantities, right.quantities);
}
function gridLotSolver(problem) {
  const scored = [];
  const chosen = new Array(problem.candidates.length).fill(0);
  const visit = (index) => {
    if (index === problem.candidates.length) {
      const outcome = evaluate(problem, chosen);
      if (outcome.cost.gt(problem.budget)) return;
      scored.push({
        quantities: [...chosen],
        cost: outcome.cost,
        residualCvar: outcome.residualCvar,
        publishedCvar: outcome.publishedCvar
      });
      return;
    }
    for (const quantity of problem.candidates[index].quantities) {
      chosen[index] = quantity;
      visit(index + 1);
    }
  };
  if (problem.candidates.length === 0) return [];
  visit(0);
  const zero = scored.find((row) => row.quantities.every((quantity) => quantity === 0));
  if (!zero) return problem.candidates.map(() => 0);
  const improving = scored.filter((row) => row.publishedCvar.lt(zero.publishedCvar) && row.quantities.some((quantity) => quantity > 0));
  if (improving.length === 0) return problem.candidates.map(() => 0);
  const bestPublished = improving.reduce((best, row) => row.publishedCvar.lt(best) ? row.publishedCvar : best, improving[0].publishedCvar);
  const reduction = zero.publishedCvar.minus(bestPublished);
  const ceiling = zero.publishedCvar.minus(reduction.times("0.5"));
  let winner = improving[0];
  for (const row of improving.slice(1)) {
    if (better(problem.mode, row, winner, ceiling)) winner = row;
  }
  return winner.quantities;
}
function quoteDemo(quote) {
  return quote.source === "synthetic" || quote.source === "sandbox" || quote.capability === "sandbox";
}
function offerDemo(offer) {
  return offer.capability === "sandbox" || offer.capability === "unsupported" || offer.capability === "read_only";
}
function validateCompany(company) {
  if (!company || typeof company !== "object") {
    throw new StrategyError(400, "INVALID_REQUEST", "company is required.");
  }
  if (!isMoneyString(company.monthlyHedgeBudgetUsd) || !isMoneyString(company.maxTolerableTailLossUsd)) {
    throw new StrategyError(400, "INVALID_MONEY", "Company money fields must be decimal strings.");
  }
  if (company.monthlyHedgeBudgetUsd.startsWith("-") || dec(company.monthlyHedgeBudgetUsd).lt(0)) {
    throw new StrategyError(400, "INFEASIBLE_BUDGET", "monthlyHedgeBudgetUsd cannot be negative.");
  }
  if (typeof company.cvarAlpha !== "number" || company.cvarAlpha < 0.5 || company.cvarAlpha > 0.999) {
    throw new StrategyError(400, "INVALID_ALPHA", "cvarAlpha must be between 0.5 and 0.999.");
  }
  if (!Array.isArray(company.scenarios) || company.scenarios.length === 0) {
    throw new StrategyError(400, "INVALID_SCENARIOS", "At least one scenario is required.");
  }
  const seen = /* @__PURE__ */ new Set();
  for (const scenario of company.scenarios) {
    if (!scenario?.scenarioId || seen.has(scenario.scenarioId)) {
      throw new StrategyError(400, "INVALID_SCENARIOS", "Scenario ids must be unique.");
    }
    seen.add(scenario.scenarioId);
    if (!isMoneyString(scenario.baselineLossUsd)) {
      throw new StrategyError(400, "INVALID_MONEY", `baselineLossUsd for ${scenario.scenarioId} must be a decimal string.`);
    }
    if (!scenario.factorShocks || typeof scenario.factorShocks !== "object") {
      throw new StrategyError(400, "INVALID_SCENARIOS", `factorShocks missing on ${scenario.scenarioId}.`);
    }
  }
  probabilityWeights(company.scenarios);
  return company;
}
function validateQuote(value) {
  const quote = value;
  if (!quote || typeof quote !== "object" || !quote.quoteId || !quote.instrument?.instrumentId) {
    throw new StrategyError(400, "INVALID_QUOTE", "Each quote needs an id and an instrument.");
  }
  return quote;
}
function validateGenerateRequest(body) {
  const source = asRecord2(body, "Expected a strategy request.");
  const allowed = /* @__PURE__ */ new Set(["company", "marketSearch", "mode"]);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) throw new StrategyError(400, "INVALID_REQUEST", `Unknown field ${key}.`);
  }
  const mode = source.mode;
  if (mode !== "min_cvar" && mode !== "min_cost" && mode !== "balanced") {
    throw new StrategyError(400, "INVALID_MODE", "mode must be min_cvar, min_cost, or balanced.");
  }
  const company = validateCompany(source.company);
  const market = asRecord2(source.marketSearch, "marketSearch is required.");
  if (market.companyId !== company.companyId) {
    throw new StrategyError(409, "COMPANY_MISMATCH", "marketSearch.companyId must match company.companyId.");
  }
  if (!Array.isArray(market.quotes) || !Array.isArray(market.capacityOffers) || typeof market.retrievedAt !== "string") {
    throw new StrategyError(400, "INVALID_REQUEST", "marketSearch is missing quotes, capacity offers, or retrievedAt.");
  }
  return {
    company,
    marketSearch: {
      companyId: requireString(market, "companyId"),
      quotes: market.quotes.map((quote) => validateQuote(quote)),
      capacityOffers: market.capacityOffers,
      retrievedAt: requireString(market, "retrievedAt"),
      warnings: Array.isArray(market.warnings) ? market.warnings.map(String) : []
    },
    mode
  };
}
function basisText2(quote, comparison, fraction) {
  const venueNote = quote.basisRiskDescription?.trim() || "No venue basis note was supplied.";
  if (comparison === "proxy") {
    return `${venueNote} Settlement mismatch: this quote is a proxy, not a direct hedge. ${money2(fraction.times(100))}% of contractual payoff is basis shortfall and is removed from modeled payoff.`;
  }
  return `${venueNote} Comparison is direct on risk factor ${quote.instrument.riskFactor}. Basis shortfall fraction is 0.`;
}
function preselect(prepared, problemWithoutMode, budget) {
  if (prepared.length <= MAX_SEARCH_CANDIDATES) return prepared;
  const ranked = prepared.map((candidate) => {
    let best = new Decimal4("1e30");
    for (const quantity of candidate.quantities) {
      if (quantity === 0) continue;
      const solo = evaluate(
        { ...problemWithoutMode, mode: "min_cvar", candidates: [candidate] },
        [quantity]
      );
      if (solo.cost.lte(budget) && solo.publishedCvar.lt(best)) best = solo.publishedCvar;
    }
    return { candidate, best };
  });
  ranked.sort((left, right) => {
    const byScore = left.best.comparedTo(right.best) ?? 0;
    if (byScore !== 0) return byScore;
    return left.candidate.quote.quoteId.localeCompare(right.candidate.quote.quoteId);
  });
  return ranked.slice(0, MAX_SEARCH_CANDIDATES).map((row) => row.candidate).sort((left, right) => left.quote.quoteId.localeCompare(right.quote.quoteId));
}
function generatePlan(request, now, solver = gridLotSolver) {
  const company = validateCompany(request.company);
  if (request.marketSearch.companyId !== company.companyId) {
    throw new StrategyError(409, "COMPANY_MISMATCH", "marketSearch.companyId must match company.companyId.");
  }
  const alpha = dec(company.cvarAlpha);
  const budget = dec(company.monthlyHedgeBudgetUsd);
  const probabilities = probabilityWeights(company.scenarios);
  const baselineLoss = company.scenarios.map((scenario) => dec(scenario.baselineLossUsd));
  const exclusions = [];
  const downgrades = [];
  const prepared = [];
  const quotes = [...request.marketSearch.quotes].sort((left, right) => left.quoteId.localeCompare(right.quoteId));
  for (const quote of quotes) {
    const reason = exclusionReason(quote, company, now);
    if (reason) {
      exclusions.push({ quoteId: quote.quoteId, reason });
      continue;
    }
    const comparison = effectiveComparison(quote, company);
    if (quote.comparison === "direct" && comparison === "proxy") {
      downgrades.push(`Quote ${quote.quoteId} claimed a direct hedge, but ${quote.instrument.riskFactor} is not a company risk factor. Treated as proxy.`);
    }
    const fraction = comparison === "proxy" ? PROXY_BASIS_SHORTFALL : new Decimal4(0);
    const payoffPerUnit = company.scenarios.map((scenario) => grossPayoffPerUnit(quote, scenario).times(new Decimal4(1).minus(fraction)));
    const unitCost = unitAllIn(quote);
    const quotedSize = dec(quote.requestedQuantity).floor();
    const affordable = Decimal4.min(
      dec(quote.availableQuantity).floor(),
      quotedSize.gt(0) ? quotedSize : new Decimal4(0),
      unitCost.gt(0) ? budget.div(unitCost).floor() : new Decimal4(0),
      new Decimal4(MAX_QTY_PER_LEG)
    );
    const maxQty = Math.max(0, affordable.toNumber());
    const quantities2 = lotsFor(maxQty);
    if (maxQty === 0) {
      exclusions.push({ quoteId: quote.quoteId, reason: "no whole lot fits inside the budget and available quantity" });
      continue;
    }
    if (!payoffPerUnit.some((payoff) => payoff.gt(0))) {
      exclusions.push({ quoteId: quote.quoteId, reason: "no scenario payoff on company risk factors" });
      continue;
    }
    prepared.push({
      id: quote.quoteId,
      quote,
      unitCost,
      quantities: quantities2,
      payoffPerUnit,
      basisFraction: fraction,
      effectiveComparison: comparison
    });
  }
  const kept = preselect(prepared, {
    budget,
    alpha,
    baselineLoss,
    probabilities,
    candidates: prepared
  }, budget);
  const dropped = prepared.filter((candidate) => !kept.includes(candidate));
  const problem = {
    mode: request.mode,
    budget,
    alpha,
    baselineLoss,
    probabilities,
    candidates: kept
  };
  const quantities = kept.length === 0 ? [] : solver(problem);
  const selected = kept.flatMap((candidate, index) => {
    const quantity = quantities[index] ?? 0;
    return quantity > 0 ? [{ candidate, quantity }] : [];
  });
  const createdAt = normalizeIso(request.marketSearch.retrievedAt, "retrievedAt");
  const totalCost = selected.reduce((sum, row) => sum.plus(dec(money2(row.candidate.unitCost.times(row.quantity)))), new Decimal4(0));
  const payoffByScenario = company.scenarios.map((scenario, scenarioIndex) => {
    const payoff = selected.reduce((sum, row) => sum.plus(row.candidate.payoffPerUnit[scenarioIndex].times(row.quantity)), new Decimal4(0));
    return money2(payoff);
  });
  const beforeLosses = baselineLoss.map((loss, index) => ({ loss, prob: probabilities[index], index }));
  const afterLosses = beforeLosses.map((row, index) => ({
    ...row,
    loss: row.loss.plus(totalCost).minus(dec(payoffByScenario[index] ?? "0"))
  }));
  const before = toMetrics(beforeLosses, alpha);
  const after = toMetrics(afterLosses, alpha);
  const legs = selected.map((row, index) => {
    const payoffByScenarioUsd = {};
    company.scenarios.forEach((scenario, scenarioIndex) => {
      payoffByScenarioUsd[scenario.scenarioId] = money2(row.candidate.payoffPerUnit[scenarioIndex].times(row.quantity));
    });
    return {
      legId: `leg_${index + 1}_${row.candidate.quote.quoteId}`,
      kind: "financial",
      quoteId: row.candidate.quote.quoteId,
      instrumentId: row.candidate.quote.instrument.instrumentId,
      venue: row.candidate.quote.venue,
      quantity: String(row.quantity),
      estimatedAllInCostUsd: money2(row.candidate.unitCost.times(row.quantity)),
      maxAdditionalObligationUsd: "0",
      payoffByScenarioUsd,
      basisRisk: basisText2(row.candidate.quote, row.candidate.effectiveComparison, row.candidate.basisFraction)
    };
  });
  const warnings = [REPORTING_WARNING];
  if (request.marketSearch.warnings.length > 0) {
    warnings.push(...request.marketSearch.warnings.map((warning) => `Market search: ${warning}`));
  }
  for (const exclusion of exclusions) warnings.push(`Excluded ${exclusion.quoteId}: ${exclusion.reason}.`);
  warnings.push(...downgrades);
  if (dropped.length > 0) {
    warnings.push(`Lot search kept ${MAX_SEARCH_CANDIDATES} of ${prepared.length} candidates by standalone CVaR. A MILP solver can replace gridLotSolver without changing the published metric convention.`);
  }
  const factors = repeatedShockFactors(company.scenarios);
  if (factors.length > 0) {
    warnings.push(`Correlated factor shocks across scenarios: ${factors.join(", ")}.`);
  }
  if (selected.length > 0) {
    const stressed = stressWorstScenario(afterLosses, alpha);
    warnings.push(`Stress: moving 0.02 probability onto the worst hedged scenario changes published CVaR from ${money2(stressed.base)} to ${money2(stressed.stressed)}.`);
  }
  const capacityNotes = request.marketSearch.capacityOffers.map((offer) => {
    const verified = offer.verifiedCapacity ? "verified flag is true but this service does not monetize capacity without a payoff schedule" : "unverified, so operational benefit is not counted as payoff";
    return `Capacity offer ${offer.offerId} (${offer.providerName}) excluded from legs: ${verified}.`;
  });
  warnings.push(...capacityNotes);
  if (selected.some((row) => row.candidate.effectiveComparison === "proxy")) {
    warnings.push("At least one bought leg is a proxy. Settlement mismatch is in that leg basisRisk. Do not read the premium as elimination of the business loss.");
  }
  if (legs.length === 0) {
    warnings.push("No eligible hedge reduced published tail loss inside the budget.");
  }
  const syntheticDemo = selected.some((row) => quoteDemo(row.candidate.quote)) || selected.length === 0 && request.marketSearch.quotes.some((quote) => quoteDemo(quote)) && !request.marketSearch.quotes.some((quote) => quote.source === "live" && quote.capability === "live") || request.marketSearch.capacityOffers.some((offer) => selected.length === 0 && offerDemo(offer) && request.marketSearch.quotes.length === 0);
  if (syntheticDemo) {
    warnings.push("Synthetic or sandbox market data is in this decision. This is not a live venue quote and not a guaranteed risk reduction.");
  }
  const feeNotes = selected.map((row) => `${row.candidate.quote.quoteId} fees ${scaledFeeNote(row.candidate.quote, row.quantity)} USD (already inside all-in premium, not added again)`);
  const bought = legs.length === 0 ? NO_ACTION_RATIONALE : `Bought ${legs.map((leg) => `${leg.quantity} of ${leg.quoteId} on ${leg.venue}`).join("; ")}.`;
  const rationale = [
    `Mode ${request.mode}.`,
    "Selector residual = baseline loss \u2212 net hedge payoff. Premium is a budget constraint only.",
    "Published before/after uses baseline and baseline + estimatedTotalCostUsd \u2212 payoff.",
    `Lot grid ${LOT_GRID.join(",")} plus the budget-capped maximum, at most ${MAX_QTY_PER_LEG} units and ${MAX_SEARCH_CANDIDATES} candidates.`,
    bought,
    feeNotes.length > 0 ? feeNotes.join(". ") + "." : "No premium paid."
  ].join(" ");
  const expiresAt = selected.length > 0 ? selected.map((row) => normalizeIso(row.candidate.quote.expiresAt, row.candidate.quote.quoteId)).sort()[0] : addHours(createdAt, 24);
  const planId = `plan_${sha256Hex(canonicalJson2({
    companyId: company.companyId,
    mode: request.mode,
    budgetUsd: money2(budget),
    createdAt,
    expiresAt,
    legs: legs.map((leg) => ({
      quoteId: leg.quoteId,
      quantity: leg.quantity,
      cost: leg.estimatedAllInCostUsd,
      payoffByScenarioUsd: leg.payoffByScenarioUsd
    })),
    before,
    after
  })).slice(0, 24)}`;
  const draft = {
    planId,
    companyId: company.companyId,
    version: 1,
    status: "QUOTED",
    createdAt,
    expiresAt,
    planHash: "",
    budgetUsd: money2(budget),
    estimatedTotalCostUsd: money2(totalCost),
    before,
    after,
    legs,
    rationale,
    warnings,
    syntheticDemo
  };
  draft.planHash = planHash(draft);
  return draft;
}

// services/strategy/src/store.ts
function createStore() {
  return {
    companies: /* @__PURE__ */ new Map(),
    plans: /* @__PURE__ */ new Map(),
    idempotency: /* @__PURE__ */ new Map()
  };
}

// services/strategy/src/app.ts
var SERVICE = "strategy";
var VERSION = "1.0.0";
function headerValue2(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}
function apiError2(reply, status, code, message, correlationId2, details) {
  return reply.code(status).send({
    code,
    message,
    correlationId: correlationId2,
    retryable: status >= 500,
    ...details ? { details } : {}
  });
}
function readPayload(payload) {
  const text2 = typeof payload === "string" ? payload : Buffer.isBuffer(payload) ? payload.toString("utf8") : null;
  if (text2 === null) return payload;
  try {
    return JSON.parse(text2);
  } catch {
    return text2;
  }
}
function buildApp3(options = {}) {
  const store = options.store ?? createStore();
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const bearer = options.bearer ?? process.env.SWITCHBOARD_DEV_BEARER ?? "switchboard-dev-platform-token";
  const app = Fastify3({ logger: false });
  app.decorateRequest("correlationId", "");
  app.decorateRequest("idemReady", null);
  app.addHook("onRequest", async (request, reply) => {
    const requestId = headerValue2(request.headers["x-request-id"]) || randomUUID8();
    const correlationId2 = headerValue2(request.headers["x-correlation-id"]) || requestId;
    request.correlationId = correlationId2;
    reply.header("x-request-id", requestId);
    reply.header("x-correlation-id", correlationId2);
    const path3 = request.url.split("?")[0];
    if (path3 === "/healthz") return;
    const authorization = headerValue2(request.headers.authorization);
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match || match[1] !== bearer) {
      return apiError2(
        reply,
        401,
        "UNAUTHORIZED",
        "Bearer token is missing or does not match SWITCHBOARD_DEV_BEARER. This local dev token is not production auth.",
        correlationId2
      );
    }
  });
  app.addHook("preHandler", async (request, reply) => {
    if (request.method !== "POST") return;
    if (reply.sent) return;
    const key = headerValue2(request.headers["idempotency-key"])?.trim();
    if (!key) {
      return apiError2(reply, 400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key is required on POST.", request.correlationId);
    }
    const bodyHash = createHash6("sha256").update(canonicalJson2(request.body ?? null)).digest("hex");
    const existing = store.idempotency.get(key);
    if (existing && existing.bodyHash !== bodyHash) {
      return apiError2(reply, 409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was reused with a different request body.", request.correlationId);
    }
    if (existing) {
      return reply.code(existing.status).send(existing.body);
    }
    request.idemReady = { key, bodyHash };
  });
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.method !== "POST" || !request.idemReady || reply.statusCode === 401) return payload;
    store.idempotency.set(request.idemReady.key, {
      bodyHash: request.idemReady.bodyHash,
      status: reply.statusCode,
      body: readPayload(payload)
    });
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    const correlationId2 = request.correlationId || request.id;
    if (error instanceof StrategyError) {
      return apiError2(reply, error.status, error.code, error.message, correlationId2, error.details);
    }
    const statusCode = typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Invalid request.";
    if (statusCode >= 500) {
      return apiError2(reply, 500, "INTERNAL", "Strategy service failed.", correlationId2);
    }
    return apiError2(reply, statusCode, "INVALID_REQUEST", message, correlationId2);
  });
  app.get("/healthz", async () => ({ status: "ok", service: SERVICE, version: VERSION }));
  app.post("/v1/companies/analyze", async (request) => {
    const analysis = analyzeCompany(validateAnalyzeRequest(request.body));
    store.companies.set(analysis.company.companyId, analysis);
    return analysis;
  });
  app.get("/v1/companies/:companyId", async (request, reply) => {
    const { companyId } = request.params;
    const found = store.companies.get(companyId);
    if (!found) return apiError2(reply, 404, "NOT_FOUND", `No company ${companyId}.`, request.correlationId);
    return found;
  });
  app.post("/v1/strategies/generate", async (request) => {
    const generateRequest = validateGenerateRequest(request.body);
    const plan = generatePlan(generateRequest, now());
    store.plans.set(plan.planId, plan);
    if (generateRequest.company.confirmedByUser) {
      const previous = store.companies.get(generateRequest.company.companyId);
      store.companies.set(generateRequest.company.companyId, {
        company: generateRequest.company,
        assumptions: previous?.assumptions ?? ["Provenance: profile supplied on strategy generate; confirmedByUser=true."],
        warnings: previous?.warnings ?? []
      });
    }
    return plan;
  });
  app.get("/v1/strategies/:planId", async (request, reply) => {
    const { planId } = request.params;
    const found = store.plans.get(planId);
    if (!found) return apiError2(reply, 404, "NOT_FOUND", `No plan ${planId}.`, request.correlationId);
    return found;
  });
  return app;
}

// demo/app.ts
if (Number(process.env.QUOTE_TTL_SECONDS ?? "0") < 900) {
  process.env.QUOTE_TTL_SECONDS = "900";
}
if (!process.env.KALSHI_ENABLED) process.env.KALSHI_ENABLED = "true";
if (!process.env.KALSHI_TIMEOUT_MS) process.env.KALSHI_TIMEOUT_MS = "4000";
if (!(process.env.AP4M_TEAM_NAME ?? "").trim() && !(process.env.TEAM_NAME ?? "").trim()) {
  process.env.AP4M_TEAM_NAME = "Penn1";
}
var BEARER = process.env.SWITCHBOARD_DEV_BEARER?.trim() || "switchboard-dev-platform-token";
var PRIMARY = "https://primary.invalid/infer";
var FALLBACK = "https://fallback.invalid/infer";
var PLAN_MODES = ["min_cvar", "min_cost", "balanced"];
var SAMPLE_INTAKE = {
  description: "Northline runs customer-support on one primary model API. A fifteen-minute outage takes the product offline.",
  jurisdiction: "US",
  monthlyHedgeBudgetUsd: "800",
  maxTolerableTailLossUsd: "8000"
};
var REQUESTED_QUANTITY = "10";
var listened = /* @__PURE__ */ new WeakMap();
async function listenPort(target2) {
  const existing = listened.get(target2);
  if (existing) return existing;
  await target2.listen({ port: 0, host: "127.0.0.1" });
  const address = target2.server.address();
  if (!address || typeof address === "string") throw new Error("In-process service did not bind a port.");
  listened.set(target2, address.port);
  return address.port;
}
function injectFetch(target2) {
  return async (input, init) => {
    const port = await listenPort(target2);
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://127.0.0.1");
    const headers = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const method = init?.method ?? "GET";
    const payload = init?.body === void 0 || init?.body === null ? void 0 : String(init.body);
    return await new Promise((resolve, reject) => {
      const req = httpRequest({
        hostname: "127.0.0.1",
        port,
        path: `${url.pathname}${url.search}`,
        method,
        headers
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const out = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value === void 0) continue;
            out.set(key, Array.isArray(value) ? value.join(", ") : String(value));
          }
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 500, headers: out }));
        });
      });
      req.on("error", reject);
      if (payload !== void 0) req.write(payload);
      req.end();
    });
  };
}
async function call(app, method, path3, body, extra) {
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${BEARER}`,
    ...extra
  };
  if (method === "POST") {
    headers["content-type"] = "application/json";
    headers["idempotency-key"] = headers["idempotency-key"] ?? randomUUID9();
  }
  const response = await injectFetch(app)(`http://in-process.local${path3}`, {
    method,
    headers,
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  const text2 = await response.text();
  let parsed = null;
  if (text2) {
    try {
      parsed = JSON.parse(text2);
    } catch {
      parsed = { message: text2.slice(0, 400) };
    }
  }
  return { status: response.status, body: parsed };
}
function detailOf(body, fallback) {
  if (body && typeof body === "object") {
    const record = body;
    if (typeof record.message === "string") return record.message;
    if (typeof record.code === "string") return record.code;
    if (typeof record.status === "string") return record.status;
    if (typeof record.planId === "string") return record.planId;
    if (typeof record.companyId === "string") return record.companyId;
  }
  return fallback;
}
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function invocationEnv() {
  if (process.env.AP4M_ALLOW_PUBLIC_PAY === "true") return process.env;
  const blocked = { ...process.env, AP4M_MODE: "mock" };
  delete blocked.AP4M_AGENT_PRIVATE_KEY;
  delete blocked.AGENT_PRIVATE_KEY;
  return blocked;
}
async function createDemoApp() {
  const ledgerSettings = ledgerConfig(process.env);
  const ledger = ledgerSettings ? new LedgerApprover(ledgerSettings) : null;
  const strategy = buildApp3();
  const markets = await buildApp2({ kalshiEnabled: process.env.KALSHI_ENABLED !== "false" });
  const execution = await buildApp({
    fetchImpl: injectFetch(markets),
    config: void 0,
    // Execution accepts ledger_dmk_verified only from this gateway, and only after the gateway has
    // verified the device signature itself. Without the emulator configured, it stays off.
    env: { ...process.env, LEDGER_DMK_VERIFIED: ledger ? "true" : "false" }
  });
  await strategy.ready();
  await markets.ready();
  await execution.ready();
  const gateway2 = Fastify4({ logger: false });
  gateway2.get("/healthz", async () => ({ status: "ok", service: "switchboard-demo" }));
  gateway2.get("/demo/network", async () => readNetwork(process.env));
  gateway2.get("/demo/clear-sign", async () => ({
    previews: SAMPLE_XRPL_TRANSACTIONS.map((tx) => previewXrplTransaction(tx))
  }));
  gateway2.get("/demo/sponsors", async () => sponsorStatus(process.env));
  gateway2.get("/demo/ledger/status", async () => ledger ? ledger.status() : {
    enabled: false,
    reachable: false,
    emulator: false,
    model: null,
    address: null,
    note: "Ledger approval is not configured on this deploy. Plans are approved in the app."
  });
  gateway2.get("/demo/ledger/screen", async (_request, reply) => {
    if (!ledger) return reply.code(404).send({ message: "Ledger approval is not configured." });
    try {
      const response = await ledger.screenshot();
      if (!response.ok) return reply.code(502).send({ message: "The emulator did not return its screen." });
      return reply.type("image/png").header("cache-control", "no-store").send(Buffer.from(await response.arrayBuffer()));
    } catch {
      return reply.code(502).send({ message: "The emulator did not answer." });
    }
  });
  gateway2.post("/demo/ledger/finger", async (request, reply) => {
    if (!ledger) return reply.code(404).send({ message: "Ledger approval is not configured." });
    const body = isRecord6(request.body) ? request.body : {};
    const action = body.action;
    const x = Number(body.x);
    const y = Number(body.y);
    if (action !== "press" && action !== "release" || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 2e3 || y > 2e3) {
      return reply.code(400).send({ message: "Send action press or release, with integer x and y." });
    }
    await ledger.finger(action, x, y).catch(() => void 0);
    return { ok: true };
  });
  if (awsAgentCoreEnabled(process.env)) {
    gateway2.get("/ping", async () => ({
      status: "Healthy",
      deployed: false,
      note: "Local AgentCore HTTP contract on this process. This is not an AWS runtime."
    }));
    gateway2.post("/invocations", async (request, reply) => {
      const resourceUrl = isRecord6(request.body) && typeof request.body.resourceUrl === "string" ? request.body.resourceUrl : void 0;
      if (resourceUrl) {
        let parsed;
        try {
          parsed = new URL(resourceUrl);
        } catch {
          return reply.code(400).send({
            protocol: "agentcore-http",
            pay: false,
            awsDeployed: false,
            reason: "resourceUrl must be an https URL."
          });
        }
        if (parsed.protocol !== "https:") {
          return reply.code(400).send({
            protocol: "agentcore-http",
            pay: false,
            awsDeployed: false,
            reason: "resourceUrl must use https."
          });
        }
      }
      return handleInvocation(request.body, invocationEnv());
    });
  }
  gateway2.post("/demo/proof", async (request, reply) => {
    const confirmed = isRecord6(request.body) && request.body.confirm === true;
    if (!confirmed) {
      return reply.code(400).send({
        ok: false,
        message: 'Send { "confirm": true }. That click is the human approval for this sandbox run. It is not a Ledger signature.'
      });
    }
    const proof = await runProof(strategy, markets, execution);
    return reply.code(proof.ok ? 200 : 409).send(proof);
  });
  gateway2.post("/demo/analyze", async (request, reply) => {
    if (!isRecord6(request.body)) {
      return reply.code(400).send({ message: "Send a JSON object with description, jurisdiction, monthlyHedgeBudgetUsd, and maxTolerableTailLossUsd." });
    }
    const { description, jurisdiction, monthlyHedgeBudgetUsd, maxTolerableTailLossUsd } = request.body;
    const analyzed = await call(strategy, "POST", "/v1/companies/analyze", {
      description,
      jurisdiction,
      monthlyHedgeBudgetUsd,
      maxTolerableTailLossUsd
    });
    const templateCompany = isRecord6(analyzed.body) && isRecord6(analyzed.body.company) ? analyzed.body.company : null;
    const isBuiltInDemo = templateCompany?.companyId === "co_demo_ai" || templateCompany?.companyId === "co_retail_demo";
    if (analyzed.status === 200 && !isBuiltInDemo && discoveryEnabled(process.env)) {
      const discovered = await discoverRisks({
        description: String(description),
        jurisdiction: String(jurisdiction),
        budget: String(monthlyHedgeBudgetUsd),
        tail: String(maxTolerableTailLossUsd)
      });
      if (discovered) {
        return { ...discovered.analysis, discovery: { insights: discovered.insights, markets: discovered.markets } };
      }
    }
    return reply.code(analyzed.status).send(analyzed.body);
  });
  gateway2.post("/demo/quote", async (request, reply) => {
    const input = readPlanInput(request.body);
    if (typeof input === "string") return reply.code(400).send({ message: input });
    const extra = await liveQuotes(isRecord6(request.body) ? request.body.liveMarkets : void 0, REQUESTED_QUANTITY);
    const quoted = await quoteAndPlan(strategy, markets, input.company, input.mode, [], extra);
    if (!quoted.ok) return reply.code(quoted.status >= 400 ? quoted.status : 502).send({ message: quoted.message });
    return { search: quoted.search, plan: quoted.plan, books: quoted.books };
  });
  gateway2.post("/demo/execute", async (request, reply) => {
    if (!isRecord6(request.body) || request.body.confirm !== true) {
      return reply.code(400).send({ message: "Send confirm: true. That click is the in-app approval for this sandbox run. It is not a Ledger signature." });
    }
    const input = readPlanInput(request.body);
    if (typeof input === "string") return reply.code(400).send({ message: input });
    const reviewed = request.body.reviewedPlan;
    if (!isRecord6(reviewed) || !Array.isArray(reviewed.legs) || typeof reviewed.estimatedTotalCostUsd !== "string") {
      return reply.code(400).send({ message: "Send the reviewedPlan you approved." });
    }
    const approval = request.body.approval === "ledger" ? "ledger" : "app";
    if (approval === "ledger" && !ledger) {
      return reply.code(400).send({ message: "Ledger approval is not configured on this deploy. Approve in the app instead." });
    }
    const steps = [];
    const extra = await liveQuotes(request.body.liveMarkets, REQUESTED_QUANTITY);
    const quoted = await quoteAndPlan(strategy, markets, input.company, input.mode, steps, extra);
    if (!quoted.ok) return reply.code(quoted.status >= 400 ? quoted.status : 502).send({ message: quoted.message, steps });
    if (!sameTerms(reviewed, quoted.plan)) {
      return reply.code(409).send({
        requote: true,
        message: "The market moved since you reviewed it. Nothing was ordered. Check the new plan and approve again.",
        search: quoted.search,
        plan: quoted.plan,
        books: quoted.books
      });
    }
    const legs = Array.isArray(quoted.plan.legs) ? quoted.plan.legs : [];
    let ledgerApproval = null;
    const reviewedHash = typeof reviewed.planHash === "string" ? reviewed.planHash : "";
    if (approval === "ledger" && legs.length > 0 && ledger) {
      if (!/^sha256:[0-9a-f]{64}$/.test(reviewedHash)) {
        return reply.code(400).send({ message: "The reviewed plan has no valid hash to sign. Nothing was ordered." });
      }
      try {
        ledgerApproval = await ledger.approve(reviewedHash);
        steps.push({ name: "ledger", status: 200, detail: ledgerApproval.txHash });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The Ledger approval failed.";
        steps.push({ name: "ledger", status: 409, detail: message });
        return reply.code(409).send({ ok: false, steps, plan: quoted.plan, note: `${message} Nothing was ordered.`, syntheticDemo: true });
      }
    }
    const network = await readNetwork(process.env);
    const outcome = await executePlan(execution, quoted.plan, steps, ledgerApproval ? { method: "ledger_dmk_verified", signedIntent: `dmk:${reviewedHash}`, deviceProofId: ledgerApproval.txHash } : void 0);
    return reply.code(outcome.ok ? 200 : 409).send({
      ...outcome,
      steps,
      plan: quoted.plan,
      network,
      ledger: ledgerApproval ? { ...ledgerApproval, signedPlanHash: reviewedHash } : null,
      syntheticDemo: true
    });
  });
  gateway2.get("/", async (_request, reply) => {
    const previews = SAMPLE_XRPL_TRANSACTIONS.map((tx) => previewXrplTransaction(tx));
    return reply.type("text/html; charset=utf-8").send(renderPage(previews));
  });
  return gateway2;
}
function readPlanInput(body) {
  if (!isRecord6(body) || !isRecord6(body.company)) return "Send the confirmed company profile from step 1.";
  const mode = body.mode;
  if (typeof mode !== "string" || !PLAN_MODES.includes(mode)) return "mode must be min_cvar, min_cost, or balanced.";
  return { company: body.company, mode };
}
function legTerms(plan) {
  const legs = Array.isArray(plan.legs) ? plan.legs.filter(isRecord6) : [];
  return legs.map((leg) => [leg.kind, leg.venue, leg.instrumentId ?? leg.capacityOfferId ?? "", leg.quantity].map((part) => String(part ?? "")).join("|")).sort();
}
function sameTerms(reviewed, fresh) {
  const before = legTerms(reviewed);
  const after = legTerms(fresh);
  if (before.length !== after.length || before.some((terms, index) => terms !== after[index])) return false;
  try {
    return new Decimal5(String(fresh.estimatedTotalCostUsd)).lte(new Decimal5(String(reviewed.estimatedTotalCostUsd)));
  } catch {
    return false;
  }
}
async function readBooks(markets) {
  const listed = await call(markets, "GET", "/v1/exchange/instruments");
  if (listed.status !== 200 || !isRecord6(listed.body) || !Array.isArray(listed.body.instruments)) return [];
  const books = [];
  for (const instrument of listed.body.instruments.filter(isRecord6)) {
    if (typeof instrument.instrumentId !== "string") continue;
    const book = await call(markets, "GET", `/v1/exchange/orderbook/${encodeURIComponent(instrument.instrumentId)}`);
    if (book.status !== 200 || !isRecord6(book.body)) continue;
    books.push({
      instrumentId: instrument.instrumentId,
      name: typeof instrument.name === "string" ? instrument.name : instrument.instrumentId,
      settlementType: instrument.settlementType,
      bids: book.body.bids,
      asks: book.body.asks,
      mode: book.body.mode
    });
  }
  return books;
}
async function quoteAndPlan(strategy, markets, company, mode, steps, extraQuotes = []) {
  const exposureIds = Array.isArray(company.exposures) ? company.exposures.map((exposure) => isRecord6(exposure) && typeof exposure.exposureId === "string" ? exposure.exposureId : "").filter(Boolean) : [];
  const search = await call(markets, "POST", "/v1/markets/search", {
    companyId: company.companyId,
    exposureIds,
    requestedQuantity: REQUESTED_QUANTITY,
    jurisdiction: typeof company.jurisdiction === "string" ? company.jurisdiction : "US",
    includeReferenceMarkets: true
  });
  steps.push({ name: "search", status: search.status, detail: detailOf(search.body, "search") });
  if (search.status !== 200) {
    return { ok: false, stage: "search", status: search.status, message: messageOf(search.body, "Market search failed. No plan was created.") };
  }
  if (extraQuotes.length > 0 && isRecord6(search.body) && Array.isArray(search.body.quotes)) {
    search.body.quotes = [...extraQuotes, ...search.body.quotes];
  }
  const generated = await call(strategy, "POST", "/v1/strategies/generate", {
    company,
    marketSearch: search.body,
    mode
  });
  steps.push({ name: "plan", status: generated.status, detail: detailOf(generated.body, "plan") });
  if (generated.status !== 200 || !isRecord6(generated.body) || typeof generated.body.planHash !== "string") {
    return {
      ok: false,
      stage: "plan",
      status: generated.status,
      search: search.body,
      message: messageOf(generated.body, "Strategy did not return a plan. No order was submitted.")
    };
  }
  return { ok: true, search: search.body, plan: generated.body, books: await readBooks(markets) };
}
async function executePlan(execution, plan, steps, approval = { method: "app_manual", signedIntent: `app_manual:${String(plan.planHash)}` }) {
  const outcome = { ok: false, note: "", approval: null, run: null, failover: null };
  const legs = Array.isArray(plan.legs) ? plan.legs.filter(isRecord6) : [];
  if (legs.length === 0) {
    steps.push({ name: "orders", status: 200, detail: "No-trade plan. Nothing to approve." });
    return { ...outcome, ok: true, note: "The optimizer returned a no-trade plan. That is a valid result. No order was submitted." };
  }
  const venues = [...new Set(legs.map((leg) => leg.venue).filter((venue) => typeof venue === "string"))];
  const approvalBody = {
    planId: plan.planId,
    planHash: plan.planHash,
    expiresAt: plan.expiresAt,
    maxTotalSpendUsd: plan.estimatedTotalCostUsd,
    maxCollateralUsd: plan.budgetUsd,
    allowedVenues: venues,
    // Inside the 20 RLUSD AP4M allocation for team Penn1, with room for retries.
    ap4mFallbackBudgetUsd: "10",
    plan
  };
  const created = await call(execution, "POST", "/v1/execution/approvals", approvalBody);
  steps.push({ name: "approval", status: created.status, detail: detailOf(created.body, "approval") });
  if (created.status !== 200 || !isRecord6(created.body) || typeof created.body.approvalId !== "string") {
    return { ...outcome, note: "Execution did not open an approval. No order was submitted." };
  }
  const confirmed = await call(execution, "POST", `/v1/execution/approvals/${encodeURIComponent(created.body.approvalId)}/confirm`, {
    ...approval
  });
  steps.push({ name: "confirm", status: confirmed.status, detail: detailOf(confirmed.body, "confirm") });
  if (!isRecord6(confirmed.body) || confirmed.body.status !== "APPROVED") {
    return { ...outcome, approval: confirmed.body, note: "Execution did not return APPROVED. No order was submitted." };
  }
  outcome.approval = confirmed.body;
  const idempotencyKey = randomUUID9();
  const run = await call(execution, "POST", "/v1/execution/runs", {
    plan,
    approvalId: created.body.approvalId,
    idempotencyKey
  }, { "idempotency-key": idempotencyKey });
  steps.push({ name: "run", status: run.status, detail: detailOf(run.body, "run") });
  if (run.status !== 200) {
    return { ...outcome, run: run.body, note: "The approved plan was not executed. No live fill is claimed." };
  }
  outcome.run = run.body;
  const armed = await call(execution, "POST", "/v1/failover/arm", {
    planId: plan.planId,
    approvalId: created.body.approvalId,
    primaryService: PRIMARY,
    fallbackOfferId: "cap_sandbox_standby",
    maxPerTriggerUsd: "10",
    maxDailySpendUsd: "10",
    triggerRuleId: "primary_down"
  });
  steps.push({ name: "arm", status: armed.status, detail: detailOf(armed.body, "arm") });
  if (!isRecord6(armed.body) || armed.body.status !== "ARMED") {
    return { ...outcome, note: "Failover was not armed. The sandbox orders above are unchanged." };
  }
  const failover = await call(execution, "POST", "/v1/failover/simulate", {
    planId: plan.planId,
    primaryService: PRIMARY,
    fallbackService: FALLBACK,
    failureMode: "provider_down"
  }, { "x-failover-scenario": "success", "x-failover-quote-usd": "1" });
  steps.push({ name: "failover", status: failover.status, detail: detailOf(failover.body, "failover") });
  outcome.failover = failover.body;
  const state = isRecord6(failover.body) && typeof failover.body.state === "string" ? failover.body.state : "unknown";
  return {
    ...outcome,
    ok: failover.status === 200,
    note: state === "RLUSD_SETTLED" || state === "FALLBACK_ACTIVE" ? "Refusing to present this state as settled RLUSD." : `Sandbox orders are simulated. Failover state is ${state}. That is not a VoucherRedeemed event and not an RLUSD payout.`
  };
}
async function runProof(strategy, markets, execution) {
  const steps = [];
  const [network, sponsors] = await Promise.all([
    readNetwork(process.env),
    sponsorStatus(process.env)
  ]);
  const clearSigning = SAMPLE_XRPL_TRANSACTIONS.map((tx) => previewXrplTransaction(tx));
  const base = {
    syntheticDemo: true,
    humanConfirmed: true,
    steps,
    network,
    clearSigning,
    sponsors,
    company: null,
    marketSearch: null,
    books: [],
    plan: null,
    approval: null,
    run: null,
    failover: null
  };
  const analyzed = await call(strategy, "POST", "/v1/companies/analyze", SAMPLE_INTAKE);
  steps.push({ name: "analyze", status: analyzed.status, detail: detailOf(analyzed.body, "analyze") });
  if (analyzed.status !== 200 || !isRecord6(analyzed.body) || !isRecord6(analyzed.body.company)) {
    return { ...base, ok: false, note: "Company analysis did not return a profile. No order was submitted." };
  }
  const company = { ...analyzed.body.company, confirmedByUser: true };
  base.company = company;
  const quoted = await quoteAndPlan(strategy, markets, company, "min_cvar", steps);
  if (!quoted.ok) {
    base.marketSearch = quoted.search ?? null;
    return {
      ...base,
      ok: false,
      note: quoted.stage === "search" ? "Market search failed. No plan was created." : "Strategy did not return a plan. No order was submitted."
    };
  }
  base.marketSearch = quoted.search;
  base.books = quoted.books;
  base.plan = quoted.plan;
  const executed = await executePlan(execution, quoted.plan, steps);
  return {
    ...base,
    ok: executed.ok,
    note: executed.note,
    approval: executed.approval,
    run: executed.run,
    failover: executed.failover
  };
}
function messageOf(body, fallback) {
  if (isRecord6(body) && typeof body.message === "string" && body.message.trim()) return body.message;
  return fallback;
}

// server.ts
var gateway = await createDemoApp();
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 4110);
  await gateway.listen({ port, host: "0.0.0.0" });
  console.log(`switchboard demo listening on ${port}`);
}
var server_default = gateway;

// demo/vercel-entry.ts
function header(req, name) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
function restoreDemoUrl(req) {
  const raw = req.url ?? "/";
  const host = header(req, "host") ?? "localhost";
  let url;
  try {
    url = new URL(raw, `http://${host}`);
  } catch {
    return;
  }
  if (!url.searchParams.has("path")) return;
  const path3 = url.searchParams.get("path") ?? "";
  url.searchParams.delete("path");
  const query = url.searchParams.toString();
  const pathname = path3.length === 0 ? "/" : path3.startsWith("/") ? path3 : `/${path3}`;
  req.url = query.length > 0 ? `${pathname}?${query}` : pathname;
}
async function handler(req, res) {
  restoreDemoUrl(req);
  await server_default.ready();
  server_default.server.emit("request", req, res);
}
export {
  handler as default,
  restoreDemoUrl
};
