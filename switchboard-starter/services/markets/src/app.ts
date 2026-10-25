import { timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { ExchangeOrder, InstrumentList } from "@switchboard/contracts";
import { EXECUTION_FLOW, LIQUIDITY_MAKER } from "./book.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { loadConfig, type AppConfig } from "./config.js";
import { ApiException } from "./errors.js";
import { loadPublicKey, verifyExecutionToken, type ExecutionClaims } from "./executionAuth.js";
import { headerValue, withIdempotency } from "./idempotency.js";
import { STANDARD_INSTRUMENTS, instrumentById } from "./instruments.js";
import { placeMarketOrder, parseMarketOrder } from "./marketOrders.js";
import { acceptFirmQuote, createRfq, getRfq, parseAccept, parseFirmQuote, parseRfqCreate, publishFirmQuote } from "./rfq.js";
import { buildSearch, parseSearchRequest, readFixture, rememberFixtureQuotes } from "./search.js";
import { MemoryStore } from "./store.js";
import { assertExact, assertIso, assertMoney, assertString } from "./validate.js";
import type { KeyLike } from "jose";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
  interface FastifyInstance {
    store: MemoryStore;
    clock: Clock;
    config: AppConfig;
  }
}

export interface BuildOptions {
  clock?: Clock;
  config?: Partial<AppConfig>;
  seedLiquidity?: boolean;
  kalshiEnabled?: boolean;
  fetchImpl?: typeof fetch;
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const config = loadConfig(options.config);
  const clock = options.clock ?? systemClock();
  const store = new MemoryStore(config.makerCollateralUsd);
  if (options.seedLiquidity !== false) store.seedLiquidity(clock.now().getTime());
  const publicKey = await loadPublicKey(config.publicKeyPem);
  const kalshiEnabled = options.kalshiEnabled ?? config.kalshiEnabled;

  const app = Fastify({ logger: false });
  app.decorate("store", store);
  app.decorate("clock", clock);
  app.decorate("config", config);

  app.addHook("onRequest", async (request, reply) => {
    const incoming = headerValue(request.headers["x-request-id"])?.trim();
    const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
    request.requestId = requestId;
    reply.header("x-request-id", requestId);
    const path = request.url.split("?")[0];
    if (path === "/healthz") return;
    const authorization = headerValue(request.headers.authorization);
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, config.bearerToken)) {
      throw new ApiException(401, "UNAUTHORIZED", "Bearer token was rejected");
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const correlationId = request.requestId || "unknown";
    if (error instanceof ApiException) {
      reply.status(error.status).send(error.toJSON(correlationId));
      return;
    }
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 500;
    if (statusCode === 400) {
      reply.status(400).send({ code: "BAD_REQUEST", message: "Invalid request", correlationId, retryable: false });
      return;
    }
    reply.status(500).send({ code: "INTERNAL", message: "Internal error", correlationId, retryable: true });
  });

  app.get("/healthz", async () => ({ status: "ok", service: "markets", version: config.version }));

  app.post("/v1/markets/search", async (request, reply) =>
    withIdempotency(request, reply, store.idempotency, async () => {
      const parsed = parseSearchRequest(request.body);
      const fixture = headerValue(request.headers["x-demo-fixture"]);
      if (fixture === "market-search" && parsed.companyId === "co_demo_ai") {
        const body = readFixture(config.fixturePath);
        rememberFixtureQuotes(store, body);
        return body;
      }
      return buildSearch({ request: parsed, store, clock, config, kalshiEnabled, fetchImpl: options.fetchImpl });
    }),
  );

  app.post("/v1/markets/orders", async (request, reply) =>
    withIdempotency(request, reply, store.idempotency, async () => {
      const claims = await requireExecution(request, store, publicKey, clock);
      const order = parseMarketOrder(request.body);
      return placeMarketOrder({ order, claims, store, clock, config });
    }),
  );

  app.get("/v1/markets/instruments/:instrumentId", async (request) => {
    const instrumentId = (request.params as { instrumentId: string }).instrumentId;
    const instrument = instrumentById(instrumentId);
    if (!instrument) throw new ApiException(404, "INSTRUMENT_NOT_FOUND", "Unknown instrument");
    return { ...instrument };
  });

  app.get("/v1/exchange/instruments", async () => {
    const body: InstrumentList = {
      instruments: STANDARD_INSTRUMENTS.map((instrument) => ({ ...instrument })),
      retrievedAt: clock.now().toISOString(),
      mode: "sandbox",
    };
    return body;
  });

  app.post("/v1/exchange/rfqs", async (request, reply) =>
    withIdempotency(request, reply, store.idempotency, async () => createRfq(store, parseRfqCreate(request.body), clock.now().getTime())),
  );

  app.get("/v1/exchange/rfqs/:rfqId", async (request) => getRfq(store, (request.params as { rfqId: string }).rfqId));

  app.post("/v1/exchange/rfqs/:rfqId/quotes", async (request, reply) =>
    withIdempotency(request, reply, store.idempotency, async () => {
      const makerId = requireMaker(request, config);
      return publishFirmQuote(store, (request.params as { rfqId: string }).rfqId, parseFirmQuote(request.body), makerId, clock.now().getTime());
    }),
  );

  app.post("/v1/exchange/rfqs/:rfqId/accept", async (request, reply) =>
    withIdempotency(request, reply, store.idempotency, async () => {
      const claims = await requireExecution(request, store, publicKey, clock);
      return acceptFirmQuote({
        store,
        rfqId: (request.params as { rfqId: string }).rfqId,
        body: parseAccept(request.body),
        claims,
        nowMs: clock.now().getTime(),
      });
    }),
  );

  app.post("/v1/exchange/orders", async (request, reply) =>
    withIdempotency(request, reply, store.idempotency, async () => {
      const makerId = requireMaker(request, config);
      const order = parseExchangeOrder(request.body);
      return store.book.place({
        makerId,
        instrumentId: order.instrumentId,
        side: order.side,
        priceUsd: order.priceUsd,
        quantity: order.quantity,
        nonce: order.nonce,
        goodTil: order.goodTil,
        clientOrderId: order.clientOrderId,
        nowMs: clock.now().getTime(),
        timeInForce: "GTC",
      });
    }),
  );

  app.post("/v1/exchange/orders/cancel", async (request, reply) =>
    withIdempotency(request, reply, store.idempotency, async () => {
      const makerId = requireMaker(request, config);
      const record = assertExact(request.body, ["clientOrderId"]);
      return store.book.cancel(makerId, assertString(record, "clientOrderId"), clock.now().getTime());
    }),
  );

  app.get("/v1/exchange/orderbook/:instrumentId", async (request) => {
    const instrumentId = (request.params as { instrumentId: string }).instrumentId;
    if (!instrumentById(instrumentId)) throw new ApiException(404, "INSTRUMENT_NOT_FOUND", "Unknown instrument");
    const nowMs = clock.now().getTime();
    const levels = store.book.levels(instrumentId, nowMs);
    return {
      instrumentId,
      bids: levels.bids,
      asks: levels.asks,
      updatedAt: new Date(nowMs).toISOString(),
      mode: "sandbox" as const,
    };
  });

  return app;
}

async function requireExecution(request: FastifyRequest, store: MemoryStore, publicKey: KeyLike, clock: Clock): Promise<ExecutionClaims> {
  const token = headerValue(request.headers["x-execution-authorization"])?.trim();
  if (!token) throw new ApiException(401, "INVALID_TOKEN", "X-Execution-Authorization is required");
  const claims = await verifyExecutionToken(token, publicKey, clock.now());
  if (store.usedJti.has(claims.jti)) throw new ApiException(403, "JTI_REPLAY", "Execution authorization jti was already used");
  store.usedJti.add(claims.jti);
  return claims;
}

function requireMaker(request: FastifyRequest, config: AppConfig): string {
  const key = headerValue(request.headers["x-sandbox-maker-key"])?.trim();
  if (!key || !safeEqual(key, config.makerKey)) {
    throw new ApiException(401, "INVALID_MAKER_KEY", "X-Sandbox-Maker-Key was rejected");
  }
  const makerId = headerValue(request.headers["x-sandbox-maker-id"])?.trim() || "sandbox-maker";
  if (makerId === LIQUIDITY_MAKER || makerId === EXECUTION_FLOW) {
    throw new ApiException(403, "RESERVED_MAKER", "That maker id is reserved for sandbox liquidity");
  }
  return makerId;
}

function parseExchangeOrder(body: unknown): ExchangeOrder {
  const record = assertExact(body, ["instrumentId", "side", "priceUsd", "quantity", "nonce", "goodTil", "clientOrderId"]);
  const side = assertString(record, "side");
  if (side !== "BUY" && side !== "SELL") throw new ApiException(400, "BAD_REQUEST", "side must be BUY or SELL");
  return {
    instrumentId: assertString(record, "instrumentId"),
    side,
    priceUsd: assertMoney(record, "priceUsd"),
    quantity: assertMoney(record, "quantity"),
    nonce: assertString(record, "nonce"),
    goodTil: assertIso(assertString(record, "goodTil"), "goodTil"),
    clientOrderId: assertString(record, "clientOrderId"),
  };
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
