import type { MarketSearchRequest } from '@switchboard/contracts';
import { searchMarkets } from '../../../../server/bff';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: MarketSearchRequest;
  try {
    body = await request.json() as MarketSearchRequest;
  } catch {
    return Response.json({ code: 'INVALID_REQUEST', message: 'Expected JSON.', retryable: false }, { status: 400 });
  }
  const desk = await searchMarkets(body, request.headers.get('idempotency-key') ?? undefined);
  return Response.json(desk, { status: desk.httpStatus });
}
