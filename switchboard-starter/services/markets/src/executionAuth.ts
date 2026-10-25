import { importSPKI, jwtVerify, type JWTPayload, type KeyLike } from "jose";
import { ApiException } from "./errors.js";
import { isMoney } from "./money.js";

export interface ExecutionClaims {
  sub: string;
  planHash: string;
  quoteId: string;
  instrumentId: string;
  venue: string;
  side: "BUY" | "SELL";
  maxQuantity: string;
  maxPriceUsd: string;
  maxSpendUsd: string;
  jti: string;
  iat: number;
  exp: number;
  mode: "sandbox" | "live";
  canonicalTermsHash?: string;
}

const MAX_TTL_SECONDS = 120;

export async function loadPublicKey(pem: string): Promise<KeyLike> {
  return importSPKI(pem, "EdDSA");
}

export async function verifyExecutionToken(token: string, publicKey: KeyLike, now: Date): Promise<ExecutionClaims> {
  if (!token || token.split(".").length !== 3) {
    throw new ApiException(401, "INVALID_TOKEN", "Missing or invalid X-Execution-Authorization");
  }
  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, publicKey, {
      algorithms: ["EdDSA"],
      issuer: "switchboard-execution",
      audience: "markets",
      clockTolerance: 0,
      currentDate: now,
    });
    payload = verified.payload;
  } catch {
    throw new ApiException(401, "INVALID_TOKEN", "Execution authorization was rejected");
  }

  const iat = payload.iat;
  const exp = payload.exp;
  if (typeof iat !== "number" || typeof exp !== "number") {
    throw new ApiException(401, "MISSING_CLAIM", "iat and exp are required");
  }
  if (exp <= iat || exp - iat > MAX_TTL_SECONDS) {
    throw new ApiException(401, "TOKEN_TTL", "Execution authorization lifetime must be between 1 and 120 seconds");
  }

  const side = claimString(payload, "side");
  if (side !== "BUY" && side !== "SELL") throw new ApiException(401, "MISSING_CLAIM", "side must be BUY or SELL");
  const mode = claimString(payload, "mode");
  if (mode !== "sandbox" && mode !== "live") throw new ApiException(401, "MISSING_CLAIM", "mode must be sandbox or live");
  const maxQuantity = claimString(payload, "maxQuantity");
  const maxPriceUsd = claimString(payload, "maxPriceUsd");
  const maxSpendUsd = claimString(payload, "maxSpendUsd");
  if (!isMoney(maxQuantity) || !isMoney(maxPriceUsd) || !isMoney(maxSpendUsd)) {
    throw new ApiException(401, "MISSING_CLAIM", "Size and price claims must be decimal strings");
  }
  const jti = typeof payload.jti === "string" && payload.jti.length > 0 ? payload.jti : "";
  if (!jti) throw new ApiException(401, "MISSING_CLAIM", "jti is required");
  const terms = payload.canonicalTermsHash;
  return {
    sub: typeof payload.sub === "string" ? payload.sub : claimString(payload, "sub"),
    planHash: claimString(payload, "planHash"),
    quoteId: claimString(payload, "quoteId"),
    instrumentId: claimString(payload, "instrumentId"),
    venue: claimString(payload, "venue"),
    side,
    maxQuantity,
    maxPriceUsd,
    maxSpendUsd,
    jti,
    iat,
    exp,
    mode,
    canonicalTermsHash: typeof terms === "string" ? terms : undefined,
  };
}

function claimString(payload: JWTPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiException(401, "MISSING_CLAIM", `Missing claim ${key}`);
  }
  return value;
}
