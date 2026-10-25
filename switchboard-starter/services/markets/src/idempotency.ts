import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiException } from "./errors.js";

export interface IdempotentRecord {
  bodyHash: string;
  status: number;
  body: unknown;
}

export function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function withIdempotency(
  request: FastifyRequest,
  reply: FastifyReply,
  records: Map<string, IdempotentRecord>,
  handler: () => Promise<unknown>,
): Promise<unknown> {
  const key = headerValue(request.headers["idempotency-key"])?.trim();
  if (!key) throw new ApiException(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required");
  const bodyHash = createHash("sha256").update(JSON.stringify(request.body ?? null)).digest("hex");
  const existing = records.get(key);
  if (existing) {
    if (existing.bodyHash !== bodyHash) {
      throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used with a different body");
    }
    reply.code(existing.status);
    return existing.body;
  }
  try {
    const body = await handler();
    records.set(key, { bodyHash, status: 200, body });
    return body;
  } catch (error) {
    if (error instanceof ApiException && (error.status === 403 || error.status === 404 || error.status === 409)) {
      records.set(key, { bodyHash, status: error.status, body: error.toJSON(request.requestId) });
    }
    throw error;
  }
}
