import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Approval, ApprovalRequest, HedgePlan, MarketOrderResult } from "@switchboard/contracts";
import type { FastifyInstance } from "fastify";
import { vi } from "vitest";
import { buildApp, type BuildAppOptions } from "../src/app.js";
import type { MarketsClient, MarketsOrderOutcome, PlaceOrderInput } from "../src/markets.js";
import { withComputedPlanHash } from "../src/plan-hash.js";

const starterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const BEARER = "switchboard-dev-platform-token";

export function loadFixturePlan(): HedgePlan {
  const raw = JSON.parse(readFileSync(path.join(starterRoot, "fixtures/hedge-plan.json"), "utf8")) as HedgePlan;
  return withComputedPlanHash(raw);
}

export function approvalPayload(plan: HedgePlan, overrides: Partial<ApprovalRequest> = {}) {
  return {
    plan,
    expiresAt: "2026-12-01T00:00:00.000Z",
    maxTotalSpendUsd: "800",
    maxCollateralUsd: "5000",
    allowedVenues: ["switchboard", "capacity_provider"] as ApprovalRequest["allowedVenues"],
    ap4mFallbackBudgetUsd: "100",
    ...overrides,
    planId: overrides.planId ?? plan.planId,
    planHash: overrides.planHash ?? plan.planHash,
  };
}

export function authHeaders(idempotencyKey?: string, extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${BEARER}`,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    ...extra,
  };
}

export function simulatedOrder(clientOrderId: string): MarketOrderResult {
  return {
    clientOrderId,
    venueOrderId: "sandbox_simulated",
    status: "SIMULATED",
    filledQuantity: "0",
    averageFillPriceUsd: "0",
    syntheticDemo: true,
  };
}

export function marketsDouble(impl?: (input: PlaceOrderInput) => Promise<MarketsOrderOutcome>) {
  const placeOrder = vi.fn(impl ?? (async (input: PlaceOrderInput) => ({
    kind: "result" as const,
    result: simulatedOrder(input.body.clientOrderId),
  })));
  const markets: MarketsClient = { placeOrder };
  return { markets, placeOrder };
}

export async function createTestApp(options: BuildAppOptions = {}) {
  const doubled = options.markets ? undefined : marketsDouble();
  const app = await buildApp({
    ...(doubled ? { markets: doubled.markets } : {}),
    ...options,
  });
  return { app, placeOrder: doubled?.placeOrder };
}

export async function approvePlan(
  app: FastifyInstance,
  plan: HedgePlan,
  key: string,
  overrides: Partial<ApprovalRequest> = {},
  now?: string,
) {
  const created = await app.inject({
    method: "POST",
    url: "/v1/execution/approvals",
    headers: authHeaders(`${key}-create`, now ? { "x-switchboard-now": now } : {}),
    payload: approvalPayload(plan, overrides),
  });
  const pending = created.json() as Approval;
  const confirmed = await app.inject({
    method: "POST",
    url: `/v1/execution/approvals/${pending.approvalId}/confirm`,
    headers: authHeaders(`${key}-confirm`, now ? { "x-switchboard-now": now } : {}),
    payload: { method: "app_manual", signedIntent: `app_manual:${plan.planHash}` },
  });
  return { created, confirmed, approval: confirmed.json() as Approval };
}
