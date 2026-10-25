/**
 * The one-process demo: strategy, markets, and execution behind a single Fastify gateway.
 * server.ts starts it locally; demo/vercel-entry.ts serves it on Vercel.
 */
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { Decimal } from "decimal.js";
import Fastify, { type FastifyInstance } from "fastify";
import { LedgerApprover, ledgerConfig, type LedgerApproval } from "./ledger.js";
import { renderPage } from "./page.js";
import { awsAgentCoreEnabled, handleInvocation } from "../services/execution/src/aws-agentcore.js";
import { SAMPLE_XRPL_TRANSACTIONS, previewXrplTransaction, type ClearSignPreview } from "../services/execution/src/clear-sign.js";
import { readNetwork, type NetworkReport } from "../services/execution/src/network.js";
import { sponsorStatus, type SponsorStatus } from "../services/execution/src/sponsors.js";
import { buildApp as buildExecution } from "../services/execution/src/app.js";
import { buildApp as buildMarkets } from "../services/markets/src/app.js";
import { buildApp as buildStrategy } from "../services/strategy/src/app.js";

if (Number(process.env.QUOTE_TTL_SECONDS ?? "0") < 900) {
  process.env.QUOTE_TTL_SECONDS = "900";
}
if (!process.env.KALSHI_ENABLED) process.env.KALSHI_ENABLED = "true";
if (!process.env.KALSHI_TIMEOUT_MS) process.env.KALSHI_TIMEOUT_MS = "4000";
if (!(process.env.AP4M_TEAM_NAME ?? "").trim() && !(process.env.TEAM_NAME ?? "").trim()) {
  process.env.AP4M_TEAM_NAME = "Penn1";
}

const BEARER = process.env.SWITCHBOARD_DEV_BEARER?.trim() || "switchboard-dev-platform-token";
const PRIMARY = "https://primary.invalid/infer";
const FALLBACK = "https://fallback.invalid/infer";

interface Step {
  name: string;
  status: number;
  detail: string;
}

interface Proof {
  ok: boolean;
  syntheticDemo: true;
  humanConfirmed: boolean;
  steps: Step[];
  company: unknown;
  marketSearch: unknown;
  books: BookView[];
  plan: unknown;
  approval: unknown;
  run: unknown;
  failover: unknown;
  network: NetworkReport;
  clearSigning: ClearSignPreview[];
  sponsors: SponsorStatus;
  note: string;
}

interface BookView {
  instrumentId: string;
  name: string;
  settlementType: unknown;
  bids: unknown;
  asks: unknown;
  mode: unknown;
}

type PlanMode = "min_cvar" | "min_cost" | "balanced";
const PLAN_MODES: readonly PlanMode[] = ["min_cvar", "min_cost", "balanced"];

const SAMPLE_INTAKE = {
  description: "Northline runs customer-support on one primary model API. A fifteen-minute outage takes the product offline.",
  jurisdiction: "US",
  monthlyHedgeBudgetUsd: "800",
  maxTolerableTailLossUsd: "8000",
};

/** Search size used by the demo. The strategy optimizer sizes legs inside it. */
const REQUESTED_QUANTITY = "10";

const listened = new WeakMap<FastifyInstance, number>();

async function listenPort(target: FastifyInstance): Promise<number> {
  const existing = listened.get(target);
  if (existing) return existing;
  await target.listen({ port: 0, host: "127.0.0.1" });
  const address = target.server.address();
  if (!address || typeof address === "string") throw new Error("In-process service did not bind a port.");
  listened.set(target, address.port);
  return address.port;
}

function injectFetch(target: FastifyInstance): typeof fetch {
  return async (input, init) => {
    const port = await listenPort(target);
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://127.0.0.1");
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const method = init?.method ?? "GET";
    const payload = init?.body === undefined || init?.body === null ? undefined : String(init.body);
    return await new Promise((resolve, reject) => {
      const req = httpRequest({
        hostname: "127.0.0.1",
        port,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const out = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value === undefined) continue;
            out.set(key, Array.isArray(value) ? value.join(", ") : String(value));
          }
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 500, headers: out }));
        });
      });
      req.on("error", reject);
      if (payload !== undefined) req.write(payload);
      req.end();
    });
  };
}

async function call(app: FastifyInstance, method: "GET" | "POST", path: string, body?: unknown, extra?: Record<string, string>) {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${BEARER}`,
    ...extra,
  };
  if (method === "POST") {
    headers["content-type"] = "application/json";
    headers["idempotency-key"] = headers["idempotency-key"] ?? randomUUID();
  }
  const response = await injectFetch(app)(`http://in-process.local${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text.slice(0, 400) };
    }
  }
  return { status: response.status, body: parsed };
}

function detailOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.code === "string") return record.code;
    if (typeof record.status === "string") return record.status;
    if (typeof record.planId === "string") return record.planId;
    if (typeof record.companyId === "string") return record.companyId;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The public invocation route cannot spend until this flag is set, even after keys are pasted. */
function invocationEnv(): NodeJS.ProcessEnv {
  if (process.env.AP4M_ALLOW_PUBLIC_PAY === "true") return process.env;
  const blocked: NodeJS.ProcessEnv = { ...process.env, AP4M_MODE: "mock" };
  delete blocked.AP4M_AGENT_PRIVATE_KEY;
  delete blocked.AGENT_PRIVATE_KEY;
  return blocked;
}

export async function createDemoApp() {
  const ledgerSettings = ledgerConfig(process.env);
  const ledger = ledgerSettings ? new LedgerApprover(ledgerSettings) : null;
  const strategy = buildStrategy();
  const markets = await buildMarkets({ kalshiEnabled: process.env.KALSHI_ENABLED !== "false" });
  const execution = await buildExecution({
    fetchImpl: injectFetch(markets),
    config: undefined,
    // Execution accepts ledger_dmk_verified only from this gateway, and only after the gateway has
    // verified the device signature itself. Without the emulator configured, it stays off.
    env: { ...process.env, LEDGER_DMK_VERIFIED: ledger ? "true" : "false" },
  });
  await strategy.ready();
  await markets.ready();
  await execution.ready();

  const gateway = Fastify({ logger: false });

  gateway.get("/healthz", async () => ({ status: "ok", service: "switchboard-demo" }));

  gateway.get("/demo/network", async () => readNetwork(process.env));

  gateway.get("/demo/clear-sign", async () => ({
    previews: SAMPLE_XRPL_TRANSACTIONS.map((tx) => previewXrplTransaction(tx)),
  }));

  gateway.get("/demo/sponsors", async () => sponsorStatus(process.env));

  gateway.get("/demo/ledger/status", async () => ledger ? ledger.status() : {
    enabled: false,
    reachable: false,
    emulator: false,
    model: null,
    address: null,
    note: "Ledger approval is not configured on this deploy. Plans are approved in the app.",
  });

  gateway.get("/demo/ledger/screen", async (_request, reply) => {
    if (!ledger) return reply.code(404).send({ message: "Ledger approval is not configured." });
    try {
      const response = await ledger.screenshot();
      if (!response.ok) return reply.code(502).send({ message: "The emulator did not return its screen." });
      return reply.type("image/png").header("cache-control", "no-store").send(Buffer.from(await response.arrayBuffer()));
    } catch {
      return reply.code(502).send({ message: "The emulator did not answer." });
    }
  });

  gateway.post("/demo/ledger/finger", async (request, reply) => {
    if (!ledger) return reply.code(404).send({ message: "Ledger approval is not configured." });
    const body = isRecord(request.body) ? request.body : {};
    const action = body.action;
    const x = Number(body.x);
    const y = Number(body.y);
    if ((action !== "press" && action !== "release") || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 2000 || y > 2000) {
      return reply.code(400).send({ message: "Send action press or release, with integer x and y." });
    }
    await ledger.finger(action, x, y).catch(() => undefined);
    return { ok: true };
  });

  /** AWS AgentCore track is parked. Set AWS_AGENTCORE_ENABLED=true to serve these routes again. */
  if (awsAgentCoreEnabled(process.env)) {
    gateway.get("/ping", async () => ({
      status: "Healthy",
      deployed: false,
      note: "Local AgentCore HTTP contract on this process. This is not an AWS runtime.",
    }));

    gateway.post("/invocations", async (request, reply) => {
      const resourceUrl = isRecord(request.body) && typeof request.body.resourceUrl === "string"
        ? request.body.resourceUrl
        : undefined;
      if (resourceUrl) {
        let parsed: URL;
        try {
          parsed = new URL(resourceUrl);
        } catch {
          return reply.code(400).send({
            protocol: "agentcore-http",
            pay: false,
            awsDeployed: false,
            reason: "resourceUrl must be an https URL.",
          });
        }
        if (parsed.protocol !== "https:") {
          return reply.code(400).send({
            protocol: "agentcore-http",
            pay: false,
            awsDeployed: false,
            reason: "resourceUrl must use https.",
          });
        }
      }
      return handleInvocation(request.body, invocationEnv());
    });
  }

  gateway.post("/demo/proof", async (request, reply) => {
    const confirmed = isRecord(request.body) && request.body.confirm === true;
    if (!confirmed) {
      return reply.code(400).send({
        ok: false,
        message: "Send { \"confirm\": true }. That click is the human approval for this sandbox run. It is not a Ledger signature.",
      });
    }
    const proof = await runProof(strategy, markets, execution);
    return reply.code(proof.ok ? 200 : 409).send(proof);
  });

  /** Step 1 of the page: the company's own description and limits. The strategy service validates the fields. */
  gateway.post("/demo/analyze", async (request, reply) => {
    if (!isRecord(request.body)) {
      return reply.code(400).send({ message: "Send a JSON object with description, jurisdiction, monthlyHedgeBudgetUsd, and maxTolerableTailLossUsd." });
    }
    const { description, jurisdiction, monthlyHedgeBudgetUsd, maxTolerableTailLossUsd } = request.body;
    const analyzed = await call(strategy, "POST", "/v1/companies/analyze", {
      description,
      jurisdiction,
      monthlyHedgeBudgetUsd,
      maxTolerableTailLossUsd,
    });
    return reply.code(analyzed.status).send(analyzed.body);
  });

  /** Step 2: search, plan, and read the sandbox books. Nothing is approved or ordered here. */
  gateway.post("/demo/quote", async (request, reply) => {
    const input = readPlanInput(request.body);
    if (typeof input === "string") return reply.code(400).send({ message: input });
    const quoted = await quoteAndPlan(strategy, markets, input.company, input.mode, []);
    if (!quoted.ok) return reply.code(quoted.status >= 400 ? quoted.status : 502).send({ message: quoted.message });
    return { search: quoted.search, plan: quoted.plan, books: quoted.books };
  });

  /**
   * Step 3: the click is the human approval. Quotes live in process memory, so the plan is rebuilt
   * here in one request. If the fresh legs differ from the reviewed ones, or the premium rose, the
   * route stops and returns the new plan for another review.
   */
  gateway.post("/demo/execute", async (request, reply) => {
    if (!isRecord(request.body) || request.body.confirm !== true) {
      return reply.code(400).send({ message: "Send confirm: true. That click is the in-app approval for this sandbox run. It is not a Ledger signature." });
    }
    const input = readPlanInput(request.body);
    if (typeof input === "string") return reply.code(400).send({ message: input });
    const reviewed = request.body.reviewedPlan;
    if (!isRecord(reviewed) || !Array.isArray(reviewed.legs) || typeof reviewed.estimatedTotalCostUsd !== "string") {
      return reply.code(400).send({ message: "Send the reviewedPlan you approved." });
    }
    const approval = request.body.approval === "ledger" ? "ledger" : "app";
    if (approval === "ledger" && !ledger) {
      return reply.code(400).send({ message: "Ledger approval is not configured on this deploy. Approve in the app instead." });
    }
    const steps: Step[] = [];
    const quoted = await quoteAndPlan(strategy, markets, input.company, input.mode, steps);
    if (!quoted.ok) return reply.code(quoted.status >= 400 ? quoted.status : 502).send({ message: quoted.message, steps });
    if (!sameTerms(reviewed, quoted.plan)) {
      return reply.code(409).send({
        requote: true,
        message: "The market moved since you reviewed it. Nothing was ordered. Check the new plan and approve again.",
        search: quoted.search,
        plan: quoted.plan,
        books: quoted.books,
      });
    }
    const legs = Array.isArray(quoted.plan.legs) ? quoted.plan.legs : [];
    let ledgerApproval: LedgerApproval | null = null;
    // The device signs the hash of the plan the person reviewed, so the screen matches the slip.
    // sameTerms above already guarantees the fresh plan has the same legs and no higher premium.
    const reviewedHash = typeof reviewed.planHash === "string" ? reviewed.planHash : "";
    if (approval === "ledger" && legs.length > 0 && ledger) {
      if (!/^sha256:[0-9a-f]{64}$/.test(reviewedHash)) {
        return reply.code(400).send({ message: "The reviewed plan has no valid hash to sign. Nothing was ordered." });
      }
      try {
        ledgerApproval = await ledger.approve(reviewedHash);
        steps.push({ name: "ledger", status: 200, detail: ledgerApproval.txHash });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The Ledger approval failed.";
        steps.push({ name: "ledger", status: 409, detail: message });
        return reply.code(409).send({ ok: false, steps, plan: quoted.plan, note: `${message} Nothing was ordered.`, syntheticDemo: true });
      }
    }
    const network = await readNetwork(process.env);
    const outcome = await executePlan(execution, quoted.plan, steps, ledgerApproval
      ? { method: "ledger_dmk_verified", signedIntent: `dmk:${reviewedHash}`, deviceProofId: ledgerApproval.txHash }
      : undefined);
    return reply.code(outcome.ok ? 200 : 409).send({
      ...outcome,
      steps,
      plan: quoted.plan,
      network,
      ledger: ledgerApproval ? { ...ledgerApproval, signedPlanHash: reviewedHash } : null,
      syntheticDemo: true,
    });
  });

  gateway.get("/", async (_request, reply) => {
    const previews = SAMPLE_XRPL_TRANSACTIONS.map((tx) => previewXrplTransaction(tx));
    return reply.type("text/html; charset=utf-8").send(renderPage(previews));
  });

  return gateway;
}

function readPlanInput(body: unknown): { company: Record<string, unknown>; mode: PlanMode } | string {
  if (!isRecord(body) || !isRecord(body.company)) return "Send the confirmed company profile from step 1.";
  const mode = body.mode;
  if (typeof mode !== "string" || !PLAN_MODES.includes(mode as PlanMode)) return "mode must be min_cvar, min_cost, or balanced.";
  return { company: body.company, mode: mode as PlanMode };
}

/** Venue, instrument or capacity offer, kind, and quantity. Quote ids are per process, so they are left out. */
function legTerms(plan: Record<string, unknown>): string[] {
  const legs = Array.isArray(plan.legs) ? plan.legs.filter(isRecord) : [];
  return legs
    .map((leg) => [leg.kind, leg.venue, leg.instrumentId ?? leg.capacityOfferId ?? "", leg.quantity].map((part) => String(part ?? "")).join("|"))
    .sort();
}

function sameTerms(reviewed: Record<string, unknown>, fresh: Record<string, unknown>): boolean {
  const before = legTerms(reviewed);
  const after = legTerms(fresh);
  if (before.length !== after.length || before.some((terms, index) => terms !== after[index])) return false;
  try {
    return new Decimal(String(fresh.estimatedTotalCostUsd)).lte(new Decimal(String(reviewed.estimatedTotalCostUsd)));
  } catch {
    return false;
  }
}

async function readBooks(markets: FastifyInstance): Promise<BookView[]> {
  const listed = await call(markets, "GET", "/v1/exchange/instruments");
  if (listed.status !== 200 || !isRecord(listed.body) || !Array.isArray(listed.body.instruments)) return [];
  const books: BookView[] = [];
  for (const instrument of listed.body.instruments.filter(isRecord)) {
    if (typeof instrument.instrumentId !== "string") continue;
    const book = await call(markets, "GET", `/v1/exchange/orderbook/${encodeURIComponent(instrument.instrumentId)}`);
    if (book.status !== 200 || !isRecord(book.body)) continue;
    books.push({
      instrumentId: instrument.instrumentId,
      name: typeof instrument.name === "string" ? instrument.name : instrument.instrumentId,
      settlementType: instrument.settlementType,
      bids: book.body.bids,
      asks: book.body.asks,
      mode: book.body.mode,
    });
  }
  return books;
}

type Quoted =
  | { ok: true; search: unknown; plan: Record<string, unknown>; books: BookView[] }
  | { ok: false; stage: "search" | "plan"; status: number; message: string; search?: unknown };

async function quoteAndPlan(
  strategy: FastifyInstance,
  markets: FastifyInstance,
  company: Record<string, unknown>,
  mode: PlanMode,
  steps: Step[],
): Promise<Quoted> {
  const exposureIds = Array.isArray(company.exposures)
    ? company.exposures.map((exposure) => isRecord(exposure) && typeof exposure.exposureId === "string" ? exposure.exposureId : "").filter(Boolean)
    : [];
  const search = await call(markets, "POST", "/v1/markets/search", {
    companyId: company.companyId,
    exposureIds,
    requestedQuantity: REQUESTED_QUANTITY,
    jurisdiction: typeof company.jurisdiction === "string" ? company.jurisdiction : "US",
    includeReferenceMarkets: true,
  });
  steps.push({ name: "search", status: search.status, detail: detailOf(search.body, "search") });
  if (search.status !== 200) {
    return { ok: false, stage: "search", status: search.status, message: messageOf(search.body, "Market search failed. No plan was created.") };
  }

  const generated = await call(strategy, "POST", "/v1/strategies/generate", {
    company,
    marketSearch: search.body,
    mode,
  });
  steps.push({ name: "plan", status: generated.status, detail: detailOf(generated.body, "plan") });
  if (generated.status !== 200 || !isRecord(generated.body) || typeof generated.body.planHash !== "string") {
    return {
      ok: false,
      stage: "plan",
      status: generated.status,
      search: search.body,
      message: messageOf(generated.body, "Strategy did not return a plan. No order was submitted."),
    };
  }
  return { ok: true, search: search.body, plan: generated.body, books: await readBooks(markets) };
}

interface Executed {
  ok: boolean;
  note: string;
  approval: unknown;
  run: unknown;
  failover: unknown;
}

/** Approval, app_manual confirmation, sandbox orders, failover arm, and the mock failover. */
interface ApprovalConfirm {
  method: "app_manual" | "ledger_dmk_verified";
  signedIntent: string;
  deviceProofId?: string;
}

async function executePlan(
  execution: FastifyInstance,
  plan: Record<string, unknown>,
  steps: Step[],
  approval: ApprovalConfirm = { method: "app_manual", signedIntent: `app_manual:${String(plan.planHash)}` },
): Promise<Executed> {
  const outcome: Executed = { ok: false, note: "", approval: null, run: null, failover: null };
  const legs = Array.isArray(plan.legs) ? plan.legs.filter(isRecord) : [];
  if (legs.length === 0) {
    steps.push({ name: "orders", status: 200, detail: "No-trade plan. Nothing to approve." });
    return { ...outcome, ok: true, note: "The optimizer returned a no-trade plan. That is a valid result. No order was submitted." };
  }

  const venues = [...new Set(legs.map((leg) => leg.venue).filter((venue): venue is string => typeof venue === "string"))];
  const approvalBody = {
    planId: plan.planId,
    planHash: plan.planHash,
    expiresAt: plan.expiresAt,
    maxTotalSpendUsd: plan.estimatedTotalCostUsd,
    maxCollateralUsd: plan.budgetUsd,
    allowedVenues: venues,
    // Inside the 20 RLUSD AP4M allocation for team Penn1, with room for retries.
    ap4mFallbackBudgetUsd: "10",
    plan,
  };
  const created = await call(execution, "POST", "/v1/execution/approvals", approvalBody);
  steps.push({ name: "approval", status: created.status, detail: detailOf(created.body, "approval") });
  if (created.status !== 200 || !isRecord(created.body) || typeof created.body.approvalId !== "string") {
    return { ...outcome, note: "Execution did not open an approval. No order was submitted." };
  }
  const confirmed = await call(execution, "POST", `/v1/execution/approvals/${encodeURIComponent(created.body.approvalId)}/confirm`, {
    ...approval,
  });
  steps.push({ name: "confirm", status: confirmed.status, detail: detailOf(confirmed.body, "confirm") });
  if (!isRecord(confirmed.body) || confirmed.body.status !== "APPROVED") {
    return { ...outcome, approval: confirmed.body, note: "Execution did not return APPROVED. No order was submitted." };
  }
  outcome.approval = confirmed.body;

  const idempotencyKey = randomUUID();
  const run = await call(execution, "POST", "/v1/execution/runs", {
    plan,
    approvalId: created.body.approvalId,
    idempotencyKey,
  }, { "idempotency-key": idempotencyKey });
  steps.push({ name: "run", status: run.status, detail: detailOf(run.body, "run") });
  if (run.status !== 200) {
    return { ...outcome, run: run.body, note: "The approved plan was not executed. No live fill is claimed." };
  }
  outcome.run = run.body;

  const armed = await call(execution, "POST", "/v1/failover/arm", {
    planId: plan.planId,
    approvalId: created.body.approvalId,
    primaryService: PRIMARY,
    fallbackOfferId: "cap_sandbox_standby",
    maxPerTriggerUsd: "10",
    maxDailySpendUsd: "10",
    triggerRuleId: "primary_down",
  });
  steps.push({ name: "arm", status: armed.status, detail: detailOf(armed.body, "arm") });
  if (!isRecord(armed.body) || armed.body.status !== "ARMED") {
    return { ...outcome, note: "Failover was not armed. The sandbox orders above are unchanged." };
  }
  const failover = await call(execution, "POST", "/v1/failover/simulate", {
    planId: plan.planId,
    primaryService: PRIMARY,
    fallbackService: FALLBACK,
    failureMode: "provider_down",
  }, { "x-failover-scenario": "success", "x-failover-quote-usd": "1" });
  steps.push({ name: "failover", status: failover.status, detail: detailOf(failover.body, "failover") });
  outcome.failover = failover.body;
  const state = isRecord(failover.body) && typeof failover.body.state === "string" ? failover.body.state : "unknown";
  return {
    ...outcome,
    ok: failover.status === 200,
    note: state === "RLUSD_SETTLED" || state === "FALLBACK_ACTIVE"
      ? "Refusing to present this state as settled RLUSD."
      : `Sandbox orders are simulated. Failover state is ${state}. That is not a VoucherRedeemed event and not an RLUSD payout.`,
  };
}

async function runProof(strategy: FastifyInstance, markets: FastifyInstance, execution: FastifyInstance): Promise<Proof> {
  const steps: Step[] = [];
  const [network, sponsors] = await Promise.all([
    readNetwork(process.env),
    sponsorStatus(process.env),
  ]);
  const clearSigning = SAMPLE_XRPL_TRANSACTIONS.map((tx) => previewXrplTransaction(tx));
  const base = {
    syntheticDemo: true as const,
    humanConfirmed: true,
    steps,
    network,
    clearSigning,
    sponsors,
    company: null as unknown,
    marketSearch: null as unknown,
    books: [] as BookView[],
    plan: null as unknown,
    approval: null as unknown,
    run: null as unknown,
    failover: null as unknown,
  };

  const analyzed = await call(strategy, "POST", "/v1/companies/analyze", SAMPLE_INTAKE);
  steps.push({ name: "analyze", status: analyzed.status, detail: detailOf(analyzed.body, "analyze") });
  if (analyzed.status !== 200 || !isRecord(analyzed.body) || !isRecord(analyzed.body.company)) {
    return { ...base, ok: false, note: "Company analysis did not return a profile. No order was submitted." };
  }
  const company = { ...analyzed.body.company, confirmedByUser: true };
  base.company = company;

  const quoted = await quoteAndPlan(strategy, markets, company, "min_cvar", steps);
  if (!quoted.ok) {
    base.marketSearch = quoted.search ?? null;
    return {
      ...base,
      ok: false,
      note: quoted.stage === "search" ? "Market search failed. No plan was created." : "Strategy did not return a plan. No order was submitted.",
    };
  }
  base.marketSearch = quoted.search;
  base.books = quoted.books;
  base.plan = quoted.plan;

  const executed = await executePlan(execution, quoted.plan, steps);
  return {
    ...base,
    ok: executed.ok,
    note: executed.note,
    approval: executed.approval,
    run: executed.run,
    failover: executed.failover,
  };
}

function messageOf(body: unknown, fallback: string): string {
  if (isRecord(body) && typeof body.message === "string" && body.message.trim()) return body.message;
  return fallback;
}
