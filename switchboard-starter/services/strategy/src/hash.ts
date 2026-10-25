import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { HedgePlan } from '@switchboard/contracts';

const require = createRequire(import.meta.url);
const canonicalize = require('canonicalize') as (value: unknown) => string | undefined;

export function canonicalJson(value: unknown): string {
  const canonical = canonicalize(value);
  if (typeof canonical !== 'string') {
    throw new Error('RFC 8785 canonicalization failed');
  }
  return canonical;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * sha256 of RFC 8785 canonical JSON for the immutable plan fields.
 * Excludes planHash and status. version stays a number; money stays strings.
 */
export function planHash(plan: Pick<HedgePlan,
  | 'planId'
  | 'companyId'
  | 'version'
  | 'createdAt'
  | 'expiresAt'
  | 'budgetUsd'
  | 'estimatedTotalCostUsd'
  | 'before'
  | 'after'
  | 'legs'
  | 'rationale'
  | 'warnings'
  | 'syntheticDemo'>): string {
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
    syntheticDemo: plan.syntheticDemo,
  };
  return `sha256:${sha256Hex(canonicalJson(body))}`;
}
