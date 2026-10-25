import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { authorizeSpend, circuitBreaker, decide402, InMemoryAp4mClient, parseHttp402, stateFromSettlementEvidence } from "../src/ap4m.js";
import { HttpMarketsClient } from "../src/markets.js";
import { createSettlementClient, REAL_TX_HASH } from "../src/settlement.js";

describe("ap4m decisions", () => {
  it("parses a 402 heuristically and refuses budget, quality, and invalid voucher cases", () => {
    expect(parseHttp402(200, { amountUsd: "1" })).toBeUndefined();
    const challenge = parseHttp402(402, { amountUsd: "1.50", currency: "RLUSD", quality: 0.2, recipient: "rMerchant" });
    expect(challenge).toMatchObject({ status: 402, amountUsd: "1.50", currency: "RLUSD", quality: 0.2, injectorSupplied: false });
    expect(decide402({
      quotedUsd: "1.50",
      remainingBudgetUsd: "10",
      maxPerTriggerUsd: "5",
      quality: 0.2,
      fallbackHealthy: true,
      voucherValid: true,
      balanceAvailable: true,
    }).outcome).toBe("fail_closed");
    expect(decide402({
      quotedUsd: "9",
      remainingBudgetUsd: "10",
      maxPerTriggerUsd: "5",
      fallbackHealthy: true,
      voucherValid: true,
      balanceAvailable: true,
    })).toMatchObject({ outcome: "budget_blocked", pay: false });
    expect(authorizeSpend("0", "9", "5")).toEqual({ ok: false, nextSpentUsd: "0" });
    expect(authorizeSpend("0", "4", "5")).toEqual({ ok: true, nextSpentUsd: "4" });
    expect(circuitBreaker({ proofMissing: true, budgetExceeded: false, receiptFailed: true }).open).toBe(true);
  });

  it("cannot promote invalid settlement evidence to RLUSD_SETTLED", () => {
    const fake = {
      receiptId: "r1",
      kind: "rlusd_settlement" as const,
      chainId: 1449000,
      transactionHash: `0x${"ab".repeat(32)}`,
      confirmed: true,
      observedAt: "2026-10-24T00:00:00.000Z",
      metadata: { mode: "mock" },
    };
    expect(REAL_TX_HASH.test(fake.transactionHash)).toBe(true);
    expect(stateFromSettlementEvidence(fake, { mode: "mock", chainObserved: false })).toBe("UNVERIFIED");
    expect(stateFromSettlementEvidence(fake, { mode: "live", chainObserved: false })).toBe("UNVERIFIED");
    expect(stateFromSettlementEvidence({ ...fake, confirmed: false }, { mode: "live", chainObserved: true })).toBe("UNVERIFIED");
    expect(stateFromSettlementEvidence(fake, { mode: "live", chainObserved: true })).toBe("RLUSD_SETTLED");
  });

  it("reuses a voucher id for the same idempotency key and does not log the key", async () => {
    const secret = "another-test-key";
    const signer = { sign: vi.fn(async () => "sig") };
    const client = new InMemoryAp4mClient({ ap4mMode: "live", ap4mAgentPrivateKey: secret, xrplEvmRpcUrl: "http://rpc.invalid" }, signer);
    const first = await client.createVoucher({ idempotencyKey: "voucher-key", quotedUsd: "1", mode: "live" });
    const second = await client.createVoucher({ idempotencyKey: "voucher-key", quotedUsd: "1", mode: "live" });
    expect(second.voucherId).toBe(first.voucherId);
    expect(client.creations).toHaveLength(1);
    expect(first.submitted).toBe(false);
    expect(signer.sign).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toContain(secret);
  });
});

describe("settlement client", () => {
  it("never reports a real tx hash, with or without an ABI file", async () => {
    const sandbox = createSettlementClient(undefined);
    const sandboxReceipt = await sandbox.observe({ clientOrderId: "ord", now: new Date("2026-10-24T00:00:00.000Z") });
    expect(sandbox.canReportRealTxHash).toBe(false);
    expect(sandboxReceipt.confirmed).toBe(false);
    expect(sandboxReceipt.transactionHash).not.toMatch(REAL_TX_HASH);

    const dir = mkdtempSync(path.join(tmpdir(), "sb-abi-"));
    const abiPath = path.join(dir, "exchange.json");
    writeFileSync(abiPath, JSON.stringify([{ type: "function", name: "settle" }]));
    const loaded = createSettlementClient(abiPath);
    const loadedReceipt = await loaded.observe({ clientOrderId: "ord", now: new Date("2026-10-24T00:00:00.000Z") });
    expect(loaded.mode).toBe("abi_loaded");
    expect(loaded.canReportRealTxHash).toBe(false);
    expect(loadedReceipt.confirmed).toBe(false);
    expect(loadedReceipt.transactionHash).toBe("synthetic_not_a_transaction");
  });
});

describe("markets http client", () => {
  it("sends the authorization headers and maps unreachable responses", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      clientOrderId: "c1",
      venueOrderId: "sandbox_simulated",
      status: "SIMULATED",
      filledQuantity: "0",
      averageFillPriceUsd: "0",
      syntheticDemo: false,
    }), { status: 200 }));
    const client = new HttpMarketsClient({ baseUrl: "http://markets.test", bearer: "tok", fetchImpl: fetchImpl as unknown as typeof fetch });
    const ok = await client.placeOrder({
      body: {
        approvalId: "a",
        planHash: "sha256:abc",
        quoteId: "q",
        side: "BUY",
        quantity: "1",
        limitPriceUsd: "2",
        clientOrderId: "c1",
      },
      idempotencyKey: "c1",
      authorization: "jwt",
      correlationId: "corr",
    });
    expect(ok).toMatchObject({ kind: "result", result: { status: "SIMULATED", syntheticDemo: true } });
    const call = fetchImpl.mock.calls[0] as unknown as readonly [unknown, RequestInit?] | undefined;
    const headers = new Headers(call?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer tok");
    expect(headers.get("idempotency-key")).toBe("c1");
    expect(headers.get("x-execution-authorization")).toBe("jwt");

    const stale = new HttpMarketsClient({
      baseUrl: "http://markets.test",
      bearer: "tok",
      fetchImpl: (async () => new Response(JSON.stringify({ code: "PRICE_MOVED", message: "moved" }), { status: 409 })) as typeof fetch,
    });
    expect(await stale.placeOrder({
      body: {
        approvalId: "a",
        planHash: "sha256:abc",
        quoteId: "q",
        side: "BUY",
        quantity: "1",
        limitPriceUsd: "2",
        clientOrderId: "c1",
      },
      idempotencyKey: "c1",
      authorization: "jwt",
      correlationId: "corr",
    })).toMatchObject({ kind: "reapproval" });

    const down = new HttpMarketsClient({
      baseUrl: "http://markets.test",
      bearer: "tok",
      fetchImpl: (async () => {
        throw new Error("connect ECONNREFUSED");
      }) as typeof fetch,
    });
    expect(await down.placeOrder({
      body: {
        approvalId: "a",
        planHash: "sha256:abc",
        quoteId: "q",
        side: "BUY",
        quantity: "1",
        limitPriceUsd: "2",
        clientOrderId: "c1",
      },
      idempotencyKey: "c1",
      authorization: "jwt",
      correlationId: "corr",
    })).toEqual({ kind: "unreachable" });
  });
});
