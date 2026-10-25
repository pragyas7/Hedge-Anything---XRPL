import { isRealTxHash } from "./settlement.js";

export interface Ap4mPaymentReport {
  settled: boolean;
  attempted: boolean;
  missing: string[];
  stepsRun: string[];
  txHash: string | null;
  payoutTx: string | null;
  receiptUrl: string | null;
  amountRlusd: string | null;
  note: string;
}

export interface Ap4mChainPayment {
  txHash: string;
  channelId?: string;
}

function filled(env: NodeJS.ProcessEnv, names: string[]): boolean {
  return names.some((name) => {
    const value = env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function valueOf(env: NodeJS.ProcessEnv, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function ap4mRpcUrl(env: NodeJS.ProcessEnv): { url: string; via: "quicknode" | "public-xrpl-evm-testnet" } {
  const quicknode = valueOf(env, ["QUICKNODE_RPC_URL", "QUICKNODE_XRPL_EVM_HTTP"]);
  if (quicknode) return { url: quicknode, via: "quicknode" };
  return {
    url: valueOf(env, ["XRPL_EVM_RPC_URL", "AP4M_RPC_URL"]) ?? "https://rpc.testnet.xrplevm.org",
    via: "public-xrpl-evm-testnet",
  };
}

/** Required before any voucher is signed. Names only. */
export function missingAp4mPayment(env: NodeJS.ProcessEnv): string[] {
  const missing: string[] = [];
  if (!filled(env, ["AP4M_AGENT_PRIVATE_KEY", "AGENT_PRIVATE_KEY"])) missing.push("AP4M_AGENT_PRIVATE_KEY");
  if (!filled(env, ["AP4M_TEAM_NAME", "TEAM_NAME"])) missing.push("AP4M_TEAM_NAME");
  if (env.AP4M_MODE !== "live") missing.push("AP4M_MODE=live");
  if (!filled(env, ["AP4M_RESOURCE_URL", "RESOURCE_URL"])) missing.push("AP4M_RESOURCE_URL");
  if (!filled(env, ["AP4M_CHANNEL_ID", "CHANNEL_ID"]) && !filled(env, ["AP4M_CHANNEL_CAP", "CHANNEL_CAP"])) {
    missing.push("AP4M_CHANNEL_ID or AP4M_CHANNEL_CAP");
  }
  return missing;
}

export function amountFrom402(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const source = body as Record<string, unknown>;
  for (const key of ["amountUsd", "amount", "maxAmountRequired", "value", "price"]) {
    const value = source[key];
    if (typeof value === "string" && /^[0-9]+(?:\.[0-9]+)?$/.test(value.trim())) return value.trim();
  }
  return undefined;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 300) };
  }
}

const empty = (missing: string[], note: string, stepsRun: string[] = []): Ap4mPaymentReport => ({
  settled: false,
  attempted: false,
  missing,
  stepsRun,
  txHash: null,
  payoutTx: null,
  receiptUrl: null,
  amountRlusd: null,
  note,
});

/**
 * Official AP4M sequence: read a real HTTP 402, sign in, redeem, record, settle.
 * settled is true only when settle returns a 32-byte payout transaction.
 */
export async function runAp4mPayment(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    fetchImpl?: typeof fetch;
    signIn?: (input: { apiUrl: string; teamName: string }) => Promise<{ token: string }>;
    payOnChain?: (input: { token: string; priceRlusd: string; rpcUrl: string }) => Promise<Ap4mChainPayment>;
  } = {},
): Promise<Ap4mPaymentReport> {
  const missing = missingAp4mPayment(env);
  if (missing.length > 0) {
    return empty(missing, "Live RLUSD settlement was not attempted. No voucher was signed and no transaction hash was created.");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiUrl = (env.AP4M_BASE_URL ?? "https://hackathon.ap4m.build").replace(/\/$/, "");
  const resourceUrl = valueOf(env, ["AP4M_RESOURCE_URL", "RESOURCE_URL"]) as string;
  const teamName = valueOf(env, ["AP4M_TEAM_NAME", "TEAM_NAME"]) as string;
  const stepsRun: string[] = [];
  const resource = await fetchImpl(resourceUrl, { method: "GET" });
  const resourceBody = await readJson(resource);
  stepsRun.push("fetch-resource");
  if (resource.status !== 402) {
    return {
      ...empty([], "The resource did not return HTTP 402, so no voucher was signed.", stepsRun),
      attempted: true,
    };
  }
  const price = amountFrom402(resourceBody);
  if (!price) {
    return {
      ...empty([], "HTTP 402 had no decimal price this process will authorize. No voucher was signed.", stepsRun),
      attempted: true,
    };
  }
  const signIn = options.signIn ?? (async () => {
    const { signInToAp4m } = await import("./ap4m-chain.js");
    const key = valueOf(env, ["AP4M_AGENT_PRIVATE_KEY", "AGENT_PRIVATE_KEY"]) as string;
    return signInToAp4m({ apiUrl, teamName, privateKey: key, fetchImpl });
  });
  const session = await signIn({ apiUrl, teamName });
  stepsRun.push("sign-in");
  const rpc = ap4mRpcUrl(env);
  const payOnChain = options.payOnChain ?? (async (input: { token: string; priceRlusd: string; rpcUrl: string }) => {
    const { redeemAp4mVoucher } = await import("./ap4m-chain.js");
    const key = valueOf(env, ["AP4M_AGENT_PRIVATE_KEY", "AGENT_PRIVATE_KEY"]) as string;
    return redeemAp4mVoucher({
      apiUrl,
      token: input.token,
      privateKey: key,
      rpcUrl: input.rpcUrl,
      priceRlusd: input.priceRlusd,
      ledgerAddress: valueOf(env, ["AP4M_PAYMENT_LEDGER"]) ?? "0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91",
      channelId: valueOf(env, ["AP4M_CHANNEL_ID", "CHANNEL_ID"]),
      capRlusd: valueOf(env, ["AP4M_CHANNEL_CAP", "CHANNEL_CAP"]),
      merchantId: valueOf(env, ["AP4M_MERCHANT_ID", "MERCHANT_ID"]),
      fetchImpl,
    });
  });
  const paid = await payOnChain({ token: session.token, priceRlusd: price, rpcUrl: rpc.url });
  stepsRun.push("redeem-voucher");
  if (!isRealTxHash(paid.txHash)) {
    return {
      ...empty([], "The chain step did not return a transaction hash. Nothing is marked settled.", stepsRun),
      attempted: true,
    };
  }
  const recorded = await fetchImpl(`${apiUrl}/public/participant/record-redemption`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ tx_hash: paid.txHash }),
  });
  stepsRun.push("record-redemption");
  if (!recorded.ok) {
    const body = await readJson(recorded);
    const message = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `HTTP ${recorded.status}`;
    return {
      settled: false,
      attempted: true,
      missing: [],
      stepsRun,
      txHash: paid.txHash,
      payoutTx: null,
      receiptUrl: null,
      amountRlusd: null,
      note: `Voucher transaction ${paid.txHash} was submitted. record-redemption failed (${message}). RLUSD settlement is not confirmed.`,
    };
  }
  let payoutTx: string | null = null;
  let receiptUrl: string | null = null;
  let amountRlusd: string | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const settled = await fetchImpl(`${apiUrl}/public/participant/settle`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.token}` },
      body: JSON.stringify(paid.channelId ? { channel_id: paid.channelId } : {}),
    });
    const body = await readJson(settled);
    stepsRun.push(attempt === 0 ? "settle" : "settle-poll");
    if (!settled.ok) {
      return {
        settled: false,
        attempted: true,
        missing: [],
        stepsRun,
        txHash: paid.txHash,
        payoutTx: null,
        receiptUrl: null,
        amountRlusd: null,
        note: `Redeem transaction ${paid.txHash} exists. Settle failed with HTTP ${settled.status}. RLUSD payout is not confirmed.`,
      };
    }
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      if (typeof record.payout_tx === "string") payoutTx = record.payout_tx;
      if (typeof record.amount_rlusd === "string") amountRlusd = record.amount_rlusd;
      if (typeof record.receipt_url === "string") receiptUrl = record.receipt_url;
    }
    if (settled.status !== 202) break;
  }
  const settled = isRealTxHash(payoutTx ?? undefined);
  return {
    settled,
    attempted: true,
    missing: [],
    stepsRun,
    txHash: paid.txHash,
    payoutTx,
    receiptUrl,
    amountRlusd,
    note: settled
      ? `RLUSD settle returned payout transaction ${payoutTx}.`
      : `Redeem transaction ${paid.txHash} was submitted. Settle did not return a payout transaction, so this is not marked as RLUSD settled.`,
  };
}
