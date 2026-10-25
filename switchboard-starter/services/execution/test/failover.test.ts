import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { FailoverRun } from "@switchboard/contracts";
import { InMemoryAp4mClient } from "../src/ap4m.js";
import { REAL_TX_HASH } from "../src/settlement.js";
import { approvePlan, authHeaders, createTestApp, loadFixturePlan } from "./helpers.js";

const primary = "https://primary.example.invalid/infer";
const fallback = "https://fallback.example.invalid/infer";

describe("failover", () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function armedApp(env?: NodeJS.ProcessEnv, ap4m?: InMemoryAp4mClient) {
    const plan = loadFixturePlan();
    const { app } = await createTestApp({
      ...(env ? { env } : {}),
      ...(ap4m ? { ap4m } : {}),
    });
    apps.push(app);
    const { approval } = await approvePlan(app, plan, `arm-${Math.random()}`);
    const arm = await app.inject({
      method: "POST",
      url: "/v1/failover/arm",
      headers: authHeaders(`arm-${approval.approvalId}`),
      payload: {
        planId: plan.planId,
        approvalId: approval.approvalId,
        primaryService: primary,
        fallbackOfferId: "cap_demo_001",
        maxPerTriggerUsd: "25",
        maxDailySpendUsd: "100",
        triggerRuleId: "primary_down",
      },
    });
    return { app, plan, approval, arm };
  }

  async function simulate(
    app: FastifyInstance,
    planId: string,
    key: string,
    scenario?: string,
    quote?: string,
  ) {
    return app.inject({
      method: "POST",
      url: "/v1/failover/simulate",
      headers: authHeaders(key, {
        ...(scenario ? { "x-failover-scenario": scenario } : {}),
        ...(quote ? { "x-failover-quote-usd": quote } : {}),
      }),
      payload: {
        planId,
        primaryService: primary,
        fallbackService: fallback,
        failureMode: "provider_down",
      },
    });
  }

  it("serves health without auth and refuses to arm above the approved budget", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const health = await app.inject({ method: "GET", url: "/healthz" });
    expect(health.json()).toEqual({ status: "ok", service: "execution", version: "1.0.0" });
    const plan = loadFixturePlan();
    const { approval } = await approvePlan(app, plan, "cap");
    const raised = await app.inject({
      method: "POST",
      url: "/v1/failover/arm",
      headers: authHeaders("raise"),
      payload: {
        planId: plan.planId,
        approvalId: approval.approvalId,
        primaryService: primary,
        fallbackOfferId: "cap_demo_001",
        maxPerTriggerUsd: "150",
        maxDailySpendUsd: "150",
        triggerRuleId: "primary_down",
      },
    });
    expect(raised.json()).toMatchObject({ status: "REJECTED" });
    expect(raised.json().policyDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const unarmed = await simulate(app, plan.planId, "no-arm", "success");
    expect(unarmed.statusCode).toBe(403);
    expect(unarmed.json()).toMatchObject({ code: "POLICY_NOT_ARMED" });
  });

  it("stops a disabled policy and walks the honest mock path once per idempotency key", async () => {
    const client = new InMemoryAp4mClient({ ap4mMode: "mock" });
    const { app, plan, arm } = await armedApp(undefined, client);
    expect(arm.json()).toMatchObject({ status: "ARMED" });
    const monitorId = arm.json().monitorId as string;
    const digest = arm.json().policyDigest as string;

    const first = await simulate(app, plan.planId, "sim-1");
    const second = await simulate(app, plan.planId, "sim-1");
    expect(first.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(client.creations).toHaveLength(1);
    const run = first.json() as FailoverRun;
    expect(run.state).toBe("VOUCHER_SIGNED");
    expect(run.state).not.toBe("RLUSD_SETTLED");
    expect(run.state).not.toBe("FALLBACK_ACTIVE");
    expect(run.ap4mSpendingUsd).toBe("0");
    expect(run.receipts).toHaveLength(1);
    expect(run.receipts[0]).toMatchObject({ confirmed: false, transactionHash: "synthetic_not_a_transaction" });
    expect(run.receipts[0]?.metadata.mode).toBe("mock");
    expect(run.errors.join(" ")).toContain("Live AP4M credentials and chain observation were not available");
    expect(run.receipts.some((receipt) => receipt.transactionHash && REAL_TX_HASH.test(receipt.transactionHash))).toBe(false);
    const fetched = await app.inject({
      method: "GET",
      url: `/v1/failover/runs/${run.failoverId}`,
      headers: authHeaders(),
    });
    expect(fetched.json()).toMatchObject({ failoverId: run.failoverId, state: "VOUCHER_SIGNED" });

    const disabled = await app.inject({
      method: "POST",
      url: "/v1/failover/disable",
      headers: authHeaders("off"),
      payload: { monitorId, reason: "operator halt" },
    });
    expect(disabled.json()).toEqual({ monitorId, status: "DISABLED", policyDigest: digest });
    const after = await simulate(app, plan.planId, "sim-2", "success");
    expect(after.json()).toMatchObject({ state: "FAIL_CLOSED", ap4mSpendingUsd: "0" });
    expect(after.json().errors.join(" ")).toContain("Disabled policy does not pay");
    expect(client.creations).toHaveLength(1);
  });

  it("covers failing backup, invalid voucher, and budget or balance blocks with no spend", async () => {
    const client = new InMemoryAp4mClient({ ap4mMode: "mock" });
    const { app, plan } = await armedApp(undefined, client);
    const backup = await simulate(app, plan.planId, "backup", "failing_backup");
    expect(backup.json()).toMatchObject({ state: "UNAVAILABLE", ap4mSpendingUsd: "0", receipts: [] });
    expect(["UNAVAILABLE", "FAIL_CLOSED"]).toContain(backup.json().state);

    const invalid = await simulate(app, plan.planId, "invalid", "invalid_voucher");
    expect(invalid.json().state).toBe("FAIL_CLOSED");
    expect(invalid.json().state).not.toBe("FALLBACK_ACTIVE");
    expect(invalid.json().ap4mSpendingUsd).toBe("0");
    expect(invalid.json().errors.join(" ")).toContain("voucher is invalid");

    const balance = await simulate(app, plan.planId, "balance", "no_balance");
    expect(balance.json()).toMatchObject({ state: "BUDGET_BLOCKED", ap4mSpendingUsd: "0" });

    const budget = await simulate(app, plan.planId, "budget", "budget_exceeded", "1000");
    expect(budget.json()).toMatchObject({ state: "BUDGET_BLOCKED", ap4mSpendingUsd: "0" });
    expect(Number(budget.json().ap4mSpendingUsd)).toBeLessThanOrEqual(100);
    expect(budget.json().errors.join(" ")).toContain("1000");
    expect(client.creations).toHaveLength(0);

    const proof = await simulate(app, plan.planId, "proof", "proof_missing");
    expect(proof.json().state).toBe("FAIL_CLOSED");
    expect(proof.json().state).not.toBe("RLUSD_SETTLED");
    const receiptFailed = await simulate(app, plan.planId, "receipt", "receipt_failed");
    expect(receiptFailed.json().state).toBe("FAIL_CLOSED");
  });

  it("returns UNVERIFIED in live mode without a key or RPC and does not leak a key", async () => {
    const secret = "test-key-do-not-log";
    const client = new InMemoryAp4mClient({ ap4mMode: "live", ap4mAgentPrivateKey: secret, xrplEvmRpcUrl: "https://rpc.example.invalid" });
    const sign = vi.spyOn(client, "createVoucher");
    const { app, plan } = await armedApp({ AP4M_MODE: "live" });
    const absent = await simulate(app, plan.planId, "live-absent");
    expect(absent.json().state).toBe("UNVERIFIED");
    expect(JSON.stringify(absent.json())).not.toContain("VoucherRedeemed event was observed");
    expect(absent.json().errors.join(" ")).toContain("AP4M_AGENT_PRIVATE_KEY or XRPL_EVM_RPC_URL is absent");
    expect(absent.json().receipts.some((receipt: { kind: string; confirmed: boolean }) => receipt.kind === "rlusd_settlement" && receipt.confirmed)).toBe(false);
    expect(absent.json().state).not.toBe("RLUSD_SETTLED");

    const { app: withKey } = await armedApp({
      AP4M_MODE: "live",
      AP4M_AGENT_PRIVATE_KEY: secret,
      XRPL_EVM_RPC_URL: "https://rpc.example.invalid",
    }, client);
    const present = await simulate(withKey, plan.planId, "live-present");
    expect(present.json().state).toBe("UNVERIFIED");
    expect(present.json().state).not.toBe("FALLBACK_ACTIVE");
    expect(JSON.stringify(present.json())).not.toContain(secret);
    expect(sign).toHaveBeenCalled();
    expect(present.json().errors.join(" ")).toContain("not an AP4M EIP-712 voucher");
  });
});
