import type { Comparison } from "@switchboard/contracts";

export type Subject = "service_outage" | "service_cost" | "capacity" | "weather" | "other";

/** Terms that must all match before a contract is a direct hedge. */
export interface ComparabilityTerms {
  eventRule: string;
  resolutionSource: string;
  window: string;
  payoutUnit: string;
  side: string;
  subject: Subject;
}

function norm(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Direct only when event rule, resolution source, window, payout unit, and side match.
 * A weather contract versus a cloud/service outage is never direct.
 */
export function classifyComparison(exposure: ComparabilityTerms, candidate: ComparabilityTerms): Comparison {
  const weatherVersusOutage =
    (exposure.subject === "weather" && candidate.subject === "service_outage") ||
    (exposure.subject === "service_outage" && candidate.subject === "weather");
  if (weatherVersusOutage) return "not_comparable";

  const same =
    norm(exposure.eventRule) === norm(candidate.eventRule) &&
    norm(exposure.resolutionSource) === norm(candidate.resolutionSource) &&
    norm(exposure.window) === norm(candidate.window) &&
    norm(exposure.payoutUnit) === norm(candidate.payoutUnit) &&
    norm(exposure.side) === norm(candidate.side);
  if (same) return "direct";

  if (exposure.subject === candidate.subject) return "proxy";
  const operational = new Set<Subject>(["service_outage", "service_cost", "capacity"]);
  if (operational.has(exposure.subject) && operational.has(candidate.subject)) return "proxy";
  return "not_comparable";
}

export function exposureFromIds(exposureIds: string[]): ComparabilityTerms {
  const text = exposureIds.join(" ").toLowerCase();
  const weather = /weather|hurricane|temperature|storm|climate/.test(text);
  const outage = /outage|uptime|downtime|availability/.test(text);
  const cost = /cost|token|premium|price/.test(text);
  const capacity = /capacity|failover|throughput/.test(text);
  if (weather && !outage) return WEATHER_EXPOSURE;
  if (cost && !outage) return COST_EXPOSURE;
  if (capacity && !outage) return CAPACITY_EXPOSURE;
  return OUTAGE_EXPOSURE;
}

export const OUTAGE_EXPOSURE: ComparabilityTerms = {
  eventRule:
    "Pays 1000 USD per unit if 3 of 5 independent regions each observe >15 consecutive minutes unavailable during the contract window. 24h challenge.",
  resolutionSource: "https://example.invalid/switchboard/sandbox-oracle/service-outage",
  window: "2026-11-30T23:59:59.000Z",
  payoutUnit: "USD per binary contract",
  side: "BUY",
  subject: "service_outage",
};

export const COST_EXPOSURE: ComparabilityTerms = {
  eventRule:
    "Payout per unit = min(max(benchmark USD per million tokens - 12, 0), 1000) over the November 2026 hourly window. Fully collateralized; no unbounded payoff.",
  resolutionSource: "https://example.invalid/switchboard/sandbox-oracle/service-cost",
  window: "2026-11-30T23:59:59.000Z",
  payoutUnit: "USD per capped contract",
  side: "BUY",
  subject: "service_cost",
};

export const CAPACITY_EXPOSURE: ComparabilityTerms = {
  eventRule:
    "On a verified primary outage trigger, buyer may consume reserved throughput at 0.006 USD per request. Unavailable capacity pays at most the collateralized cap. Not a live capacity guarantee.",
  resolutionSource: "https://example.invalid/switchboard/sandbox-oracle/capacity",
  window: "2026-11-30T23:59:59.000Z",
  payoutUnit: "USD per capacity option",
  side: "BUY",
  subject: "capacity",
};

export const WEATHER_EXPOSURE: ComparabilityTerms = {
  eventRule: "Pays if a reference city daily high temperature exceeds a stated Fahrenheit strike. Weather observation, not a service probe.",
  resolutionSource: "https://example.invalid/weather/reference-station",
  window: "2026-10-25T23:59:59.000Z",
  payoutUnit: "USD per weather binary",
  side: "BUY",
  subject: "weather",
};
