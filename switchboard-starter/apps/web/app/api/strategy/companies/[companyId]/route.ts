import { proxyJson, strategyBase } from '../../../../../server/bff';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const companyId = decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? '');
  try {
    const result = await proxyJson({
      baseUrl: strategyBase(),
      path: `/v1/companies/${encodeURIComponent(companyId)}`,
      method: 'GET',
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({
      code: 'STRATEGY_UNAVAILABLE',
      message: 'Strategy service is unavailable.',
      retryable: true,
    }, { status: 503 });
  }
}
