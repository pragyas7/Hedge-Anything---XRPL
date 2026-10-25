import { ApiException } from "./errors.js";
import { isMoney } from "./money.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertExact(body: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!isRecord(body)) throw new ApiException(400, "BAD_REQUEST", "JSON object body is required");
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new ApiException(400, "BAD_REQUEST", `Unexpected field ${key}`);
  }
  for (const key of required) {
    if (body[key] === undefined || body[key] === null) throw new ApiException(400, "BAD_REQUEST", `Missing field ${key}`);
  }
  return body;
}

export function assertString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) throw new ApiException(400, "BAD_REQUEST", `${key} must be a string`);
  return value;
}

export function assertMoney(body: Record<string, unknown>, key: string): string {
  const value = assertString(body, key);
  if (!isMoney(value)) throw new ApiException(400, "BAD_REQUEST", `${key} must be a decimal string`);
  return value;
}

export function assertBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  if (typeof value !== "boolean") throw new ApiException(400, "BAD_REQUEST", `${key} must be a boolean`);
  return value;
}

export function assertIso(value: string, key: string): string {
  if (Number.isNaN(Date.parse(value))) throw new ApiException(400, "BAD_REQUEST", `${key} must be an ISO timestamp`);
  return value;
}
