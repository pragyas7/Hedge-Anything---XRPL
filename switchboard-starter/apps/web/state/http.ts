export async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

export function messageOf(body: Record<string, unknown>, fallback: string): string {
  if (typeof body.message === 'string' && body.message.trim()) return body.message;
  const nested = body.error;
  if (nested && typeof nested === 'object' && 'message' in nested) {
    const message = (nested as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
