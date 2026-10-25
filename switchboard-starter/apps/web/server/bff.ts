import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExchangeOrderbook, ExecutionRun, FailoverRun, MarketSearchRequest, MarketSearchResponse } from '@switchboard/contracts';

export function devBearer(): string {
  return process.env.SWITCHBOARD_DEV_BEARER?.trim() || 'switchboard-dev-platform-token';
}

export function strategyBase(): string {
  return (process.env.STRATEGY_BASE_URL ?? 'http://localhost:4101').replace(/\/$/, '');
}

export function marketsBase(): string {
  return (process.env.MARKETS_BASE_URL ?? 'http://localhost:4102').replace(/\/$/, '');
}

export function executionBase(): string {
  return (process.env.EXECUTION_BASE_URL ?? 'http://localhost:4103').replace(/\/$/, '');
}

export function fixturesDir(): string {
  return path.resolve(process.cwd(), '../../fixtures');
}

export async function readFixture<T>(name: string): Promise<T> {
  const raw = await readFile(path.join(fixturesDir(), name), 'utf8');
  return JSON.parse(raw) as T;
}

export interface ProxyResult {
  ok: boolean;
  status: number;
  body: unknown;
  sent: { authorization: string; idempotencyKey?: string; url: string };
}

export async function proxyJson(args: {
  baseUrl: string;
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
  idempotencyKey?: string;
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): Promise<ProxyResult> {
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${devBearer()}`);
  headers.set('X-Request-ID', randomUUID());
  let idempotencyKey: string | undefined;
  if (args.method === 'POST') {
    idempotencyKey = args.idempotencyKey?.trim() || randomUUID();
    headers.set('Idempotency-Key', idempotencyKey);
    headers.set('Content-Type', 'application/json');
  }
  for (const [key, value] of Object.entries(args.extraHeaders ?? {})) {
    if (value) headers.set(key, value);
  }
  const url = `${args.baseUrl}${args.path}`;
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: args.method,
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
    cache: 'no-store',
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { code: 'BAD_UPSTREAM', message: text.slice(0, 400), retryable: true };
    }
  }
  return {
    ok: response.ok,
    status: response.status,
    body,
    sent: { authorization: headers.get('Authorization') ?? '', idempotencyKey, url },
  };
}

export interface MarketSearchDesk {
  httpStatus: number;
  source: 'markets' | 'fixture';
  unavailable: boolean;
  note: string;
  result: MarketSearchResponse | null;
  error: unknown;
}

async function fixtureMarkets(body: MarketSearchRequest, note: string): Promise<MarketSearchDesk> {
  const fixture = await readFixture<MarketSearchResponse>('market-search.json');
  return {
    httpStatus: 200,
    source: 'fixture',
    unavailable: true,
    note,
    result: {
      ...fixture,
      companyId: body.companyId,
      warnings: [
        ...fixture.warnings,
        'FIXTURE/SANDBOX: checked-in sample quotes. Not live Kalshi, Polymarket, or Switchboard exchange prices.',
      ],
    },
    error: null,
  };
}

export async function searchMarkets(body: MarketSearchRequest, idempotencyKey?: string, fetchImpl?: typeof fetch): Promise<MarketSearchDesk> {
  try {
    const upstream = await proxyJson({
      baseUrl: marketsBase(),
      path: '/v1/markets/search',
      method: 'POST',
      body,
      idempotencyKey,
      fetchImpl,
    });
    if (upstream.ok) {
      return {
        httpStatus: 200,
        source: 'markets',
        unavailable: false,
        note: 'Quotes from the markets service. Sandbox and synthetic rows are not live trades.',
        result: upstream.body as MarketSearchResponse,
        error: null,
      };
    }
    if (upstream.status >= 500) {
      return fixtureMarkets(body, 'Markets service failed. Showing fixture/sandbox quotes, not live venues.');
    }
    return {
      httpStatus: upstream.status,
      source: 'markets',
      unavailable: false,
      note: 'Markets service rejected the search.',
      result: null,
      error: upstream.body,
    };
  } catch {
    return fixtureMarkets(body, 'Markets service unavailable. Showing fixture/sandbox quotes, not live venues.');
  }
}

export function illustrativeBook(instrumentId: string): ExchangeOrderbook {
  return {
    instrumentId,
    mode: 'sandbox',
    updatedAt: '2026-10-24T22:00:00Z',
    bids: [
      { priceUsd: '17', quantity: '40' },
      { priceUsd: '16', quantity: '25' },
    ],
    asks: [
      { priceUsd: '20', quantity: '30' },
      { priceUsd: '21', quantity: '50' },
    ],
  };
}

export interface OperationsDesk {
  executionService: 'up' | 'down';
  source: 'fixture';
  note: string;
  failover: FailoverRun;
  sampleRun: ExecutionRun;
}

export async function loadOperations(fetchImpl?: typeof fetch): Promise<OperationsDesk> {
  const failover = await readFixture<FailoverRun>('failover-run.json');
  const sampleRun = await readFixture<ExecutionRun>('execution-run.json');
  let executionService: 'up' | 'down' = 'down';
  try {
    const health = await proxyJson({ baseUrl: executionBase(), path: '/healthz', method: 'GET', fetchImpl });
    executionService = health.ok ? 'up' : 'down';
  } catch {
    executionService = 'down';
  }
  return {
    executionService,
    source: 'fixture',
    note: 'Fixture monitor and sample receipts. Not a confirmed live failover, voucher, or RLUSD settlement.',
    failover,
    sampleRun,
  };
}
