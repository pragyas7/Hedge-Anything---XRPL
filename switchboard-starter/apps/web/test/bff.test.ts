import { afterEach, describe, expect, it } from 'vitest';
import { presentApproval } from '../server/approval';
import { proxyJson, readFixture, searchMarkets } from '../server/bff';
import type { MarketSearchResponse } from '@switchboard/contracts';

describe('strategy proxy headers', () => {
  const previous = process.env.SWITCHBOARD_DEV_BEARER;
  afterEach(() => {
    if (previous === undefined) delete process.env.SWITCHBOARD_DEV_BEARER;
    else process.env.SWITCHBOARD_DEV_BEARER = previous;
  });

  it('sends the dev bearer and the idempotency key', async () => {
    process.env.SWITCHBOARD_DEV_BEARER = 'switchboard-dev-platform-token';
    let seen = new Headers();
    const fetchImpl: typeof fetch = async (_url, init) => {
      seen = new Headers(init?.headers);
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    };
    const result = await proxyJson({
      baseUrl: 'http://localhost:4101',
      path: '/v1/companies/analyze',
      method: 'POST',
      body: { description: 'desk' },
      idempotencyKey: 'idem-1',
      fetchImpl,
    });
    expect(result.status).toBe(200);
    expect(seen.get('authorization')).toBe('Bearer switchboard-dev-platform-token');
    expect(seen.get('idempotency-key')).toBe('idem-1');
    expect(seen.get('x-request-id')).toBeTruthy();
  });

  it('mints an idempotency key for posts that omit one', async () => {
    let key = '';
    const fetchImpl: typeof fetch = async (_url, init) => {
      key = new Headers(init?.headers).get('idempotency-key') ?? '';
      return new Response('{}', { status: 202 });
    };
    await proxyJson({
      baseUrl: 'http://127.0.0.1:4103',
      path: '/v1/execution/approvals',
      method: 'POST',
      body: { planId: 'plan_1' },
      fetchImpl,
    });
    expect(key.length).toBeGreaterThan(8);
  });
});

describe('approval is not local', () => {
  it('stays unapproved until execution returns APPROVED', () => {
    expect(presentApproval({ clicked: true, upstream: null })).toMatchObject({ approved: false, tone: 'error' });
    expect(presentApproval({
      clicked: true,
      upstream: { status: 503, body: { code: 'EXECUTION_UNAVAILABLE', message: 'Execution service did not respond. This plan is not approved.' } },
    })).toMatchObject({ approved: false, tone: 'error' });
    expect(presentApproval({
      clicked: true,
      upstream: { status: 200, body: { status: 'PENDING' } },
    })).toMatchObject({ approved: false, tone: 'pending' });
    expect(presentApproval({
      clicked: true,
      upstream: { status: 200, body: { status: 'APPROVED' } },
    })).toMatchObject({ approved: true, tone: 'approved' });
  });
});

describe('markets fixture fallback', () => {
  it('labels checked-in quotes when the markets service is down', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    const desk = await searchMarkets({
      companyId: 'co_other',
      exposureIds: ['exp_inference'],
      requestedQuantity: '10',
      jurisdiction: 'US',
      includeReferenceMarkets: true,
    }, 'idem-markets', fetchImpl);
    expect(desk.source).toBe('fixture');
    expect(desk.unavailable).toBe(true);
    expect(desk.note.toLowerCase()).toContain('fixture');
    expect(desk.result?.companyId).toBe('co_other');
    expect(desk.result?.warnings.join(' ')).toMatch(/FIXTURE\/SANDBOX/);
    const fixture = await readFixture<MarketSearchResponse>('market-search.json');
    expect(desk.result?.quotes[0]?.quoteId).toBe(fixture.quotes[0]?.quoteId);
  });
});
