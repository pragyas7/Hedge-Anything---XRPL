import { randomUUID } from "node:crypto";
import type {
  ApprovalConfirmRequest,
  ApprovalRequest,
  ExecutionRun,
  ExecutionRunRequest,
  HedgeLeg,
  HedgePlan,
  MarketOrderRequest,
  MarketOrderResult,
  SettlementReceipt,
  Venue,
} from "@switchboard/contracts";
import {
  ledgerAgentIntentWarning,
  ledgerDmkOperatorWarning,
  ledgerDmkUnsupportedWarning,
} from "./capability-registry.js";
import { apiError, type HandlerResult } from "./errors.js";
import { allInUnitPrice, greaterThan, isMoney, sumMoney } from "./money.js";
import { computePlanHash, isPlaceholderPlanHash, withComputedPlanHash } from "./plan-hash.js";
import { publicApproval, type MemoryStore, type StoredApproval } from "./store.js";
import type { AppConfig } from "./config.js";
import type { Ap4mPaymentClient } from "./ap4m.js";
import type { MarketsClient, QuoteRevalidationClient } from "./markets.js";
import type { ExchangeSettlementClient } from "./settlement.js";
import type { TokenService } from "./tokens.js";

const VENUES: readonly Venue[] = [
  "kalshi",
  "polymarket_us",
  "polymarket_international",
  "switchboard",
  "capacity_provider",
];

const METHODS = ["app_manual", "ledger_agent_intent", "ledger_dmk_verified", "external_wallet"] as const;

export interface ServiceContext {
  config: AppConfig;
  store: MemoryStore;
  tokens: TokenService;
  markets: MarketsClient;
  revalidation: QuoteRevalidationClient;
  settlement: ExchangeSettlementClient;
  ap4m: Ap4mPaymentClient;
  clock: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVenue(value: unknown): value is Venue {
  return typeof value === "string" && (VENUES as readonly string[]).includes(value);
}

export function readNow(raw: string | undefined, clock: () => Date): { ok: true; now: Date } | { ok: false; message: string } {
  if (!raw) return { ok: true, now: clock() };
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return { ok: false, message: "X-Switchboard-Now must be an ISO-8601 timestamp." };
  return { ok: true, now: new Date(parsed) };
}

function validation(correlationId: string, message: string): HandlerResult {
  return { status: 400, body: apiError("VALIDATION_ERROR", message, correlationId, false) };
}

function parseApprovalRequest(body: Record<string, unknown>, correlationId: string): ApprovalRequest | HandlerResult {
  const { planId, planHash, expiresAt, maxTotalSpendUsd, maxCollateralUsd, allowedVenues, ap4mFallbackBudgetUsd } = body;
  if (typeof planId !== "string" || planId.length === 0) return validation(correlationId, "planId is required.");
  if (typeof planHash !== "string" || planHash.length === 0) return validation(correlationId, "planHash is required.");
  if (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt))) return validation(correlationId, "expiresAt must be an ISO-8601 timestamp.");
  if (!isMoney(maxTotalSpendUsd) || !isMoney(maxCollateralUsd) || !isMoney(ap4mFallbackBudgetUsd)) {
    return validation(correlationId, "Spend, collateral, and AP4M budget must be decimal strings.");
  }
  if (!Array.isArray(allowedVenues) || allowedVenues.length === 0 || !allowedVenues.every(isVenue)) {
    return validation(correlationId, "allowedVenues must be a non-empty venue list.");
  }
  return {
    planId,
    planHash,
    expiresAt,
    maxTotalSpendUsd,
    maxCollateralUsd,
    allowedVenues,
    ap4mFallbackBudgetUsd,
  };
}

function isHandler(value: ApprovalRequest | HandlerResult): value is HandlerResult {
  return "status" in value && "body" in value;
}

function hashMismatch(correlationId: string, message: string): HandlerResult {
  return { status: 409, body: apiError("PLAN_HASH_MISMATCH", message, correlationId, false) };
}

export async function createApproval(ctx: ServiceContext, body: unknown, correlationId: string): Promise<HandlerResult> {
  if (!isRecord(body)) return validation(correlationId, "JSON object body is required.");
  if (!isRecord(body.plan)) return { status: 400, body: apiError("PLAN_SNAPSHOT_REQUIRED", "Approval creation requires the hedge plan snapshot so the plan hash can be recomputed.", correlationId, false) };
  const request = parseApprovalRequest(body, correlationId);
  if (isHandler(request)) return request;
  const plan = body.plan as unknown as HedgePlan;
  if (plan.planId !== request.planId) {
    return { status: 409, body: apiError("PLAN_ID_MISMATCH", "plan.planId does not match the approval planId.", correlationId, false) };
  }
  let computed: string;
  try {
    computed = computePlanHash(plan);
  } catch {
    return validation(correlationId, "Plan snapshot could not be canonicalized.");
  }
  if (isPlaceholderPlanHash(request.planHash) || (typeof plan.planHash === "string" && isPlaceholderPlanHash(plan.planHash)) || request.planHash !== computed || plan.planHash !== computed) {
    return hashMismatch(correlationId, "Submitted planHash does not match the canonical SHA-256 of the plan snapshot. Placeholder digests are rejected.");
  }
  const stored: StoredApproval = {
    approvalId: `approval_${randomUUID()}`,
    request,
    planSnapshot: withComputedPlanHash(plan),
    status: "PENDING",
    method: "app_manual",
    issuedJtis: [],
  };
  ctx.store.approvals.set(stored.approvalId, stored);
  return { status: 200, body: publicApproval(stored) };
}

function expired(expiresAt: string, now: Date): boolean {
  return now.getTime() >= Date.parse(expiresAt);
}

export async function confirmApproval(
  ctx: ServiceContext,
  approvalId: string,
  body: unknown,
  now: Date,
  correlationId: string,
): Promise<HandlerResult> {
  const stored = ctx.store.approvals.get(approvalId);
  if (!stored) return { status: 404, body: apiError("APPROVAL_NOT_FOUND", "Approval was not found.", correlationId, false) };
  if (!isRecord(body) || typeof body.method !== "string" || typeof body.signedIntent !== "string") {
    return validation(correlationId, "method and signedIntent are required.");
  }
  if (!(METHODS as readonly string[]).includes(body.method)) return validation(correlationId, "Unknown approval method.");
  const confirm = body as unknown as ApprovalConfirmRequest;
  if (expired(stored.request.expiresAt, now) || stored.status === "EXPIRED") {
    stored.status = "EXPIRED";
    ctx.tokens.revoke(stored.issuedJtis);
    return { status: 409, body: apiError("APPROVAL_EXPIRED", "Expired approval cannot be confirmed.", correlationId, false, { status: "EXPIRED" }) };
  }
  if (stored.status === "APPROVED" || stored.status === "REJECTED") {
    return { status: 409, body: apiError("APPROVAL_ALREADY_DECIDED", "Approval was already decided.", correlationId, false, { status: stored.status }) };
  }

  if (confirm.method === "ledger_agent_intent") {
    stored.status = "UNSUPPORTED";
    stored.method = "ledger_agent_intent";
    stored.approvedAt = undefined;
    stored.deviceProofId = undefined;
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
      stored.approvedAt = undefined;
      stored.deviceProofId = undefined;
      stored.warning = ledgerDmkUnsupportedWarning();
      ctx.tokens.revoke(stored.issuedJtis);
    }
    return { status: 200, body: publicApproval(stored), headers: { "x-switchboard-warning": stored.warning } };
  }

  const expected = `${confirm.method}:${stored.request.planHash}`;
  if (confirm.signedIntent !== expected) {
    return {
      status: 400,
      body: apiError("INVALID_SIGNED_INTENT", `signedIntent must equal ${expected}. Status was not changed.`, correlationId, false, { status: stored.status }),
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

function legLimitPrice(leg: HedgeLeg): string {
  const ask = (leg as HedgeLeg & { askUsd?: unknown }).askUsd;
  if (typeof ask === "string" && isMoney(ask)) return ask;
  return allInUnitPrice(leg.estimatedAllInCostUsd, leg.quantity);
}

function failedOrder(clientOrderId: string): MarketOrderResult {
  return {
    clientOrderId,
    venueOrderId: "not_submitted",
    status: "REJECTED",
    filledQuantity: "0",
    averageFillPriceUsd: "0",
    syntheticDemo: true,
  };
}

function executionMode(config: AppConfig): "sandbox" | "live" {
  return config.allowLive ? "live" : "sandbox";
}

export async function createRun(
  ctx: ServiceContext,
  body: unknown,
  now: Date,
  correlationId: string,
): Promise<HandlerResult> {
  if (!isRecord(body) || !isRecord(body.plan) || typeof body.approvalId !== "string" || typeof body.idempotencyKey !== "string") {
    return validation(correlationId, "plan, approvalId, and idempotencyKey are required.");
  }
  const request = body as unknown as ExecutionRunRequest;
  const plan = request.plan;
  const approval = ctx.store.approvals.get(request.approvalId);
  if (!approval) {
    return { status: 403, body: apiError("APPROVAL_NOT_FOUND", "Approval was not found. No order was submitted.", correlationId, false) };
  }
  if (expired(approval.request.expiresAt, now) || approval.status === "EXPIRED") {
    approval.status = "EXPIRED";
    ctx.tokens.revoke(approval.issuedJtis);
    return { status: 409, body: apiError("APPROVAL_EXPIRED", "Approval is expired. No order was submitted.", correlationId, false) };
  }
  if (approval.status !== "APPROVED") {
    return { status: 403, body: apiError("APPROVAL_NOT_APPROVED", "Approval is not APPROVED. No order was submitted.", correlationId, false, { status: approval.status }) };
  }
  if (plan.version !== approval.planSnapshot.version) {
    return { status: 409, body: apiError("PLAN_VERSION_MISMATCH", "Plan version does not match the approved snapshot. No order was submitted.", correlationId, false) };
  }
  let computed: string;
  let snapshotHash: string;
  try {
    computed = computePlanHash(plan);
    snapshotHash = computePlanHash(approval.planSnapshot);
  } catch {
    return validation(correlationId, "Plan could not be canonicalized.");
  }
  if (
    isPlaceholderPlanHash(plan.planHash) ||
    isPlaceholderPlanHash(approval.request.planHash) ||
    plan.planHash !== computed ||
    computed !== snapshotHash ||
    plan.planHash !== approval.request.planHash
  ) {
    return hashMismatch(correlationId, "Plan hash does not match the approved snapshot. No order was submitted.");
  }
  if (plan.planId !== approval.request.planId) {
    return { status: 409, body: apiError("PLAN_ID_MISMATCH", "Plan id does not match the approval. No order was submitted.", correlationId, false) };
  }
  if (greaterThan(plan.estimatedTotalCostUsd, approval.request.maxTotalSpendUsd)) {
    return { status: 409, body: apiError("SPEND_CAP_EXCEEDED", "estimatedTotalCostUsd exceeds the approved maxTotalSpendUsd. No order was submitted.", correlationId, false) };
  }
  if (greaterThan(sumMoney(plan.legs.map((leg) => leg.maxAdditionalObligationUsd)), approval.request.maxCollateralUsd)) {
    return { status: 409, body: apiError("COLLATERAL_CAP_EXCEEDED", "Additional obligations exceed maxCollateralUsd. No order was submitted.", correlationId, false) };
  }
  for (const leg of plan.legs) {
    if (leg.venue === "polymarket_international") {
      return { status: 403, body: apiError("VENUE_NOT_ELIGIBLE", "polymarket_international is reference-only and cannot be executed. No order was submitted.", correlationId, false) };
    }
    if (!approval.request.allowedVenues.includes(leg.venue)) {
      return { status: 403, body: apiError("VENUE_NOT_ALLOWED", `Venue ${leg.venue} is not in the approval allow-list. No order was submitted.`, correlationId, false) };
    }
  }
  if (expired(plan.expiresAt, now)) {
    return { status: 409, body: apiError("QUOTE_EXPIRED", "Plan expiry has passed, so quotes are stale. No order was submitted.", correlationId, false) };
  }
  let revalidation;
  try {
    revalidation = await ctx.revalidation.check({ plan, now });
  } catch {
    return { status: 409, body: apiError("REVALIDATION_FAILED", "Quote revalidation failed closed. No order was submitted.", correlationId, false) };
  }
  if (revalidation.quoteExpired) {
    return { status: 409, body: apiError("QUOTE_EXPIRED", revalidation.reason ?? "Quote is expired. No order was submitted.", correlationId, false) };
  }
  if (revalidation.materialPriceChange) {
    return { status: 409, body: apiError("REAPPROVAL_REQUIRED", revalidation.reason ?? "Material price change requires a new approval. No order was submitted.", correlationId, false) };
  }

  const financial = plan.legs.filter((leg) => leg.kind === "financial");
  for (const leg of financial) {
    if (!leg.quoteId || !leg.instrumentId) {
      return validation(correlationId, `Financial leg ${leg.legId} requires quoteId and instrumentId.`);
    }
    try {
      legLimitPrice(leg);
    } catch {
      return validation(correlationId, `Financial leg ${leg.legId} has a non-positive quantity.`);
    }
  }

  const runId = `run_${randomUUID()}`;
  const orders: MarketOrderResult[] = [];
  const jtis: string[] = [];
  let reapproval = false;
  const mode = executionMode(ctx.config);

  for (const leg of financial) {
    const maxPriceUsd = legLimitPrice(leg);
    const clientOrderId = `${runId}:${leg.legId}`;
    const signed = await ctx.tokens.signOrder({
      approvalId: approval.approvalId,
      planHash: computed,
      quoteId: leg.quoteId as string,
      instrumentId: leg.instrumentId as string,
      venue: leg.venue,
      maxQuantity: leg.quantity,
      maxPriceUsd,
      maxSpendUsd: leg.estimatedAllInCostUsd,
      mode,
      now,
    });
    if (ctx.tokens.isRevoked(signed.jti)) {
      return { status: 409, body: apiError("AUTHORIZATION_REVOKED", "Refusing to submit a revoked execution authorization.", correlationId, false) };
    }
    jtis.push(signed.jti);
    approval.issuedJtis.push(signed.jti);
    const orderBody: MarketOrderRequest = {
      approvalId: approval.approvalId,
      planHash: computed,
      quoteId: leg.quoteId as string,
      side: "BUY",
      quantity: leg.quantity,
      limitPriceUsd: maxPriceUsd,
      clientOrderId,
    };
    let outcome;
    try {
      outcome = await ctx.markets.placeOrder({
        body: orderBody,
        idempotencyKey: clientOrderId,
        authorization: signed.jwt,
        correlationId,
      });
    } catch {
      outcome = { kind: "unreachable" as const };
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
  let status: ExecutionRun["status"];
  if (reapproval) status = "REAPPROVAL_REQUIRED";
  else if (orders.length === 0 || orders.every((order) => order.status === "SIMULATED" || order.status === "FILLED")) status = "ACTIVE";
  else if (successes.length > 0) status = "PARTIAL";
  else status = "FAILED";

  const receipts: SettlementReceipt[] = [];
  if (!reapproval) {
    for (const order of orders) {
      if (order.status !== "SIMULATED" && order.status !== "FILLED" && order.status !== "PARTIALLY_FILLED") continue;
      receipts.push({
        receiptId: `receipt_${randomUUID()}`,
        kind: "market_fill" as const,
        confirmed: false,
        observedAt: now.toISOString(),
        metadata: {
          mode,
          orderStatus: order.status,
          clientOrderId: order.clientOrderId,
          note: order.status === "SIMULATED"
            ? "Markets returned SIMULATED. Status was not relabeled FILLED. No chain settlement was observed."
            : "Order result stored as returned. confirmed is false until a chain receipt is observed.",
        },
      });
      try {
        receipts.push(await ctx.settlement.observe({ clientOrderId: order.clientOrderId, now }));
      } catch {
        receipts.push({
          receiptId: `receipt_${randomUUID()}`,
          kind: "exchange_settlement",
          confirmed: false,
          observedAt: now.toISOString(),
          metadata: {
            mode: "sandbox_simulator",
            note: "Settlement client failed. No transaction hash was invented.",
            clientOrderId: order.clientOrderId,
          },
        });
      }
    }
  }

  if (status === "FAILED" || status === "PARTIAL" || status === "REAPPROVAL_REQUIRED") {
    ctx.tokens.revoke(jtis);
  }

  const run: ExecutionRun = {
    runId,
    planId: plan.planId,
    approvalId: approval.approvalId,
    status,
    orders,
    receipts,
    correlationId,
  };
  ctx.store.runs.set(runId, run);
  ctx.store.runJtis.set(runId, jtis);
  return { status: 200, body: run };
}

export function getRun(ctx: ServiceContext, runId: string, correlationId: string): HandlerResult {
  const run = ctx.store.runs.get(runId);
  if (!run) return { status: 404, body: apiError("NOT_FOUND", "Execution run was not found.", correlationId, false) };
  return { status: 200, body: run };
}
