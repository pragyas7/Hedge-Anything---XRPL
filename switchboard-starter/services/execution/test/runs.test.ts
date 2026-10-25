import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ExecutionRun, HedgePlan } from "@switchboard/contracts";
import { REAL_TX_HASH } from "../src/settlement.js";
import { approvePlan, authHeaders, createTestApp, loadFixturePlan, marketsDouble } from "./helpers.js";
import { withComputedPlanHash } from "../src/plan-hash.js";

describe("execution runs", () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function ready(plan: HedgePlan = loadFixturePlan()) {
    const doubled = marketsDouble();
    const { app } = await createTestApp({ markets: doubled.markets });
    apps.push(app);
    const approved = await approvePlan(app, plan, `ok-${plan.planHash.slice(-6)}`);
    return { app, plan, placeOrder: doubled.placeOrder, approval: approved.approval };
  }

  it("does not call markets for unapproved, stale, over-budget, disallowed, or moved plans", async () => {
    const plan = loadFixturePlan();
    const doubled = marketsDouble();
    const revalidation = { check: vi.fn(async () => ({ materialPriceChange: false, quoteExpired: false })) };
    const { app } = await createTestApp({ markets: doubled.markets, revalidation });
    apps.push(app);

    const missing = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("missing"),
      payload: { plan, approvalId: "approval_missing", idempotencyKey: "missing" },
    });
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toMatchObject({ code: "APPROVAL_NOT_FOUND" });

    const pending = await app.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders("pend"),
      payload: {
        plan,
        planId: plan.planId,
        planHash: plan.planHash,
        expiresAt: "2026-12-01T00:00:00.000Z",
        maxTotalSpendUsd: "800",
        maxCollateralUsd: "5000",
        allowedVenues: ["switchboard", "capacity_provider"],
        ap4mFallbackBudgetUsd: "100",
      },
    });
    const notApproved = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("not-approved"),
      payload: { plan, approvalId: pending.json().approvalId, idempotencyKey: "not-approved" },
    });
    expect(notApproved.statusCode).toBe(403);
    expect(notApproved.json()).toMatchObject({ code: "APPROVAL_NOT_APPROVED" });

    const versioned = structuredClone(plan);
    versioned.version = 2;
    const versionRun = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("ver", { "x-switchboard-now": "2026-10-24T00:00:00.000Z" }),
      payload: { plan: versioned, approvalId: (await approvePlan(app, plan, "base")).approval.approvalId, idempotencyKey: "ver" },
    });
    expect(versionRun.statusCode).toBe(409);
    expect(versionRun.json()).toMatchObject({ code: "PLAN_VERSION_MISMATCH" });

    const hashed = structuredClone(plan);
    hashed.rationale = "changed";
    hashed.planHash = plan.planHash;
    const hashRun = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("hash"),
      payload: { plan: hashed, approvalId: (await approvePlan(app, plan, "hash-a")).approval.approvalId, idempotencyKey: "hash" },
    });
    expect(hashRun.statusCode).toBe(409);
    expect(hashRun.json()).toMatchObject({ code: "PLAN_HASH_MISMATCH" });

    const expensive = withComputedPlanHash({ ...structuredClone(plan), estimatedTotalCostUsd: "801" });
    const { approval: spendApproval } = await approvePlan(app, expensive, "spend", { maxTotalSpendUsd: "800" });
    const spend = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("spend"),
      payload: { plan: expensive, approvalId: spendApproval.approvalId, idempotencyKey: "spend" },
    });
    expect(spend.statusCode).toBe(409);
    expect(spend.json()).toMatchObject({ code: "SPEND_CAP_EXCEEDED" });

    const { approval: venueApproval } = await approvePlan(app, plan, "venue", { allowedVenues: ["kalshi"] });
    const venue = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("venue"),
      payload: { plan, approvalId: venueApproval.approvalId, idempotencyKey: "venue" },
    });
    expect(venue.statusCode).toBe(403);
    expect(venue.json()).toMatchObject({ code: "VENUE_NOT_ALLOWED" });

    const stalePlan = withComputedPlanHash({ ...structuredClone(plan), expiresAt: "2026-10-01T00:00:00.000Z" });
    const { approval: staleApproval } = await approvePlan(app, stalePlan, "stale", { expiresAt: "2026-12-01T00:00:00.000Z" }, "2026-09-01T00:00:00.000Z");
    const stale = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("stale", { "x-switchboard-now": "2026-10-24T00:00:00.000Z" }),
      payload: { plan: stalePlan, approvalId: staleApproval.approvalId, idempotencyKey: "stale" },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: "QUOTE_EXPIRED" });

    const moved = { check: vi.fn(async () => ({ materialPriceChange: true, quoteExpired: false, reason: "ask moved" })) };
    const movedMarkets = marketsDouble();
    const { app: movedApp } = await createTestApp({ markets: movedMarkets.markets, revalidation: moved });
    apps.push(movedApp);
    const { approval: movedApproval } = await approvePlan(movedApp, plan, "moved");
    const movedRun = await movedApp.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("moved"),
      payload: { plan, approvalId: movedApproval.approvalId, idempotencyKey: "moved" },
    });
    expect(movedRun.statusCode).toBe(409);
    expect(movedRun.json()).toMatchObject({ code: "REAPPROVAL_REQUIRED" });
    expect(moved.check).toHaveBeenCalled();
    expect(movedMarkets.placeOrder).not.toHaveBeenCalled();
    expect(doubled.placeOrder).not.toHaveBeenCalled();
    expect(revalidation.check).not.toHaveBeenCalled();
  });

  it("signs a sandbox EdDSA authorization and does not relabel SIMULATED", async () => {
    const { app, plan, placeOrder, approval } = await ready();
    const response = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("run-1"),
      payload: { plan, approvalId: approval.approvalId, idempotencyKey: "run-1" },
    });
    expect(response.statusCode).toBe(200);
    const run = response.json() as ExecutionRun;
    expect(run.status).toBe("ACTIVE");
    expect(run.orders).toHaveLength(1);
    expect(run.orders[0]).toMatchObject({ status: "SIMULATED", syntheticDemo: true, venueOrderId: "sandbox_simulated" });
    expect(run.orders[0]?.status).not.toBe("FILLED");
    expect(run.receipts.every((receipt) => receipt.confirmed === false)).toBe(true);
    expect(run.receipts.some((receipt) => receipt.transactionHash && REAL_TX_HASH.test(receipt.transactionHash))).toBe(false);
    expect(placeOrder).toHaveBeenCalledTimes(1);
    const sent = placeOrder.mock.calls[0]?.[0];
    expect(sent?.body).toMatchObject({
      approvalId: approval.approvalId,
      planHash: plan.planHash,
      quoteId: "quote_sb_mock_001",
      side: "BUY",
      quantity: "10",
      limitPriceUsd: "20.4",
    });
    expect(sent?.idempotencyKey).toBe(sent?.body.clientOrderId);
    expect(sent?.body.clientOrderId).toBe(`${run.runId}:leg_fin_1`);
    expect(sent?.authorization.split(".")).toHaveLength(3);
    expect(decodeProtectedHeader(sent!.authorization).alg).toBe("EdDSA");
    const claims = decodeJwt(sent!.authorization);
    expect(claims.iss).toBe("switchboard-execution");
    expect(claims.aud).toBe("markets");
    expect(claims.sub).toBe(approval.approvalId);
    expect(claims.mode).toBe("sandbox");
    expect(claims.side).toBe("BUY");
    expect(claims.maxPriceUsd).toBe("20.4");
    expect(claims.maxSpendUsd).toBe("204");
    expect(claims.exp).toBe((claims.iat as number) + 60);
    const jwks = await app.inject({ method: "GET", url: "/.well-known/execution-jwks.json" });
    expect(jwks.statusCode).toBe(200);
    expect(jwks.json().keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", alg: "EdDSA" });
    expect(jwks.json().keys[0].d).toBeUndefined();
    await jwtVerify(sent!.authorization, createLocalJWKSet(jwks.json()), { issuer: "switchboard-execution", audience: "markets" });

    const replay = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("run-1"),
      payload: { plan, approvalId: approval.approvalId, idempotencyKey: "run-1" },
    });
    expect(replay.json()).toEqual(run);
    expect(placeOrder).toHaveBeenCalledTimes(1);
    const fetched = await app.inject({
      method: "GET",
      url: `/v1/execution/runs/${run.runId}`,
      headers: authHeaders(),
    });
    expect(fetched.json()).toEqual(run);
  });

  it("revokes the failed token and mints a new one for the next run", async () => {
    const doubled = marketsDouble(async () => ({ kind: "unreachable" }));
    const { app } = await createTestApp({ markets: doubled.markets });
    apps.push(app);
    const plan = loadFixturePlan();
    const { approval } = await approvePlan(app, plan, "fail");
    const first = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("fail-1"),
      payload: { plan, approvalId: approval.approvalId, idempotencyKey: "fail-1" },
    });
    const failed = first.json() as ExecutionRun;
    expect(failed.status).toBe("FAILED");
    expect(failed.orders[0]).toMatchObject({ venueOrderId: "not_submitted", status: "REJECTED" });
    expect(failed.orders[0]?.venueOrderId).not.toMatch(REAL_TX_HASH);
    const firstJwt = doubled.placeOrder.mock.calls[0]?.[0]?.authorization as string;
    const firstJti = decodeJwt(firstJwt).jti as string;
    const revoked = await app.inject({ method: "GET", url: "/v1/execution/revocations", headers: authHeaders() });
    expect(revoked.json().revokedJtis).toContain(firstJti);
    expect(revoked.json().behavior).toBe("in-memory");

    doubled.placeOrder.mockImplementation(async (input) => ({
      kind: "result",
      result: {
        clientOrderId: input.body.clientOrderId,
        venueOrderId: "sandbox_simulated",
        status: "SIMULATED",
        filledQuantity: "0",
        averageFillPriceUsd: "0",
        syntheticDemo: true,
      },
    }));
    const second = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("fail-2"),
      payload: { plan, approvalId: approval.approvalId, idempotencyKey: "fail-2" },
    });
    expect(second.statusCode).toBe(200);
    const secondJwt = doubled.placeOrder.mock.calls[1]?.[0]?.authorization as string;
    const secondJti = decodeJwt(secondJwt).jti as string;
    expect(secondJti).not.toBe(firstJti);
    expect(decodeJwt(secondJwt).mode).toBe("sandbox");
  });

  it("stores REAPPROVAL_REQUIRED when markets reports a price move and keeps mode sandbox unless live is explicitly allowed", async () => {
    const doubled = marketsDouble(async () => ({ kind: "reapproval", reason: "PRICE_MOVED" }));
    const { app } = await createTestApp({ markets: doubled.markets });
    apps.push(app);
    const plan = withComputedPlanHash({ ...loadFixturePlan(), syntheticDemo: false });
    const { approval } = await approvePlan(app, plan, "re");
    const response = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("re-1"),
      payload: { plan, approvalId: approval.approvalId, idempotencyKey: "re-1" },
    });
    expect(response.json()).toMatchObject({ status: "REAPPROVAL_REQUIRED" });
    expect(decodeJwt(doubled.placeOrder.mock.calls[0]![0].authorization).mode).toBe("sandbox");

    const liveMarkets = marketsDouble();
    const { app: liveApp } = await createTestApp({ env: { EXECUTION_ALLOW_LIVE: "true" }, markets: liveMarkets.markets });
    apps.push(liveApp);
    const { approval: liveApproval } = await approvePlan(liveApp, plan, "live");
    await liveApp.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("live-1"),
      payload: { plan, approvalId: liveApproval.approvalId, idempotencyKey: "live-1" },
    });
    expect(decodeJwt(liveMarkets.placeOrder.mock.calls[0]![0].authorization).mode).toBe("live");
  });

  it("rejects a mismatched body idempotency key and a missing header", async () => {
    const { app, placeOrder, approval, plan } = await ready();
    const mismatch = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders("header-key"),
      payload: { plan, approvalId: approval.approvalId, idempotencyKey: "body-key" },
    });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_MISMATCH" });
    const missing = await app.inject({
      method: "POST",
      url: "/v1/execution/runs",
      headers: authHeaders(),
      payload: { plan, approvalId: approval.approvalId, idempotencyKey: "only-body" },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    expect(placeOrder).not.toHaveBeenCalled();
  });
});
