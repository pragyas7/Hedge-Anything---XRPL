import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface AppConfig {
  port: number;
  version: string;
  bearerToken: string;
  makerKey: string;
  allowLive: boolean;
  quoteTtlMs: number;
  makerCollateralUsd: string;
  publicKeyPem: string;
  fixturePath: string;
  kalshiEnabled: boolean;
  kalshiBaseUrl: string;
  kalshiSeries: string;
  kalshiTimeoutMs: number;
  polymarketUsApiKey?: string;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const config: AppConfig = {
    port: intEnv("PORT", 4102),
    version: "1.0.0",
    bearerToken: process.env.SWITCHBOARD_DEV_BEARER ?? "switchboard-dev-platform-token",
    makerKey: process.env.SANDBOX_MAKER_KEY ?? "sandbox-maker-dev",
    allowLive: process.env.EXECUTION_ALLOW_LIVE === "true",
    quoteTtlMs: intEnv("QUOTE_TTL_SECONDS", 30) * 1000,
    makerCollateralUsd: process.env.SANDBOX_MAKER_COLLATERAL_USD ?? "1000000",
    publicKeyPem: readFileSync(join(packageRoot, "dev-keys/execution-auth-public.pem"), "utf8"),
    fixturePath: join(packageRoot, "../../fixtures/market-search.json"),
    kalshiEnabled: process.env.KALSHI_ENABLED !== "false",
    kalshiBaseUrl: process.env.KALSHI_API_BASE ?? "https://external-api.kalshi.com/trade-api/v2",
    kalshiSeries: process.env.KALSHI_SERIES_TICKER ?? "KXHIGHNY",
    kalshiTimeoutMs: intEnv("KALSHI_TIMEOUT_MS", 1200),
    polymarketUsApiKey: process.env.POLYMARKET_US_API_KEY || undefined,
  };
  return { ...config, ...overrides };
}
