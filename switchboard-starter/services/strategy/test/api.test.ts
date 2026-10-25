import { describe, expect, it } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { createStore } from '../src/store.js';
import { AS_OF, loadCompanyAnalysis, loadMarketSearch } from './fixtures.js';

const TOKEN = 'switchboard-dev-platform-token';

function app() {
  const store = createStore();
  return {
    store,
    server: buildApp({
      store,
      now: () => AS_OF,
      bearer: TOKEN,
    }),
  };
}

async function post(server: ReturnType<typeof app>['server'], url: string, body: object, key: string, extra: Record<string, string> = {}): Promise<LightMyRequestResponse> {
  return server.inject({
    method: 'POST',
    url,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'idempotency-key': key,
      'content-type': 'application/json',
      ...extra,
    },
    payload: body,
  });
}

describe('strategy HTTP', () => {
  it('serves health without a token', async () => {
    const { server } = app();
    const response = await server.inject({ method: 'GET', url: '/healthz', headers: { authorization: 'Bearer wrong' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'strategy', version: '1.0.0' });
  });

  it('rejects a missing or wrong bearer', async () => {
    const { server } = app();
    const missing = await server.inject({ method: 'GET', url: '/v1/companies/co_demo_ai', headers: { 'x-correlation-id': 'corr-9' } });
    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toMatchObject({ code: 'UNAUTHORIZED', correlationId: 'corr-9', retryable: false });
    const wrong = await server.inject({
      method: 'GET',
      url: '/v1/companies/co_demo_ai',
      headers: { authorization: 'Bearer not-the-token' },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('echoes X-Request-ID and requires an idempotency key', async () => {
    const { server } = app();
    const missingKey = await server.inject({
      method: 'POST',
      url: '/v1/companies/analyze',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'x-request-id': 'req-123' },
      payload: {
        description: 'Fictional AI customer-support service that depends on primary model API',
        jurisdiction: 'US',
        monthlyHedgeBudgetUsd: '800',
        maxTolerableTailLossUsd: '8000',
      },
    });
    expect(missingKey.statusCode).toBe(400);
    expect(missingKey.json().code).toBe('MISSING_IDEMPOTENCY_KEY');
    expect(missingKey.headers['x-request-id']).toBe('req-123');
  });

  it('profiles the AI demo, the retailer, a shipper, and a thin description on one schema', async () => {
    const { server } = app();
    const ai = await post(server, '/v1/companies/analyze', {
      description: 'Fictional AI customer-support service that depends on primary model API',
      jurisdiction: 'US',
      monthlyHedgeBudgetUsd: '800',
      maxTolerableTailLossUsd: '8000',
    }, 'analyze-ai');
    expect(ai.statusCode).toBe(200);
    const aiBody = ai.json();
    expect(aiBody.company.companyId).toBe('co_demo_ai');
    expect(aiBody.company.confirmedByUser).toBe(false);
    expect(aiBody.company.exposures[0].category).toBe('digital');
    expect(aiBody.company.scenarios.map((scenario: { scenarioId: string }) => scenario.scenarioId)).toEqual(['normal', 'price_spike', 'primary_down', 'correlated_down']);
    expect(aiBody.assumptions.join(' ')).toMatch(/Provenance/);

    const retail = await post(server, '/v1/companies/analyze', {
      description: 'Fictional retail operator vulnerable to storm-related delivery and venue closure',
      jurisdiction: 'US',
      monthlyHedgeBudgetUsd: '1200',
      maxTolerableTailLossUsd: '18000',
    }, 'analyze-retail');
    expect(retail.json().company.exposures[0].category).toBe('climate');
    expect(Object.keys(retail.json().company.exposures[0]).sort()).toEqual(Object.keys(aiBody.company.exposures[0]).sort());
    expect(retail.json().company.exposures[0].category).not.toBe(aiBody.company.exposures[0].category);

    const ship = await post(server, '/v1/companies/analyze', {
      description: 'West coast importer exposed to shipping delays, port congestion, and container roll-overs on the transpacific lane',
      jurisdiction: 'US',
      monthlyHedgeBudgetUsd: '900',
      maxTolerableTailLossUsd: '20000',
    }, 'analyze-ship');
    expect(ship.json().company.exposures[0].category).toBe('supply_chain');

    const thin = await post(server, '/v1/companies/analyze', {
      description: 'small bakery',
      jurisdiction: 'US',
      monthlyHedgeBudgetUsd: '100',
      maxTolerableTailLossUsd: '1000',
    }, 'analyze-thin');
    expect(thin.json().company.exposures[0].confidence).toBeLessThan(0.3);
    expect(thin.json().warnings.join(' ')).toMatch(/Missing data/);

    const stored = await server.inject({
      method: 'GET',
      url: '/v1/companies/co_demo_ai',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(stored.statusCode).toBe(200);
    expect(stored.json().company.companyId).toBe('co_demo_ai');
  });

  it('replays an idempotent generate, conflicts on a different body, and keeps the plan hash stable', async () => {
    const { server, store } = app();
    const body = {
      company: loadCompanyAnalysis().company,
      marketSearch: loadMarketSearch(),
      mode: 'min_cvar' as const,
    };
    const first = await post(server, '/v1/strategies/generate', body, 'plan-key');
    expect(first.statusCode).toBe(200);
    const saved = store.idempotency.get('plan-key');
    expect(saved).toBeTruthy();
    const marked = saved!.body as { rationale: string };
    marked.rationale = `${marked.rationale} REPLAY_MARKER`;
    const second = await post(server, '/v1/strategies/generate', body, 'plan-key');
    expect(second.statusCode).toBe(200);
    expect(second.json().rationale).toContain('REPLAY_MARKER');

    const conflict = await post(server, '/v1/strategies/generate', { ...body, mode: 'min_cost' }, 'plan-key');
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe('IDEMPOTENCY_CONFLICT');

    const other = await post(server, '/v1/strategies/generate', body, 'plan-key-2');
    expect(other.statusCode).toBe(200);
    expect(other.json().planHash).toBe(first.json().planHash);
    expect(other.json().planHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const fetched = await server.inject({
      method: 'GET',
      url: `/v1/strategies/${other.json().planId}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().planId).toBe(other.json().planId);

    const confirmed = structuredClone(body);
    confirmed.company.confirmedByUser = true;
    await post(server, '/v1/strategies/generate', confirmed, 'plan-confirmed');
    const profile = await server.inject({
      method: 'GET',
      url: `/v1/companies/${confirmed.company.companyId}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(profile.json().company.confirmedByUser).toBe(true);
  });
});
