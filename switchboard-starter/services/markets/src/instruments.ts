import type { Instrument } from "@switchboard/contracts";
import {
  CAPACITY_EXPOSURE,
  COST_EXPOSURE,
  OUTAGE_EXPOSURE,
  WEATHER_EXPOSURE,
  type ComparabilityTerms,
} from "./comparability.js";

export const OUTAGE_ID = "sb_sandbox_service_outage_binary";
export const COST_ID = "sb_sandbox_service_cost_cap";
export const CAPACITY_ID = "sb_sandbox_contingent_capacity_option";

const EXPIRY = "2026-11-30T23:59:59.000Z";

export const OUTAGE_INSTRUMENT: Instrument = Object.freeze({
  instrumentId: OUTAGE_ID,
  venue: "switchboard",
  name: "Synthetic SERVICE_OUTAGE_BINARY: API unavailable ≥15 minutes (3 of 5 regions)",
  riskFactor: "primary_outage",
  settlementType: "binary",
  eventRule: OUTAGE_EXPOSURE.eventRule,
  resolutionSourceUrl: OUTAGE_EXPOSURE.resolutionSource,
  expiresAt: EXPIRY,
  payoutPerUnitUsd: "1000",
  maximumPayoutUsd: "1000",
  collateralCurrency: "RLUSD",
  unitDescription: "One binary contract (synthetic sandbox)",
  comparisonGroupId: "svc-outage-15m-3of5",
});

export const COST_INSTRUMENT: Instrument = Object.freeze({
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
  comparisonGroupId: "svc-cost-cap-12",
});

export const CAPACITY_INSTRUMENT: Instrument = Object.freeze({
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
  comparisonGroupId: "svc-capacity-option",
});

export const STANDARD_INSTRUMENTS: readonly Instrument[] = Object.freeze([
  OUTAGE_INSTRUMENT,
  COST_INSTRUMENT,
  CAPACITY_INSTRUMENT,
]);

export function instrumentById(instrumentId: string): Instrument | undefined {
  return STANDARD_INSTRUMENTS.find((instrument) => instrument.instrumentId === instrumentId);
}

export function instrumentTerms(instrument: Instrument): ComparabilityTerms {
  if (instrument.instrumentId === OUTAGE_ID) return { ...OUTAGE_EXPOSURE, window: instrument.expiresAt };
  if (instrument.instrumentId === COST_ID) return { ...COST_EXPOSURE, window: instrument.expiresAt };
  if (instrument.instrumentId === CAPACITY_ID) return { ...CAPACITY_EXPOSURE, window: instrument.expiresAt };
  return {
    eventRule: instrument.eventRule,
    resolutionSource: instrument.resolutionSourceUrl,
    window: instrument.expiresAt,
    payoutUnit: instrument.unitDescription,
    side: "BUY",
    subject: "other",
  };
}

export const SYNTHETIC_WEATHER_TERMS: ComparabilityTerms = WEATHER_EXPOSURE;

/** Resting sandbox liquidity. Bids are strictly below asks so the seed does not self-match. */
export const SANDBOX_LIQUIDITY: Record<string, { bids: { priceUsd: string; quantity: string }[]; asks: { priceUsd: string; quantity: string }[] }> = {
  [OUTAGE_ID]: {
    bids: [
      { priceUsd: "16", quantity: "20" },
      { priceUsd: "15", quantity: "30" },
    ],
    asks: [
      { priceUsd: "18", quantity: "25" },
      { priceUsd: "19", quantity: "25" },
      { priceUsd: "21", quantity: "50" },
    ],
  },
  [COST_ID]: {
    bids: [
      { priceUsd: "28", quantity: "15" },
      { priceUsd: "27", quantity: "20" },
    ],
    asks: [
      { priceUsd: "30", quantity: "40" },
      { priceUsd: "32", quantity: "60" },
    ],
  },
  [CAPACITY_ID]: {
    bids: [
      { priceUsd: "14", quantity: "10" },
      { priceUsd: "13", quantity: "20" },
    ],
    asks: [
      { priceUsd: "15", quantity: "20" },
      { priceUsd: "16", quantity: "80" },
    ],
  },
};
