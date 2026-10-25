import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { PLACEHOLDER_PLAN_HASH } from "../src/plan-hash.js";
import { approvalPayload, approvePlan, authHeaders, createTestApp, loadFixturePlan } from "./helpers.js";

describe("approvals", () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("requires auth and an idempotency key", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const plan = loadFixturePlan();
    const missingAuth = await app.inject({ method: "POST", url: "/v1/execution/approvals", payload: approvalPayload(plan) });
    expect(missingAuth.statusCode).toBe(401);
    const missingKey = await app.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders(),
      payload: approvalPayload(plan),
    });
    expect(missingKey.statusCode).toBe(400);
    expect(missingKey.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  });

  it("rejects the placeholder hash and replays an identical create", async () => {
    const { app, placeOrder } = await createTestApp();
    apps.push(app);
    const plan = loadFixturePlan();
    const placeholder = await app.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders("ph"),
      payload: approvalPayload({ ...plan, planHash: PLACEHOLDER_PLAN_HASH }, { planHash: PLACEHOLDER_PLAN_HASH }),
    });
    expect(placeholder.statusCode).toBe(409);
    expect(placeholder.json()).toMatchObject({ code: "PLAN_HASH_MISMATCH" });

    const first = await app.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders("same"),
      payload: approvalPayload(plan),
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders("same"),
      payload: approvalPayload(plan),
    });
    expect(first.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(first.json()).toMatchObject({ status: "PENDING", method: "app_manual" });
    expect(first.json()).not.toHaveProperty("plan");
    const conflict = await app.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders("same"),
      payload: approvalPayload(plan, { maxTotalSpendUsd: "801" }),
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("keeps app_manual pending on a bad intent and approves an exact intent", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const plan = loadFixturePlan();
    const created = await app.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders("c1"),
      payload: approvalPayload(plan),
    });
    const approvalId = created.json().approvalId as string;
    const bad = await app.inject({
      method: "POST",
      url: `/v1/execution/approvals/${approvalId}/confirm`,
      headers: authHeaders("bad"),
      payload: { method: "app_manual", signedIntent: "yes" },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ code: "INVALID_SIGNED_INTENT", details: { status: "PENDING" } });
    const good = await app.inject({
      method: "POST",
      url: `/v1/execution/approvals/${approvalId}/confirm`,
      headers: authHeaders("good"),
      payload: { method: "app_manual", signedIntent: `app_manual:${plan.planHash}` },
    });
    expect(good.statusCode).toBe(200);
    expect(good.json()).toMatchObject({ status: "APPROVED", method: "app_manual" });
    expect(typeof good.json().approvedAt).toBe("string");
  });

  it("never approves ledger_agent_intent on XRPL EVM", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const plan = loadFixturePlan();
    const created = await app.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders("led"),
      payload: approvalPayload(plan),
    });
    const approvalId = created.json().approvalId as string;
    const response = await app.inject({
      method: "POST",
      url: `/v1/execution/approvals/${approvalId}/confirm`,
      headers: authHeaders("led-c"),
      payload: { method: "ledger_agent_intent", signedIntent: `app_manual:${plan.planHash}`, deviceProofId: "device-1" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "UNSUPPORTED", method: "ledger_agent_intent" });
    expect(response.json().approvedAt).toBeUndefined();
    expect(response.json().status).not.toBe("APPROVED");
    const warning = response.headers["x-switchboard-warning"];
    expect(warning).toContain("1449000");
    expect(warning).toContain("https://developers.ledger.com/docs/ai-tools/agent-intent");
    expect(String(warning).toLowerCase()).not.toContain("approved by ledger");
  });

  it("leaves ledger_dmk_verified unsupported unless the operator flag, proof, and dmk intent are all present", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const plan = loadFixturePlan();
    const { approval } = await approvePlan(app, plan, "pre");
    expect(approval.status).toBe("APPROVED");

    const created = await app.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders("dmk"),
      payload: approvalPayload(plan),
    });
    const approvalId = created.json().approvalId as string;
    const unsupported = await app.inject({
      method: "POST",
      url: `/v1/execution/approvals/${approvalId}/confirm`,
      headers: authHeaders("dmk-c"),
      payload: { method: "ledger_dmk_verified", signedIntent: `dmk:${plan.planHash}`, deviceProofId: "proof" },
    });
    expect(unsupported.json()).toMatchObject({ status: "UNSUPPORTED", method: "ledger_dmk_verified" });
    expect(unsupported.headers["x-switchboard-warning"]).toContain("No physical Ledger device");

    const { app: flagged } = await createTestApp({ env: { LEDGER_DMK_VERIFIED: "true" } });
    apps.push(flagged);
    const flaggedCreate = await flagged.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders("dmk2"),
      payload: approvalPayload(plan),
    });
    const flaggedId = flaggedCreate.json().approvalId as string;
    const missingProof = await flagged.inject({
      method: "POST",
      url: `/v1/execution/approvals/${flaggedId}/confirm`,
      headers: authHeaders("dmk2-missing"),
      payload: { method: "ledger_dmk_verified", signedIntent: `dmk:${plan.planHash}` },
    });
    expect(missingProof.json()).toMatchObject({ status: "UNSUPPORTED", method: "ledger_dmk_verified" });
    const accepted = await flagged.inject({
      method: "POST",
      url: `/v1/execution/approvals/${flaggedId}/confirm`,
      headers: authHeaders("dmk2-ok"),
      payload: { method: "ledger_dmk_verified", signedIntent: `dmk:${plan.planHash}`, deviceProofId: "operator-assertion" },
    });
    expect(accepted.json()).toMatchObject({
      status: "APPROVED",
      method: "ledger_dmk_verified",
      deviceProofId: "operator-assertion",
    });
    expect(accepted.json().method).not.toBe("ledger_agent_intent");
    expect(accepted.headers["x-switchboard-warning"]).toContain("did not observe a physical Ledger device");
  });

  it("labels external_wallet without calling it Ledger and refuses an expired approval", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const plan = loadFixturePlan();
    const created = await app.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders("ext"),
      payload: approvalPayload(plan),
    });
    const approvalId = created.json().approvalId as string;
    const external = await app.inject({
      method: "POST",
      url: `/v1/execution/approvals/${approvalId}/confirm`,
      headers: authHeaders("ext-c"),
      payload: { method: "external_wallet", signedIntent: `external_wallet:${plan.planHash}` },
    });
    expect(external.json()).toMatchObject({ status: "APPROVED", method: "external_wallet" });
    expect(external.headers["x-switchboard-warning"]).toContain("not a Ledger");

    const expiredCreate = await app.inject({
      method: "POST",
      url: "/v1/execution/approvals",
      headers: authHeaders("exp"),
      payload: approvalPayload(plan, { expiresAt: "2026-10-01T00:00:00.000Z" }),
    });
    const expiredId = expiredCreate.json().approvalId as string;
    const expired = await app.inject({
      method: "POST",
      url: `/v1/execution/approvals/${expiredId}/confirm`,
      headers: authHeaders("exp-c", { "x-switchboard-now": "2026-10-24T00:00:00.000Z" }),
      payload: { method: "app_manual", signedIntent: `app_manual:${plan.planHash}` },
    });
    expect(expired.statusCode).toBe(409);
    expect(expired.json()).toMatchObject({ code: "APPROVAL_EXPIRED" });
  });
});
