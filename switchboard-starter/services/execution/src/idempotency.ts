import { apiError, type HandlerResult } from "./errors.js";
import { sha256Prefixed } from "./plan-hash.js";
import type { MemoryStore } from "./store.js";

export async function withIdempotency(
  store: MemoryStore,
  scope: string,
  key: string | undefined,
  body: unknown,
  correlationId: string,
  handler: () => Promise<HandlerResult>,
): Promise<HandlerResult> {
  if (!key) {
    return {
      status: 400,
      body: apiError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required on mutating requests.", correlationId, false),
    };
  }
  const bodyHash = sha256Prefixed(body ?? null);
  const mapKey = `${scope}|${key}`;
  const existing = store.idempotency.get(mapKey);
  if (existing) {
    if (existing.bodyHash !== bodyHash) {
      return {
        status: 409,
        body: apiError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was reused with a different request body.", correlationId, false),
      };
    }
    return { status: existing.statusCode, body: existing.body, headers: existing.headers };
  }
  const result = await handler();
  store.idempotency.set(mapKey, {
    bodyHash,
    statusCode: result.status,
    body: structuredClone(result.body),
    headers: { ...(result.headers ?? {}) },
  });
  return result;
}
