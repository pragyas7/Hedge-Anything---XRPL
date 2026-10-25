import { illustrativeBook, marketsBase, proxyJson } from '../../../../../server/bff';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const instrumentId = decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? '');
  try {
    const result = await proxyJson({
      baseUrl: marketsBase(),
      path: `/v1/exchange/orderbook/${encodeURIComponent(instrumentId)}`,
      method: 'GET',
    });
    if (result.ok) {
      return Response.json({
        source: 'markets',
        note: 'Order book from the markets service. Sandbox books are not a live US exchange.',
        book: result.body,
      });
    }
  } catch {
    // Fall through to the labeled sample book.
  }
  return Response.json({
    source: 'fixture',
    note: 'Illustrative sandbox book. Markets service unavailable. Not a live order book.',
    book: illustrativeBook(instrumentId || 'sb_sandbox_outage_20261130'),
  });
}
