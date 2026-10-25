import { executionBase, proxyJson } from '../../../../../../server/bff';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const parts = new URL(request.url).pathname.split('/');
  const approvalId = decodeURIComponent(parts[parts.length - 2] ?? '');
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: 'INVALID_REQUEST', message: 'Expected JSON.', retryable: false }, { status: 400 });
  }
  try {
    const result = await proxyJson({
      baseUrl: executionBase(),
      path: `/v1/execution/approvals/${encodeURIComponent(approvalId)}/confirm`,
      method: 'POST',
      body,
      idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({
      code: 'EXECUTION_UNAVAILABLE',
      message: 'Execution service did not respond. This plan is not approved.',
      retryable: true,
    }, { status: 503 });
  }
}
