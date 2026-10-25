import { createHash, randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { analyzeCompany, validateAnalyzeRequest } from './analyze.js';
import { StrategyError } from './errors.js';
import { canonicalJson } from './hash.js';
import { generatePlan, validateGenerateRequest } from './optimizer.js';
import { createStore, type Store } from './store.js';

const SERVICE = 'strategy';
const VERSION = '1.0.0';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
    idemReady: { key: string; bodyHash: string } | null;
  }
}

export interface AppOptions {
  store?: Store;
  now?: () => Date;
  bearer?: string;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function apiError(reply: FastifyReply, status: number, code: string, message: string, correlationId: string, details?: Record<string, unknown>) {
  return reply.code(status).send({
    code,
    message,
    correlationId,
    retryable: status >= 500,
    ...(details ? { details } : {}),
  });
}

function readPayload(payload: unknown): unknown {
  const text = typeof payload === 'string'
    ? payload
    : Buffer.isBuffer(payload)
      ? payload.toString('utf8')
      : null;
  if (text === null) return payload;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const store = options.store ?? createStore();
  const now = options.now ?? (() => new Date());
  const bearer = options.bearer ?? process.env.SWITCHBOARD_DEV_BEARER ?? 'switchboard-dev-platform-token';
  const app = Fastify({ logger: false });

  app.decorateRequest('correlationId', '');
  app.decorateRequest('idemReady', null);

  app.addHook('onRequest', async (request, reply) => {
    const requestId = headerValue(request.headers['x-request-id']) || randomUUID();
    const correlationId = headerValue(request.headers['x-correlation-id']) || requestId;
    request.correlationId = correlationId;
    reply.header('x-request-id', requestId);
    reply.header('x-correlation-id', correlationId);
    const path = request.url.split('?')[0];
    if (path === '/healthz') return;
    const authorization = headerValue(request.headers.authorization);
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match || match[1] !== bearer) {
      return apiError(
        reply,
        401,
        'UNAUTHORIZED',
        'Bearer token is missing or does not match SWITCHBOARD_DEV_BEARER. This local dev token is not production auth.',
        correlationId,
      );
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') return;
    if (reply.sent) return;
    const key = headerValue(request.headers['idempotency-key'])?.trim();
    if (!key) {
      return apiError(reply, 400, 'MISSING_IDEMPOTENCY_KEY', 'Idempotency-Key is required on POST.', request.correlationId);
    }
    const bodyHash = createHash('sha256').update(canonicalJson(request.body ?? null)).digest('hex');
    const existing = store.idempotency.get(key);
    if (existing && existing.bodyHash !== bodyHash) {
      return apiError(reply, 409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key was reused with a different request body.', request.correlationId);
    }
    if (existing) {
      return reply.code(existing.status).send(existing.body);
    }
    request.idemReady = { key, bodyHash };
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.method !== 'POST' || !request.idemReady || reply.statusCode === 401) return payload;
    store.idempotency.set(request.idemReady.key, {
      bodyHash: request.idemReady.bodyHash,
      status: reply.statusCode,
      body: readPayload(payload),
    });
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    const correlationId = request.correlationId || request.id;
    if (error instanceof StrategyError) {
      return apiError(reply, error.status, error.code, error.message, correlationId, error.details);
    }
    const statusCode = typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;
    const message = error instanceof Error ? error.message : 'Invalid request.';
    if (statusCode >= 500) {
      return apiError(reply, 500, 'INTERNAL', 'Strategy service failed.', correlationId);
    }
    return apiError(reply, statusCode, 'INVALID_REQUEST', message, correlationId);
  });

  app.get('/healthz', async () => ({ status: 'ok', service: SERVICE, version: VERSION }));

  app.post('/v1/companies/analyze', async (request: FastifyRequest) => {
    const analysis = analyzeCompany(validateAnalyzeRequest(request.body));
    store.companies.set(analysis.company.companyId, analysis);
    return analysis;
  });

  app.get('/v1/companies/:companyId', async (request, reply) => {
    const { companyId } = request.params as { companyId: string };
    const found = store.companies.get(companyId);
    if (!found) return apiError(reply, 404, 'NOT_FOUND', `No company ${companyId}.`, request.correlationId);
    return found;
  });

  app.post('/v1/strategies/generate', async (request) => {
    const generateRequest = validateGenerateRequest(request.body);
    const plan = generatePlan(generateRequest, now());
    store.plans.set(plan.planId, plan);
    if (generateRequest.company.confirmedByUser) {
      const previous = store.companies.get(generateRequest.company.companyId);
      store.companies.set(generateRequest.company.companyId, {
        company: generateRequest.company,
        assumptions: previous?.assumptions ?? ['Provenance: profile supplied on strategy generate; confirmedByUser=true.'],
        warnings: previous?.warnings ?? [],
      });
    }
    return plan;
  });

  app.get('/v1/strategies/:planId', async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const found = store.plans.get(planId);
    if (!found) return apiError(reply, 404, 'NOT_FOUND', `No plan ${planId}.`, request.correlationId);
    return found;
  });

  return app;
}
