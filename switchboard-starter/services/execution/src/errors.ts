import type { ApiError } from "@switchboard/contracts";

export function apiError(
  code: string,
  message: string,
  correlationId: string,
  retryable = false,
  details?: Record<string, unknown>,
): ApiError {
  const body: ApiError = { code, message, correlationId, retryable };
  if (details) body.details = details;
  return body;
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly body: ApiError,
    readonly headers: Record<string, string> = {},
  ) {
    super(body.message);
  }
}

export interface HandlerResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export function correlationId(headers: Record<string, unknown>, fallback: () => string): string {
  const raw = headers["x-correlation-id"] ?? headers["x-request-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return fallback();
}

export function headerString(raw: unknown): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
