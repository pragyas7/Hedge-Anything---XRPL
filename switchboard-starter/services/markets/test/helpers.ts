import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importPKCS8, SignJWT } from "jose";
import { buildApp, type BuildOptions } from "../src/app.js";
import { manualClock, type Clock } from "../src/clock.js";

export const BEARER = "switchboard-dev-platform-token";
export const MAKER_KEY = "sandbox-maker-dev";
export const START_MS = Date.parse("2026-10-24T22:00:00.000Z");

const privatePem = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../dev-keys/execution-auth-private.pem"), "utf8");

export interface SignedClaims {
  sub: string;
  planHash?: string;
  quoteId?: string;
  instrumentId?: string;
  venue?: string;
  side?: "BUY" | "SELL";
  maxQuantity?: string;
  maxPriceUsd?: string;
  maxSpendUsd?: string;
  mode?: "sandbox" | "live";
  canonicalTermsHash?: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

export async function signExec(claims: SignedClaims, nowSec: number): Promise<string> {
  const key = await importPKCS8(privatePem, "EdDSA");
  const payload: Record<string, string> = {
    planHash: claims.planHash ?? "sha256:test",
    quoteId: claims.quoteId ?? "quote_missing",
    instrumentId: claims.instrumentId ?? "instrument_missing",
    venue: claims.venue ?? "switchboard",
    side: claims.side ?? "BUY",
    maxQuantity: claims.maxQuantity ?? "10",
    maxPriceUsd: claims.maxPriceUsd ?? "100",
    maxSpendUsd: claims.maxSpendUsd ?? "100000",
    mode: claims.mode ?? "sandbox",
  };
  if (claims.canonicalTermsHash) payload.canonicalTermsHash = claims.canonicalTermsHash;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer("switchboard-execution")
    .setAudience("markets")
    .setSubject(claims.sub)
    .setIssuedAt(claims.iat ?? nowSec)
    .setExpirationTime(claims.exp ?? nowSec + 60)
    .setJti(claims.jti ?? randomUUID())
    .sign(key);
}

export async function testApp(options: BuildOptions & { clock?: Clock } = {}) {
  const clock = options.clock ?? manualClock(START_MS);
  const app = await buildApp({
    kalshiEnabled: false,
    seedLiquidity: true,
    ...options,
    clock,
  });
  return { app, clock };
}

export function bearer(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${BEARER}`, ...extra };
}
