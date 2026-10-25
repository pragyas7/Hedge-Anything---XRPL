import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import type { JWK } from "jose";
import type { AuthKeys } from "./keys.js";
import type { MemoryStore } from "./store.js";

export type ExecutionMode = "sandbox" | "live";

export interface OrderAuthorizationClaims {
  approvalId: string;
  planHash: string;
  quoteId: string;
  instrumentId: string;
  venue: string;
  maxQuantity: string;
  /** All-in unit price bound sent as limitPriceUsd. See README. */
  maxPriceUsd: string;
  maxSpendUsd: string;
  mode: ExecutionMode;
  now: Date;
}

export interface SignedAuthorization {
  jwt: string;
  jti: string;
}

/**
 * In-memory jti revocation. Lost on process restart.
 * Revoked when an approval is rejected or expired, or a run fails closed
 * (FAILED, PARTIAL, REAPPROVAL_REQUIRED). A later run must mint a new jti.
 */
export class TokenService {
  constructor(
    private readonly keys: AuthKeys,
    private readonly store: MemoryStore,
  ) {}

  jwks(): { keys: JWK[] } {
    const { d: _private, ...publicJwk } = this.keys.publicJwk;
    return { keys: [publicJwk] };
  }

  revoke(jtis: readonly string[]): void {
    for (const jti of jtis) this.store.revokedJtis.add(jti);
  }

  isRevoked(jti: string): boolean {
    return this.store.revokedJtis.has(jti);
  }

  async signOrder(claims: OrderAuthorizationClaims): Promise<SignedAuthorization> {
    const jti = randomUUID();
    if (this.isRevoked(jti)) {
      throw new Error("refusing to issue a revoked jti");
    }
    const iat = Math.floor(claims.now.getTime() / 1000);
    const exp = iat + 60;
    const jwt = await new SignJWT({
      planHash: claims.planHash,
      quoteId: claims.quoteId,
      instrumentId: claims.instrumentId,
      venue: claims.venue,
      side: "BUY",
      maxQuantity: claims.maxQuantity,
      maxPriceUsd: claims.maxPriceUsd,
      maxSpendUsd: claims.maxSpendUsd,
      mode: claims.mode,
    })
      .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: this.keys.kid })
      .setIssuer("switchboard-execution")
      .setAudience("markets")
      .setSubject(claims.approvalId)
      .setJti(jti)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(this.keys.privateKey);
    return { jwt, jti };
  }
}
