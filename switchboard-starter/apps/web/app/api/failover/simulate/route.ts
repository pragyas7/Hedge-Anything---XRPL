import { executionBase, proxyJson } from '../../../../server/bff';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: 'INVALID_REQUEST', message: 'Expected JSON.', retryable: false }, { status: 400 });
  }
  const quote = request.headers.get('x-failover-quote-usd') ?? '';
  try {
    const result = await proxyJson({
      baseUrl: executionBase(),
      path: '/v1/failover/simulate',
      method: 'POST',
      body,
      idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
      extraHeaders: {
        'x-failover-scenario': request.headers.get('x-failover-scenario') ?? 'success',
        ...(quote ? { 'x-failover-quote-usd': quote } : {}),
      },
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({
      code: 'EXECUTION_UNAVAILABLE',
      message: 'Execution service did not respond. No failover simulation ran.',
      retryable: true,
    }, { status: 503 });
  }
}
