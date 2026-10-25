import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDemoApp } from "../../../demo/app.js";

const AI_SUPPORT = {
  description: "Fictional AI customer-support service that depends on primary model API",
  jurisdiction: "US",
  monthlyHedgeBudgetUsd: "800",
  maxTolerableTailLossUsd: "8000",
};
const RETAILER = { ...AI_SUPPORT, description: "Fictional retail operator with coastal stores and storm-related delivery delays" };

/** The page reads the public testnet RPC. Tests answer it locally so they never leave the machine. */
const fakeRpc: typeof fetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
  const result = body.method === "eth_chainId" ? "0x161c28" : body.method === "eth_blockNumber" ? "0x10" : [];
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
};

let app: FastifyInstance;

async function post(url: string, payload: unknown) {
  const response = await app.inject({ method: "POST", url, payload: payload as Record<string, unknown> });
  return { status: response.statusCode, body: JSON.parse(response.body) as Record<string, any> };
}

async function confirmedCompany(intake = AI_SUPPORT) {
  const analyzed = await post("/demo/analyze", intake);
  expect(analyzed.status).toBe(200);
  return { ...analyzed.body.company, confirmedByUser: true };
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fakeRpc);
  delete process.env.AWS_AGENTCORE_ENABLED;
  app = await createDemoApp();
}, 30_000);

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("demo page", () => {
  it("serves the page", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Hedge what can break your business.");
  });

  it("keeps the parked AWS routes off", async () => {
    expect((await app.inject({ method: "GET", url: "/ping" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/invocations", payload: {} })).statusCode).toBe(404);
  });
});

describe("POST /demo/analyze", () => {
  it("returns an unconfirmed profile", async () => {
    const { status, body } = await post("/demo/analyze", AI_SUPPORT);
    expect(status).toBe(200);
    expect(body.company.confirmedByUser).toBe(false);
    expect(body.company.scenarios.length).toBeGreaterThan(0);
  });

  it("rejects a budget that is not a decimal string", async () => {
    const { status, body } = await post("/demo/analyze", { ...AI_SUPPORT, monthlyHedgeBudgetUsd: "eight hundred" });
    expect(status).toBe(400);
    expect(body.message).toContain("monthlyHedgeBudgetUsd");
  });
});

describe("POST /demo/quote", () => {
  it("rejects an unknown mode", async () => {
    const { status, body } = await post("/demo/quote", { company: {}, mode: "yolo" });
    expect(status).toBe(400);
    expect(body.message).toContain("mode");
  });

  it("returns quotes, three sandbox books, and a plan without ordering", async () => {
    const company = await confirmedCompany();
    const { status, body } = await post("/demo/quote", { company, mode: "min_cvar" });
    expect(status).toBe(200);
    expect(body.search.quotes.length).toBeGreaterThan(0);
    expect(body.books).toHaveLength(3);
    expect(body.books.every((book: { mode: string }) => book.mode === "sandbox")).toBe(true);
    expect(body.plan.legs.length).toBeGreaterThan(0);
    expect(body.plan.status).not.toBe("APPROVED");
    expect(body).not.toHaveProperty("run");
  });
});

describe("POST /demo/execute", () => {
  it("needs an explicit confirm", async () => {
    const { status, body } = await post("/demo/execute", { mode: "min_cvar" });
    expect(status).toBe(400);
    expect(body.message).toContain("confirm");
  });

  it("asks for another review when the premium is higher than reviewed", async () => {
    const company = await confirmedCompany();
    const quoted = await post("/demo/quote", { company, mode: "min_cvar" });
    const reviewedPlan = { ...quoted.body.plan, estimatedTotalCostUsd: "0.01" };
    const { status, body } = await post("/demo/execute", { company, mode: "min_cvar", reviewedPlan, confirm: true });
    expect(status).toBe(409);
    expect(body.requote).toBe(true);
    expect(body).not.toHaveProperty("steps");
    expect(body.plan.planHash).toEqual(expect.any(String));
  });

  it("approves, places simulated orders, and never claims RLUSD settlement", async () => {
    const company = await confirmedCompany();
    const quoted = await post("/demo/quote", { company, mode: "min_cvar" });
    const { status, body } = await post("/demo/execute", { company, mode: "min_cvar", reviewedPlan: quoted.body.plan, confirm: true });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.steps.map((step: { name: string }) => step.name)).toEqual(["search", "plan", "approval", "confirm", "run", "arm", "failover"]);
    expect(body.steps.every((step: { status: number }) => step.status === 200)).toBe(true);
    expect(body.run.orders.every((order: { status: string; syntheticDemo: boolean }) => order.status === "SIMULATED" && order.syntheticDemo)).toBe(true);
    expect(["RLUSD_SETTLED", "FALLBACK_ACTIVE"]).not.toContain(body.failover.state);
    expect(body.note).toContain("not an RLUSD payout");
  });

  it("treats a no-trade plan as a valid result", async () => {
    const company = await confirmedCompany(RETAILER);
    const quoted = await post("/demo/quote", { company, mode: "min_cvar" });
    expect(quoted.body.plan.legs).toHaveLength(0);
    const { status, body } = await post("/demo/execute", { company, mode: "min_cvar", reviewedPlan: quoted.body.plan, confirm: true });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.steps.map((step: { name: string }) => step.name)).toEqual(["search", "plan", "orders"]);
    expect(body.note).toContain("no-trade");
  });
});

describe("Ledger approval without an emulator", () => {
  it("reports Ledger as off and keeps its routes closed", async () => {
    const status = await app.inject({ method: "GET", url: "/demo/ledger/status" });
    expect(JSON.parse(status.body)).toMatchObject({ enabled: false, reachable: false });
    expect((await app.inject({ method: "GET", url: "/demo/ledger/screen" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/demo/ledger/finger", payload: { action: "press", x: 1, y: 1 } })).statusCode).toBe(404);
  });

  it("refuses a Ledger approval and orders nothing", async () => {
    const company = await confirmedCompany();
    const quoted = await post("/demo/quote", { company, mode: "min_cvar" });
    const { status, body } = await post("/demo/execute", { company, mode: "min_cvar", reviewedPlan: quoted.body.plan, confirm: true, approval: "ledger" });
    expect(status).toBe(400);
    expect(body.message).toContain("Approve in the app");
    expect(body).not.toHaveProperty("steps");
  });
});

describe("POST /demo/proof", () => {
  it("runs the sample end to end and returns what the page renders", async () => {
    const { status, body } = await post("/demo/proof", { confirm: true });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.marketSearch.quotes.length).toBeGreaterThan(0);
    expect(body.books).toHaveLength(3);
    expect(body.sponsors).not.toHaveProperty("aws");
  });
});
