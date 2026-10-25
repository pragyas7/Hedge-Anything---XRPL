import { marketsBase, proxyJson } from '../../../../server/bff';

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
      baseUrl: marketsBase(),
      path: '/v1/exchange/rfqs',
      method: 'POST',
      body,
      idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
    });
    return Response.json({
      source: 'markets',
      note: result.ok ? 'RFQ response from the markets service. Sandbox only unless that service says otherwise.' : 'Markets service rejected the RFQ.',
      body: result.body,
    }, { status: result.status });
  } catch {
    return Response.json({
      code: 'MARKETS_UNAVAILABLE',
      message: 'Markets service is unavailable. The RFQ was not accepted.',
      source: 'unavailable',
      retryable: true,
    }, { status: 503 });
  }
}
