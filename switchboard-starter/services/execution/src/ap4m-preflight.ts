import { amountFrom402, ap4mRpcUrl, missingAp4mPayment } from "./ap4m-live.js";
import { readNetwork } from "./network.js";

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface Ap4mPreflight {
  ready: boolean;
  checks: PreflightCheck[];
  note: string;
}

const KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/;

function valueOf(env: NodeJS.ProcessEnv, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "an unparseable URL";
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

/**
 * Read-only check before a live AP4M run. It never signs in, signs a voucher, opens a channel,
 * or sends a transaction. Details name variables and hosts only, never secret values or URL paths.
 */
export async function ap4mPreflight(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<Ap4mPreflight> {
  const checks: PreflightCheck[] = [];
  const missing = missingAp4mPayment(env);
  checks.push({
    name: "Variables",
    ok: missing.length === 0,
    detail: missing.length === 0 ? "All required AP4M variables are set." : `Missing: ${missing.join(", ")}.`,
  });

  const key = valueOf(env, ["AP4M_AGENT_PRIVATE_KEY", "AGENT_PRIVATE_KEY"]);
  if (key) {
    checks.push({
      name: "Agent key format",
      ok: KEY_PATTERN.test(key),
      detail: KEY_PATTERN.test(key) ? "Looks like a 32-byte hex private key." : "Expected 64 hex characters, with or without 0x.",
    });
  }

  const apiUrl = (env.AP4M_BASE_URL ?? "https://hackathon.ap4m.build").replace(/\/$/, "");
  try {
    const response = await fetchImpl(apiUrl, { method: "GET" });
    checks.push({
      name: "AP4M API",
      ok: response.status < 500,
      detail: response.status < 500
        ? `${hostOf(apiUrl)} answered with HTTP ${response.status}.`
        : `${hostOf(apiUrl)} answered with HTTP ${response.status}. The portal may be down.`,
    });
  } catch {
    checks.push({ name: "AP4M API", ok: false, detail: `${hostOf(apiUrl)} did not answer. The portal may be down.` });
  }

  const resourceUrl = valueOf(env, ["AP4M_RESOURCE_URL", "RESOURCE_URL"]);
  if (resourceUrl) {
    try {
      const response = await fetchImpl(resourceUrl, { method: "GET" });
      const price = response.status === 402 ? amountFrom402(await readBody(response)) : undefined;
      checks.push({
        name: "HTTP 402 resource",
        ok: response.status === 402 && price !== undefined,
        detail: response.status !== 402
          ? `${hostOf(resourceUrl)} returned HTTP ${response.status}, not 402. The agent would not pay.`
          : price === undefined
            ? `${hostOf(resourceUrl)} returned 402 without a decimal price the agent will authorize.`
            : `${hostOf(resourceUrl)} returned 402 asking ${price} RLUSD.`,
      });
    } catch {
      checks.push({ name: "HTTP 402 resource", ok: false, detail: `${hostOf(resourceUrl)} did not answer.` });
    }
  }

  const rpc = ap4mRpcUrl(env);
  const network = await readNetwork(env, fetchImpl);
  checks.push({
    name: "XRPL EVM RPC",
    ok: network.ok && network.chainMatches,
    detail: network.ok
      ? `${rpc.via === "quicknode" ? "QuickNode" : "Public testnet RPC"} at ${network.rpcHost} reports chain ${network.chainId}${network.chainMatches ? "" : `, expected ${network.expectedChainId}`}.`
      : `${network.rpcHost} did not answer the chain id request.`,
  });

  const ready = checks.every((check) => check.ok);
  return {
    ready,
    checks,
    note: ready
      ? "Ready for a live AP4M run. This check did not sign in, sign a voucher, or move funds."
      : "Not ready for a live AP4M run. Nothing was signed and no funds moved.",
  };
}
