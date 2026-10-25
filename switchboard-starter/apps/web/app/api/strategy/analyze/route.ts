import { proxyJson, strategyBase } from '../../../../server/bff';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: 'INVALID_REQUEST', message: 'Expected JSON.', retryable: false }, { status: 400 });
  }
  try {
    const result = await proxyJson({
      baseUrl: strategyBase(),
      path: '/v1/companies/analyze',
      method: 'POST',
      body,
      idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({
      code: 'STRATEGY_UNAVAILABLE',
      message: 'Strategy service is unavailable. Nothing was analyzed.',
      retryable: true,
    }, { status: 503 });
  }
}
