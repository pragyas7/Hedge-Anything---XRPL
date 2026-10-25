import { randomUUID } from "node:crypto";
import type {
  FailoverArmRequest,
  FailoverRun,
  FailoverState,
  SettlementReceipt,
} from "@switchboard/contracts";
import { decide402 } from "./ap4m.js";
import { XRPL_EVM_CHAIN_ID } from "./capability-registry.js";
import type { ServiceContext } from "./execution.js";
import { apiError, type HandlerResult } from "./errors.js";
import { addMoney, greaterThan, isMoney, maxDecimal, minDecimal, subtractMoney } from "./money.js";
import { sha256Prefixed } from "./plan-hash.js";
import { isRealTxHash, SYNTHETIC_TX_HASH } from "./settlement.js";
import type { ArmedMonitor } from "./store.js";

/** OpenAPI FailoverSimulateRequest. Not exported by @switchboard/contracts. */
export interface FailoverSimulateRequest {
  planId: string;
  primaryService: string;
  fallbackService: string;
  failureMode: "timeout" | "http_500" | "latency_spike" | "provider_down";
}

const FAILURE_MODES = ["timeout", "http_500", "latency_spike", "provider_down"] as const;
export const FAILOVER_SCENARIO_HEADER = "x-failover-scenario";
export const FAILOVER_QUOTE_HEADER = "x-failover-quote-usd";

export type FailoverScenario =
  | "success"
  | "failing_backup"
  | "invalid_voucher"
  | "no_balance"
  | "budget_exceeded"
  | "receipt_failed"
  | "proof_missing";

const SCENARIOS: readonly FailoverScenario[] = [
  "success",
  "failing_backup",
  "invalid_voucher",
  "no_balance",
  "budget_exceeded",
  "receipt_failed",
  "proof_missing",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validation(correlationId: string, message: string): HandlerResult {
  return { status: 400, body: apiError("VALIDATION_ERROR", message, correlationId, false) };
}

export function policyDigest(policy: FailoverArmRequest): string {
  return sha256Prefixed({
    planId: policy.planId,
    approvalId: policy.approvalId,
    primaryService: policy.primaryService,
    fallbackOfferId: policy.fallbackOfferId,
    maxPerTriggerUsd: policy.maxPerTriggerUsd,
    maxDailySpendUsd: policy.maxDailySpendUsd,
    triggerRuleId: policy.triggerRuleId,
  });
}

function parseArm(body: unknown, correlationId: string): FailoverArmRequest | HandlerResult {
  if (!isRecord(body)) return validation(correlationId, "JSON object body is required.");
  const fields = ["planId", "approvalId", "primaryService", "fallbackOfferId", "triggerRuleId"] as const;
  for (const field of fields) {
    if (typeof body[field] !== "string" || (body[field] as string).length === 0) {
      return validation(correlationId, `${field} is required.`);
    }
  }
  if (!isMoney(body.maxPerTriggerUsd) || !isMoney(body.maxDailySpendUsd)) {
    return validation(correlationId, "maxPerTriggerUsd and maxDailySpendUsd must be decimal strings.");
  }
  return body as unknown as FailoverArmRequest;
}

function isHandler(value: FailoverArmRequest | HandlerResult): value is HandlerResult {
  return "status" in value;
}

export async function armFailover(ctx: ServiceContext, body: unknown, now: Date, correlationId: string): Promise<HandlerResult> {
  const policy = parseArm(body, correlationId);
  if (isHandler(policy)) return policy;
  const approval = ctx.store.approvals.get(policy.approvalId);
  if (!approval) return { status: 403, body: apiError("APPROVAL_NOT_FOUND", "Approval was not found.", correlationId, false) };
  if (now.getTime() >= Date.parse(approval.request.expiresAt) || approval.status === "EXPIRED") {
    approval.status = "EXPIRED";
    return { status: 409, body: apiError("APPROVAL_EXPIRED", "Expired approval cannot arm failover.", correlationId, false) };
  }
  if (approval.status !== "APPROVED") {
    return { status: 403, body: apiError("APPROVAL_NOT_APPROVED", "Failover can be armed only for an APPROVED approval.", correlationId, false, { status: approval.status }) };
  }
  if (policy.planId !== approval.request.planId) {
    return { status: 409, body: apiError("PLAN_ID_MISMATCH", "Arm planId does not match the approval.", correlationId, false) };
  }
  const digest = policyDigest(policy);
  const approved = approval.request.ap4mFallbackBudgetUsd;
  const raises = greaterThan(policy.maxPerTriggerUsd, approved) || greaterThan(policy.maxDailySpendUsd, approved) || greaterThan(policy.maxPerTriggerUsd, policy.maxDailySpendUsd);
  const monitorId = `monitor_${randomUUID()}`;
  if (raises) {
    ctx.store.monitors.set(monitorId, {
      monitorId,
      status: "REJECTED",
      policyDigest: digest,
      policy,
      spentUsd: "0",
    });
    return {
      status: 200,
      body: { monitorId, status: "REJECTED", policyDigest: digest },
    };
  }
  ctx.store.monitors.set(monitorId, {
    monitorId,
    status: "ARMED",
    policyDigest: digest,
    policy,
    spentUsd: "0",
  });
  return { status: 200, body: { monitorId, status: "ARMED", policyDigest: digest } };
}

export async function disableFailover(ctx: ServiceContext, body: unknown, correlationId: string): Promise<HandlerResult> {
  if (!isRecord(body) || typeof body.monitorId !== "string" || typeof body.reason !== "string" || body.reason.length === 0) {
    return validation(correlationId, "monitorId and reason are required.");
  }
  const monitor = ctx.store.monitors.get(body.monitorId);
  if (!monitor) return { status: 404, body: apiError("NOT_FOUND", "Failover monitor was not found.", correlationId, false) };
  monitor.status = "DISABLED";
  monitor.disabledReason = body.reason;
  return { status: 200, body: { monitorId: monitor.monitorId, status: "DISABLED", policyDigest: monitor.policyDigest } };
}

function parseScenario(raw: string | undefined): FailoverScenario | undefined {
  if (!raw) return "success";
  return (SCENARIOS as readonly string[]).includes(raw) ? (raw as FailoverScenario) : undefined;
}

function findMonitor(ctx: ServiceContext, planId: string, primaryService: string, status: "ARMED" | "DISABLED") {
  let found: ArmedMonitor | undefined;
  for (const monitor of ctx.store.monitors.values()) {
    if (monitor.policy.planId === planId && monitor.policy.primaryService === primaryService && monitor.status === status) {
      found = monitor;
    }
  }
  return found;
}

function honest(run: FailoverRun): FailoverRun {
  const lyingState = run.state === "RLUSD_SETTLED" || run.state === "FALLBACK_ACTIVE";
  const lyingReceipt = run.receipts.some((receipt) => (receipt.kind === "rlusd_settlement" && receipt.confirmed) || (receipt.confirmed && isRealTxHash(receipt.transactionHash)));
  if (!lyingState && !lyingReceipt) return run;
  return {
    ...run,
    state: "UNVERIFIED",
    ap4mSpendingUsd: "0",
    receipts: run.receipts.map((receipt) => ({
      ...receipt,
      confirmed: false,
      transactionHash: isRealTxHash(receipt.transactionHash) ? SYNTHETIC_TX_HASH : receipt.transactionHash,
    })),
    errors: [
      ...run.errors,
      "Refusing RLUSD_SETTLED, FALLBACK_ACTIVE, or a confirmed chain hash. No chain observation was recorded in this process.",
    ],
  };
}

function baseRun(input: {
  planId: string;
  primaryService: string;
  fallbackService: string;
  correlationId: string;
  state: FailoverState;
  errors: string[];
  receipts?: SettlementReceipt[];
  spendingUsd?: string;
}): FailoverRun {
  return honest({
    failoverId: `failover_${randomUUID()}`,
    planId: input.planId,
    primaryService: input.primaryService,
    fallbackService: input.fallbackService,
    state: input.state,
    ap4mSpendingUsd: input.spendingUsd ?? "0",
    receipts: input.receipts ?? [],
    correlationId: input.correlationId,
    errors: input.errors,
  });
}

export async function simulateFailover(
  ctx: ServiceContext,
  body: unknown,
  now: Date,
  correlationId: string,
  scenarioHeader: string | undefined,
  quoteHeader: string | undefined,
  idempotencyKey: string,
): Promise<HandlerResult> {
  if (!isRecord(body)) return validation(correlationId, "JSON object body is required.");
  const { planId, primaryService, fallbackService, failureMode } = body;
  if (typeof planId !== "string" || typeof primaryService !== "string" || typeof fallbackService !== "string") {
    return validation(correlationId, "planId, primaryService, and fallbackService are required.");
  }
  if (typeof failureMode !== "string" || !(FAILURE_MODES as readonly string[]).includes(failureMode)) {
    return validation(correlationId, "failureMode must be timeout, http_500, latency_spike, or provider_down.");
  }
  const scenario = parseScenario(scenarioHeader);
  if (!scenario) return validation(correlationId, "X-Failover-Scenario is not a known fault-injector case.");
  if (quoteHeader !== undefined && !isMoney(quoteHeader)) return validation(correlationId, "X-Failover-Quote-Usd must be a decimal string.");
  const request = body as unknown as FailoverSimulateRequest;

  const armed = findMonitor(ctx, request.planId, request.primaryService, "ARMED");
  if (!armed) {
    const disabled = findMonitor(ctx, request.planId, request.primaryService, "DISABLED");
    if (disabled) {
      const run = baseRun({
        planId: request.planId,
        primaryService: request.primaryService,
        fallbackService: request.fallbackService,
        correlationId,
        state: "FAIL_CLOSED",
        errors: [`Disabled policy does not pay. Reason: ${disabled.disabledReason ?? "disabled"}.`, `correlationId=${correlationId}`],
      });
      ctx.store.failovers.set(run.failoverId, run);
      return { status: 200, body: run };
    }
    return { status: 403, body: apiError("POLICY_NOT_ARMED", "Simulate requires an armed failover policy for this plan and primary service. /simulate is a fault injector, not a live monitor.", correlationId, false) };
  }

  const approval = ctx.store.approvals.get(armed.policy.approvalId);
  if (!approval || approval.status !== "APPROVED") {
    const run = baseRun({
      planId: request.planId,
      primaryService: request.primaryService,
      fallbackService: request.fallbackService,
      correlationId,
      state: "FAIL_CLOSED",
      errors: ["Armed policy's approval is no longer APPROVED. No spend."],
    });
    ctx.store.failovers.set(run.failoverId, run);
    return { status: 200, body: run };
  }

  const transitions: FailoverState[] = ["HEALTHY", "SUSPECT", "VERIFIED_FAILURE", "SEARCHING_FALLBACK"];
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
    quality: scenario === "failing_backup" ? 0 : 1,
  });

  const prefix = `Primary failure injected (${request.failureMode}). transitions so far ${transitions.join(">")}. correlationId=${correlationId}.`;

  if (scenario === "failing_backup" || decision.outcome === "unavailable") {
    transitions.push("UNAVAILABLE");
    const run = baseRun({
      planId: request.planId,
      primaryService: request.primaryService,
      fallbackService: request.fallbackService,
      correlationId,
      state: "UNAVAILABLE",
      errors: [prefix, "Backup failed the availability or quality benchmark. No voucher created. No spend.", `transitions=${transitions.join(">")}`],
    });
    ctx.store.failovers.set(run.failoverId, run);
    return { status: 200, body: run };
  }

  if (scenario === "no_balance" || (scenario === "budget_exceeded" && decision.outcome === "budget_blocked") || decision.outcome === "budget_blocked") {
    transitions.push("QUOTED_402", "BUDGET_BLOCKED");
    const run = baseRun({
      planId: request.planId,
      primaryService: request.primaryService,
      fallbackService: request.fallbackService,
      correlationId,
      state: "BUDGET_BLOCKED",
      errors: [
        prefix,
        `${decision.reason} No voucher created. Spend remains ${armed.spentUsd} and does not exceed the approved cap ${approvedBudget}.`,
        `transitions=${transitions.join(">")}`,
      ],
    });
    ctx.store.failovers.set(run.failoverId, run);
    return { status: 200, body: run };
  }

  if (scenario === "invalid_voucher" || scenario === "receipt_failed" || scenario === "proof_missing") {
    const breaker = scenario === "invalid_voucher"
      ? { open: true, reasons: ["HTTP 402 was presented but the voucher is invalid. Fail closed. Not FALLBACK_ACTIVE."] }
      : scenario === "receipt_failed"
        ? { open: true, reasons: ["Circuit breaker: receipt failed. Not RLUSD_SETTLED."] }
        : { open: true, reasons: ["Circuit breaker: settlement proof missing."] };
    transitions.push("QUOTED_402", "FAIL_CLOSED");
    const run = baseRun({
      planId: request.planId,
      primaryService: request.primaryService,
      fallbackService: request.fallbackService,
      correlationId,
      state: "FAIL_CLOSED",
      errors: [prefix, ...breaker.reasons, "No spend.", `transitions=${transitions.join(">")}`],
    });
    ctx.store.failovers.set(run.failoverId, run);
    return { status: 200, body: run };
  }

  if (ctx.config.ap4mMode === "live") {
    transitions.push("QUOTED_402");
    const keyPresent = Boolean(ctx.config.ap4mAgentPrivateKey);
    const rpcPresent = Boolean(ctx.config.xrplEvmRpcUrl);
    if (!keyPresent || !rpcPresent) {
      transitions.push("UNVERIFIED");
      const run = baseRun({
        planId: request.planId,
        primaryService: request.primaryService,
        fallbackService: request.fallbackService,
        correlationId,
        state: "UNVERIFIED",
        errors: [
          prefix,
          "AP4M_MODE=live but AP4M_AGENT_PRIVATE_KEY or XRPL_EVM_RPC_URL is absent. Refusing to fabricate VoucherRedeemed or RLUSD settlement.",
          "The 402 used here is fault-injector input, not a merchant response observed on the network.",
          `Guide steps not called: requestChannel, redeemVoucher, POST /record-redemption, recordSettlement, closeChannel.`,
          `transitions=${transitions.join(">")}`,
        ],
      });
      ctx.store.failovers.set(run.failoverId, run);
      return { status: 200, body: run };
    }
    const voucher = await ctx.ap4m.createVoucher({ idempotencyKey, quotedUsd: quote, mode: "live" });
    transitions.push("UNVERIFIED");
    const run = baseRun({
      planId: request.planId,
      primaryService: request.primaryService,
      fallbackService: request.fallbackService,
      correlationId,
      state: "UNVERIFIED",
      errors: [
        prefix,
        "A local signature step ran, but it is not an AP4M EIP-712 voucher. Official x402 bodies were authentication-required, so redeemVoucher was not submitted.",
        "No VoucherRedeemed event and no RLUSD balance were observed.",
        `voucherSubmitted=${voucher.submitted}`,
        `transitions=${transitions.join(">")}`,
      ],
    });
    ctx.store.failovers.set(run.failoverId, run);
    return { status: 200, body: run };
  }

  const voucher = await ctx.ap4m.createVoucher({ idempotencyKey, quotedUsd: quote, mode: "mock" });
  transitions.push("QUOTED_402", "VOUCHER_SIGNED");
  const receipt: SettlementReceipt = {
    receiptId: `receipt_${randomUUID()}`,
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
      correlationId,
      note: "Mock voucher was not submitted. confirmed is false. This is not a VoucherRedeemed event.",
    },
  };
  const run = baseRun({
    planId: request.planId,
    primaryService: request.primaryService,
    fallbackService: request.fallbackService,
    correlationId,
    state: "VOUCHER_SIGNED",
    spendingUsd: armed.spentUsd,
    receipts: [receipt],
    errors: [
      "Live AP4M credentials and chain observation were not available. Mock mode stopped at VOUCHER_SIGNED. No voucher was submitted, no VoucherRedeemed event was observed, and no RLUSD balance was observed.",
      `correlationId=${correlationId}`,
      `transitions=${transitions.join(">")}`,
    ],
  });
  ctx.store.failovers.set(run.failoverId, run);
  return { status: 200, body: run };
}

export function getFailover(ctx: ServiceContext, failoverId: string, correlationId: string): HandlerResult {
  const run = ctx.store.failovers.get(failoverId);
  if (!run) return { status: 404, body: apiError("NOT_FOUND", "Failover run was not found.", correlationId, false) };
  return { status: 200, body: honest(run) };
}
