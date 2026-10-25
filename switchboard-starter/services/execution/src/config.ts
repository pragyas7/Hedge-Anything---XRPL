import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AppConfig {
  port: number;
  bearer: string;
  marketsBaseUrl: string;
  serviceVersion: string;
  allowLive: boolean;
  exchangeAbiPath?: string;
  ap4mMode: "mock" | "live";
  ap4mBaseUrl: string;
  /** Present only when the env var is non-empty. Never log this value. */
  ap4mAgentPrivateKey?: string;
  xrplEvmRpcUrl?: string;
  xrplEvmChainId: number;
  ledgerMode: string;
  ledgerDmkVerified: boolean;
  privateKeyPath: string;
  publicKeyPath: string;
}

export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((candidate) => candidate.length > 0 && existsSync(candidate));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const root = packageRoot();
  const privateKeyPath = clean(env.EXECUTION_AUTH_PRIVATE_KEY_PATH)
    ? path.resolve(env.EXECUTION_AUTH_PRIVATE_KEY_PATH as string)
    : firstExisting([
      path.join(process.cwd(), "services/execution/dev-keys/execution-auth-private.pem"),
      path.join(root, "dev-keys", "execution-auth-private.pem"),
    ]) ?? path.join(root, "dev-keys", "execution-auth-private.pem");
  const publicKeyPath = clean(env.EXECUTION_AUTH_PUBLIC_KEY_PATH)
    ? path.resolve(env.EXECUTION_AUTH_PUBLIC_KEY_PATH as string)
    : firstExisting([
      path.join(process.cwd(), "services/execution/dev-keys/execution-auth-public.pem"),
      path.join(root, "dev-keys", "execution-auth-public.pem"),
    ]) ?? path.join(root, "dev-keys", "execution-auth-public.pem");
  const port = Number(env.PORT ?? 4103);
  return {
    port: Number.isFinite(port) && port > 0 ? port : 4103,
    bearer: env.SWITCHBOARD_DEV_BEARER ?? "switchboard-dev-platform-token",
    marketsBaseUrl: (env.MARKETS_BASE_URL ?? "http://localhost:4102").replace(/\/$/, ""),
    serviceVersion: env.SERVICE_VERSION ?? "1.0.0",
    allowLive: env.EXECUTION_ALLOW_LIVE === "true",
    exchangeAbiPath: clean(env.EXECUTION_EXCHANGE_ABI_PATH),
    ap4mMode: env.AP4M_MODE === "live" ? "live" : "mock",
    ap4mBaseUrl: env.AP4M_BASE_URL ?? "https://hackathon.ap4m.build",
    ap4mAgentPrivateKey: clean(env.AP4M_AGENT_PRIVATE_KEY),
    xrplEvmRpcUrl: clean(env.XRPL_EVM_RPC_URL),
    xrplEvmChainId: Number(env.XRPL_EVM_CHAIN_ID ?? 1449000),
    ledgerMode: env.LEDGER_MODE ?? "unsupported_until_verified",
    ledgerDmkVerified: env.LEDGER_DMK_VERIFIED === "true",
    privateKeyPath,
    publicKeyPath,
  };
}
