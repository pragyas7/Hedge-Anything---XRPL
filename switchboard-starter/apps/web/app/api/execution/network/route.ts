import { executionBase, proxyJson } from '../../../../server/bff';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const result = await proxyJson({
      baseUrl: executionBase(),
      path: '/v1/execution/network',
      method: 'GET',
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json({
      ok: false,
      provider: 'public-xrpl-evm-testnet',
      label: 'Execution service did not respond, so no chain head was read.',
      error: 'EXECUTION_UNAVAILABLE',
    }, { status: 503 });
  }
}
