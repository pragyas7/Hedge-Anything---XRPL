import { REDEEMED_TOPIC } from "./ap4m-chain.js";

export interface SettlementLogReport {
  provider: "quicknode" | "public-xrpl-evm-testnet";
  label: string;
  rpcHost: string;
  ok: boolean;
  contract: string;
  fromBlock: number | null;
  toBlock: number | null;
  eventCount: number;
  newestTransactionHash: string | null;
  error?: string;
}

const PAYMENT_LEDGER = "0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91";

function hostOf(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "invalid-rpc-url";
  }
}

function target(env: NodeJS.ProcessEnv): { url: string; provider: SettlementLogReport["provider"]; label: string } {
  const quicknode = (env.QUICKNODE_RPC_URL ?? env.QUICKNODE_XRPL_EVM_HTTP ?? "").trim();
  if (quicknode) {
    return {
      url: quicknode,
      provider: "quicknode",
      label: "QuickNode HTTP endpoint. The URL path is hidden because it can contain an API token.",
    };
  }
  return {
    url: (env.XRPL_EVM_RPC_URL ?? "").trim() || "https://rpc.testnet.xrplevm.org",
    provider: "public-xrpl-evm-testnet",
    label: "Public XRPL EVM testnet RPC. This log read did not use QuickNode.",
  };
}

/**
 * Reads recent PaymentLedger VoucherRedeemed logs.
 * The topic is the keccak256 of the event signature. A quiet range is zero events, not a payment.
 */
export async function readPaymentLedgerLogs(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  topic: string = REDEEMED_TOPIC,
): Promise<SettlementLogReport> {
  const rpc = target(env);
  const contract = (env.AP4M_PAYMENT_LEDGER ?? PAYMENT_LEDGER).trim();
  const base = {
    provider: rpc.provider,
    label: rpc.label,
    rpcHost: hostOf(rpc.url),
    contract,
  };
  try {
    const headResponse = await fetchImpl(rpc.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal: AbortSignal.timeout(4000),
    });
    const head = await headResponse.json() as { result?: unknown; error?: { message?: string } };
    if (!headResponse.ok || typeof head.result !== "string") {
      throw new Error(head.error?.message || `RPC HTTP ${headResponse.status}`);
    }
    const toBlock = Number.parseInt(head.result, 16);
    const fromBlock = Math.max(0, toBlock - 20);
    const logsResponse = await fetchImpl(rpc.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "eth_getLogs",
        params: [{
          address: contract,
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
          topics: [topic],
        }],
      }),
    });
    const logsBody = await logsResponse.json() as { result?: unknown; error?: { message?: string } };
    if (!logsResponse.ok || !Array.isArray(logsBody.result)) {
      throw new Error(logsBody.error?.message || `eth_getLogs HTTP ${logsResponse.status}`);
    }
    const newest = logsBody.result.length > 0
      ? logsBody.result[logsBody.result.length - 1] as { transactionHash?: unknown }
      : undefined;
    return {
      ...base,
      ok: true,
      fromBlock,
      toBlock,
      eventCount: logsBody.result.length,
      newestTransactionHash: typeof newest?.transactionHash === "string" ? newest.transactionHash : null,
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      fromBlock: null,
      toBlock: null,
      eventCount: 0,
      newestTransactionHash: null,
      error: error instanceof Error ? error.message : "Log read failed.",
    };
  }
}
