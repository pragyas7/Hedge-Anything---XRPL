import { createPrivateKey, createPublicKey } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { calculateJwkThumbprint, exportJWK, exportPKCS8, exportSPKI, importPKCS8, importSPKI } from "jose";
import type { JWK, KeyLike } from "jose";

/** Public sandbox seed. 32 ASCII bytes. Not a production secret. */
export const AUTH_SEED_LABEL = "switchboard-sandbox-auth-seed-v1";

/**
 * RFC 8410 Ed25519 PKCS#8 prefix. The following 32 bytes are the seed.
 * jose 5.10 and 6.2 do not export generateKeyPairFromSeed; this is the same seed import.
 */
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function authSeedBytes(): Uint8Array {
  const seed = new TextEncoder().encode(AUTH_SEED_LABEL);
  if (seed.length !== 32) {
    throw new Error(`seed length ${seed.length}`);
  }
  return seed;
}

export function ed25519Pkcs8PemFromSeed(seed: Uint8Array): string {
  if (seed.length !== 32) throw new Error(`seed length ${seed.length}`);
  const der = Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed)]);
  const body = der.toString("base64").replace(/.{1,64}/g, (line) => `${line}\n`);
  return `-----BEGIN PRIVATE KEY-----\n${body}-----END PRIVATE KEY-----\n`;
}

export interface AuthKeys {
  privateKey: KeyLike;
  publicKey: KeyLike;
  publicJwk: JWK;
  kid: string;
}

export async function deriveAuthKeysFromSeed(): Promise<AuthKeys> {
  const pem = ed25519Pkcs8PemFromSeed(authSeedBytes());
  const privateObject = createPrivateKey({ key: pem, format: "pem" });
  const publicObject = createPublicKey(privateObject);
  const privateKey = await importPKCS8(await exportPKCS8(privateObject), "EdDSA");
  const publicKey = await importSPKI(await exportSPKI(publicObject), "EdDSA");
  const publicJwk = await exportJWK(publicKey);
  delete publicJwk.d;
  publicJwk.alg = "EdDSA";
  publicJwk.use = "sig";
  const kid = await calculateJwkThumbprint(publicJwk);
  publicJwk.kid = kid;
  return { privateKey, publicKey, publicJwk, kid };
}

export async function ensureDeterministicKeyFiles(privatePath: string, publicPath: string): Promise<void> {
  if (existsSync(privatePath) && existsSync(publicPath)) return;
  const seed = authSeedBytes();
  const privateObject = createPrivateKey({ key: ed25519Pkcs8PemFromSeed(seed), format: "pem" });
  const publicObject = createPublicKey(privateObject);
  mkdirSync(path.dirname(privatePath), { recursive: true });
  writeFileSync(privatePath, await exportPKCS8(privateObject));
  writeFileSync(publicPath, await exportSPKI(publicObject));
}

export async function loadAuthKeys(privatePath: string, publicPath: string): Promise<AuthKeys> {
  await ensureDeterministicKeyFiles(privatePath, publicPath);
  const privatePem = readFileSync(privatePath, "utf8");
  const publicPem = readFileSync(publicPath, "utf8");
  const privateKey = await importPKCS8(privatePem, "EdDSA");
  const publicKey = await importSPKI(publicPem, "EdDSA");
  const publicJwk = await exportJWK(publicKey);
  delete publicJwk.d;
  publicJwk.alg = "EdDSA";
  publicJwk.use = "sig";
  publicJwk.kty = publicJwk.kty ?? "OKP";
  publicJwk.crv = publicJwk.crv ?? "Ed25519";
  const kid = await calculateJwkThumbprint(publicJwk);
  publicJwk.kid = kid;
  return { privateKey, publicKey, publicJwk, kid };
}
