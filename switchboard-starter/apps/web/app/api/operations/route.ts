import { loadOperations } from '../../../server/bff';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const desk = await loadOperations();
  return Response.json(desk);
}
