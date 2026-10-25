import { randomUUID } from "node:crypto";
import Fastify, { type FastifyReply } from "fastify";
import { createAp4mClient, type Ap4mPaymentClient } from "./ap4m.js";
import { runAp4mPayment } from "./ap4m-live.js";
import { SAMPLE_XRPL_TRANSACTIONS, previewXrplTransaction } from "./clear-sign.js";
import { loadConfig, type AppConfig } from "./config.js";
import { readNetwork } from "./network.js";
import { sponsorStatus } from "./sponsors.js";
import { apiError, correlationId, headerString, HttpError, type HandlerResult } from "./errors.js";
import { confirmApproval, createApproval, createRun, getRun, readNow, type ServiceContext } from "./execution.js";
import { armFailover, disableFailover, FAILOVER_QUOTE_HEADER, FAILOVER_SCENARIO_HEADER, getFailover, simulateFailover } from "./failover.js";
import { withIdempotency } from "./idempotency.js";
import { loadAuthKeys } from "./keys.js";
import { DefaultRevalidation, HttpMarketsClient, type MarketsClient, type QuoteRevalidationClient } from "./markets.js";
import { createSettlementClient, type ExchangeSettlementClient } from "./settlement.js";
import { createMemoryStore, type MemoryStore } from "./store.js";
import { TokenService } from "./tokens.js";

export interface BuildAppOptions {
  config?: AppConfig;
  env?: NodeJS.ProcessEnv;
  store?: MemoryStore;
  markets?: MarketsClient;
  revalidation?: QuoteRevalidationClient;
  settlement?: ExchangeSettlementClient;
  ap4m?: Ap4mPaymentClient;
  fetchImpl?: typeof fetch;
  clock?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function send(reply: FastifyReply, result: HandlerResult) {
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) reply.header(key, value);
  }
  return reply.code(result.status).send(result.body);
}

function scopeOf(method: string, url: string | undefined, fallback: string): string {
  return `${method} ${url ?? fallback}`;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig(options.env ?? process.env);
  const store = options.store ?? createMemoryStore();
  const keys = await loadAuthKeys(config.privateKeyPath, config.publicKeyPath);
  const tokens = new TokenService(keys, store);
  const ctx: ServiceContext = {
    config,
    store,
    tokens,
    markets: options.markets ?? new HttpMarketsClient({
      baseUrl: config.marketsBaseUrl,
      bearer: config.bearer,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    }),
    revalidation: options.revalidation ?? new DefaultRevalidation(),
    settlement: options.settlement ?? createSettlementClient(config.exchangeAbiPath),
    ap4m: options.ap4m ?? createAp4mClient(config),
    clock: options.clock ?? (() => new Date()),
  };

  const app = Fastify({ logger: false });
  app.addHook("onRequest", (request, reply, done) => {
    const pathOnly = request.url.split("?")[0] ?? request.url;
    if (pathOnly === "/healthz" || pathOnly === "/.well-known/execution-jwks.json") {
      done();
      return;
    }
    const header = headerString(request.headers.authorization);
    if (header !== `Bearer ${config.bearer}`) {
      const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
      reply.code(401).send(apiError("UNAUTHORIZED", "Bearer token was missing or did not match.", correlation, false));
      return;
    }
    done();
  });
  app.setErrorHandler((error, request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
    if (error instanceof HttpError) return reply.code(error.statusCode).send(error.body);
    return reply.code(500).send(apiError("INTERNAL", "Internal error", correlation, true));
  });

  app.get("/healthz", async () => ({ status: "ok", service: "execution", version: config.serviceVersion }));

  app.get("/v1/execution/network", async () => readNetwork(process.env));

  app.get("/v1/execution/sponsors", async () => sponsorStatus(process.env));

  app.post("/v1/execution/ap4m/pay", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
    const headerKey = headerString(request.headers["idempotency-key"]);
    if (!headerKey) {
      return reply.code(400).send(apiError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.", correlation, false));
    }
    const report = await runAp4mPayment(process.env);
    return { correlationId: correlation, ...report };
  });

  app.get("/v1/execution/clear-sign/samples", async () => ({
    disclaimer: previewXrplTransaction(SAMPLE_XRPL_TRANSACTIONS[0]).disclaimer,
    previews: SAMPLE_XRPL_TRANSACTIONS.map((tx) => previewXrplTransaction(tx)),
  }));

  app.post("/v1/execution/clear-sign/preview", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
    if (!isRecord(request.body) || !isRecord(request.body.tx)) {
      return reply.code(400).send(apiError("VALIDATION_ERROR", "Body must be { tx: XRPL transaction object }.", correlation, false));
    }
    return { preview: previewXrplTransaction(request.body.tx) };
  });

  app.get("/.well-known/execution-jwks.json", async () => tokens.jwks());

  app.get("/v1/execution/revocations", async () => ({
    behavior: "in-memory",
    note: "Revoked jti values are process memory only and disappear on restart. Outstanding execution authorizations are revoked when an approval expires or is unsupported after issuance, and when a run fails closed (FAILED, PARTIAL, or REAPPROVAL_REQUIRED). A later run mints a new jti and must not reuse a revoked token.",
    revokedJtis: [...store.revokedJtis].sort(),
  }));

  app.post("/v1/execution/approvals", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/execution/approvals"),
      headerString(request.headers["idempotency-key"]),
      request.body,
      correlation,
      () => createApproval(ctx, request.body, correlation),
    );
    return send(reply, result);
  });

  app.post("/v1/execution/approvals/:approvalId/confirm", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
    const nowResult = readNow(headerString(request.headers["x-switchboard-now"]), ctx.clock);
    if (!nowResult.ok) return reply.code(400).send(apiError("VALIDATION_ERROR", nowResult.message, correlation, false));
    const { approvalId } = request.params as { approvalId: string };
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/execution/approvals/:approvalId/confirm"),
      headerString(request.headers["idempotency-key"]),
      request.body,
      correlation,
      () => confirmApproval(ctx, approvalId, request.body, nowResult.now, correlation),
    );
    return send(reply, result);
  });

  app.post("/v1/execution/runs", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
    const headerKey = headerString(request.headers["idempotency-key"]);
    const bodyKey = isRecord(request.body) && typeof request.body.idempotencyKey === "string" ? request.body.idempotencyKey : undefined;
    if (headerKey && bodyKey && headerKey !== bodyKey) {
      return reply.code(400).send(apiError("IDEMPOTENCY_KEY_MISMATCH", "Idempotency-Key header must match body.idempotencyKey. The header is the idempotency key.", correlation, false));
    }
    const nowResult = readNow(headerString(request.headers["x-switchboard-now"]), ctx.clock);
    if (!nowResult.ok) return reply.code(400).send(apiError("VALIDATION_ERROR", nowResult.message, correlation, false));
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/execution/runs"),
      headerKey,
      request.body,
      correlation,
      () => createRun(ctx, request.body, nowResult.now, correlation),
    );
    return send(reply, result);
  });

  app.get("/v1/execution/runs/:runId", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
    const { runId } = request.params as { runId: string };
    return send(reply, getRun(ctx, runId, correlation));
  });

  app.post("/v1/failover/arm", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
    const nowResult = readNow(headerString(request.headers["x-switchboard-now"]), ctx.clock);
    if (!nowResult.ok) return reply.code(400).send(apiError("VALIDATION_ERROR", nowResult.message, correlation, false));
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/failover/arm"),
      headerString(request.headers["idempotency-key"]),
      request.body,
      correlation,
      () => armFailover(ctx, request.body, nowResult.now, correlation),
    );
    return send(reply, result);
  });

  app.post("/v1/failover/disable", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/failover/disable"),
      headerString(request.headers["idempotency-key"]),
      request.body,
      correlation,
      () => disableFailover(ctx, request.body, correlation),
    );
    return send(reply, result);
  });

  app.post("/v1/failover/simulate", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
    const headerKey = headerString(request.headers["idempotency-key"]);
    const scenario = headerString(request.headers[FAILOVER_SCENARIO_HEADER]);
    const quote = headerString(request.headers[FAILOVER_QUOTE_HEADER]);
    const nowResult = readNow(headerString(request.headers["x-switchboard-now"]), ctx.clock);
    if (!nowResult.ok) return reply.code(400).send(apiError("VALIDATION_ERROR", nowResult.message, correlation, false));
    const result = await withIdempotency(
      store,
      scopeOf(request.method, request.routeOptions.url, "/v1/failover/simulate"),
      headerKey,
      { body: request.body ?? null, scenario: scenario ?? "success", quoteUsd: quote ?? null },
      correlation,
      () => simulateFailover(
        ctx,
        request.body,
        nowResult.now,
        correlation,
        headerString(request.headers[FAILOVER_SCENARIO_HEADER]),
        headerString(request.headers[FAILOVER_QUOTE_HEADER]),
        headerKey ?? "",
      ),
    );
    return send(reply, result);
  });

  app.get("/v1/failover/runs/:failoverId", async (request, reply) => {
    const correlation = correlationId(request.headers, () => `corr_${randomUUID()}`);
    const { failoverId } = request.params as { failoverId: string };
    return send(reply, getFailover(ctx, failoverId, correlation));
  });

  return app;
}
