import { createHmac, randomUUID } from "node:crypto";
import type { FailoverState, SettlementReceipt } from "@switchboard/contracts";
import type { AppConfig } from "./config.js";
import { addMoney, greaterThan, isMoney, minDecimal } from "./money.js";
import { canonicalJson } from "./plan-hash.js";
import { isRealTxHash } from "./settlement.js";

/**
 * Names that appear in the public integration guide (https://hackathon.ap4m.build/integration-guide).
 * /docs/x402.md and /docs/api-reference.md returned authentication required, so this client does not
 * call an SDK and does not invent request bodies for these steps.
 */
export const AP4M_GUIDE_STEPS = [
  "requestChannel",
  "EIP-712 voucher signature",
  "redeemVoucher",
  "POST /record-redemption",
  "recordSettlement",
  "closeChannel",
] as const;

export interface Http402Challenge {
  status: 402;
  raw: unknown;
  amountUsd?: string;
  currency?: string;
  network?: string;
  recipient?: string;
  quality?: number;
  /** True when the fault injector supplied the challenge instead of a merchant response. */
  injectorSupplied: boolean;
}

function firstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/**
 * Heuristic parser only. Official x402 field names were not available (docs authentication-required).
 * Recognizes a few common labels and always keeps the raw body.
 */
export function parseHttp402(status: number, body: unknown): Http402Challenge | undefined {
  if (status !== 402) return undefined;
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const amount = firstString(source, ["amountUsd", "amount", "maxAmountRequired", "value"]);
  const qualityRaw = source.quality ?? source.qualityScore;
  const quality = typeof qualityRaw === "number" ? qualityRaw : undefined;
  return {
    status: 402,
    raw: body,
    amountUsd: amount && isMoney(amount) ? amount : undefined,
    currency: firstString(source, ["currency", "asset"]),
    network: firstString(source, ["network", "chain"]),
    recipient: firstString(source, ["recipient", "payTo", "payout"]),
    quality,
    injectorSupplied: false,
  };
}

export interface PaymentDecision {
  pay: boolean;
  outcome: "pay" | "budget_blocked" | "fail_closed" | "unavailable";
  reason: string;
}

export function decide402(input: {
  quotedUsd?: string;
  remainingBudgetUsd: string;
  maxPerTriggerUsd: string;
  quality?: number;
  minQuality?: number;
  fallbackHealthy: boolean;
  voucherValid: boolean;
  balanceAvailable: boolean;
}): PaymentDecision {
  const minQuality = input.minQuality ?? 0.5;
  if (!input.fallbackHealthy) {
    return { pay: false, outcome: "unavailable", reason: "Fallback failed the availability or quality benchmark." };
  }
  if (input.quality !== undefined && input.quality < minQuality) {
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
      reason: `Budget exceeded: quote ${input.quotedUsd} exceeds remaining cap ${cap}.`,
    };
  }
  if (!input.voucherValid) {
    return { pay: false, outcome: "fail_closed", reason: "HTTP 402 was presented but the voucher is invalid." };
  }
  return { pay: true, outcome: "pay", reason: "Quote is within the preapproved cap and the fallback passed the local gates." };
}

export function circuitBreaker(input: {
  proofMissing: boolean;
  budgetExceeded: boolean;
  receiptFailed: boolean;
}): { open: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.proofMissing) reasons.push("Circuit breaker: settlement proof missing.");
  if (input.budgetExceeded) reasons.push("Circuit breaker: budget exceeded.");
  if (input.receiptFailed) reasons.push("Circuit breaker: receipt failed.");
  return { open: reasons.length > 0, reasons };
}

/**
 * Confirmed RLUSD or fallback activation requires a live chain observation.
 * Invalid or mock evidence cannot select those states.
 */
export function stateFromSettlementEvidence(
  receipt: SettlementReceipt,
  observation: { mode: "mock" | "live"; chainObserved: boolean },
): FailoverState {
  const real = isRealTxHash(receipt.transactionHash);
  const observed = observation.mode === "live" && observation.chainObserved && receipt.confirmed === true && real;
  if (!observed) return "UNVERIFIED";
  if (receipt.kind === "rlusd_settlement") return "RLUSD_SETTLED";
  if (receipt.kind === "service_unlocked") return "FALLBACK_ACTIVE";
  if (receipt.kind === "voucher_redeemed") return "VOUCHER_REDEEMED";
  return "UNVERIFIED";
}

export function authorizeSpend(spentUsd: string, quoteUsd: string, capUsd: string): { ok: boolean; nextSpentUsd: string } {
  const next = addMoney(spentUsd, quoteUsd);
  if (greaterThan(next, capUsd)) return { ok: false, nextSpentUsd: spentUsd };
  return { ok: true, nextSpentUsd: next };
}

export interface VoucherRecord {
  voucherId: string;
  submitted: false;
  signatureProduced: boolean;
}

export interface Ap4mPaymentClient {
  createVoucher(input: { idempotencyKey: string; quotedUsd: string; mode: "mock" | "live" }): Promise<VoucherRecord>;
}

export interface LocalSigner {
  sign(payload: string, privateKey: string): Promise<string>;
}

/** Local HMAC only. Not an AP4M EIP-712 voucher and never broadcast. */
export const localHmacSigner: LocalSigner = {
  async sign(payload: string, privateKey: string): Promise<string> {
    return createHmac("sha256", privateKey).update(payload).digest("hex");
  },
};

export class InMemoryAp4mClient implements Ap4mPaymentClient {
  readonly creations: string[] = [];
  private readonly byKey = new Map<string, VoucherRecord>();

  constructor(
    private readonly config: Pick<AppConfig, "ap4mAgentPrivateKey" | "xrplEvmRpcUrl" | "ap4mMode">,
    private readonly signer: LocalSigner = localHmacSigner,
  ) {}

  async createVoucher(input: { idempotencyKey: string; quotedUsd: string; mode: "mock" | "live" }): Promise<VoucherRecord> {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return existing;
    let signatureProduced = false;
    if (input.mode === "live" && this.config.ap4mAgentPrivateKey && this.config.xrplEvmRpcUrl) {
      const payload = canonicalJson({
        quotedUsd: input.quotedUsd,
        idempotencyKey: input.idempotencyKey,
        note: "not an AP4M EIP-712 voucher",
      });
      await this.signer.sign(payload, this.config.ap4mAgentPrivateKey);
      signatureProduced = true;
    }
    const record: VoucherRecord = {
      voucherId: `voucher_${randomUUID()}`,
      submitted: false,
      signatureProduced,
    };
    this.byKey.set(input.idempotencyKey, record);
    this.creations.push(record.voucherId);
    return record;
  }
}

export function createAp4mClient(config: AppConfig): Ap4mPaymentClient {
  return new InMemoryAp4mClient(config);
}
