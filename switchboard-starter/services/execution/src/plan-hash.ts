import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { HedgePlan } from "@switchboard/contracts";

const require = createRequire(import.meta.url);
const canonicalize = require("canonicalize") as (value: unknown) => string | undefined;

/** Fixture placeholder. Never a valid approval or execution digest. */
export const PLACEHOLDER_PLAN_HASH = "sha256:demo_only_untrusted_digest_replace_in_production";

export function canonicalJson(value: unknown): string {
  const json = canonicalize(value);
  if (json === undefined) throw new Error("value cannot be canonicalized");
  return json;
}

export function sha256Prefixed(value: unknown): string {
  const hex = createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
  return `sha256:${hex}`;
}

/** Fields required by the integration handshake. Excludes planHash and status. */
export function planHashPayload(plan: HedgePlan): Record<string, unknown> {
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
    syntheticDemo: plan.syntheticDemo,
  };
}

export function computePlanHash(plan: HedgePlan): string {
  return sha256Prefixed(planHashPayload(plan));
}

export function isPlaceholderPlanHash(value: string): boolean {
  return value === PLACEHOLDER_PLAN_HASH;
}

export function withComputedPlanHash(plan: HedgePlan): HedgePlan {
  const clone = structuredClone(plan);
  clone.planHash = computePlanHash(clone);
  return clone;
}
