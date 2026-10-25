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
/** How far back the log read looks, in blocks. */
const LOG_WINDOW = 20;
/** QuickNode's free Discover plan rejects eth_getLogs spans wider than 5 blocks, so each request covers at most 5. */
const LOG_CHUNK = 5;

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
    const fromBlock = Math.max(0, toBlock - LOG_WINDOW);
    const ranges: Array<[number, number]> = [];
    for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK) {
      ranges.push([start, Math.min(start + LOG_CHUNK - 1, toBlock)]);
    }
    const chunks = await Promise.all(ranges.map(async ([start, end], index) => {
      const logsResponse = await fetchImpl(rpc.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(4000),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2 + index,
          method: "eth_getLogs",
          params: [{
            address: contract,
            fromBlock: `0x${start.toString(16)}`,
            toBlock: `0x${end.toString(16)}`,
            topics: [topic],
          }],
        }),
      });
      const logsBody = await logsResponse.json() as { result?: unknown; error?: { message?: string } };
      if (!logsResponse.ok || !Array.isArray(logsBody.result)) {
        throw new Error(logsBody.error?.message || `eth_getLogs HTTP ${logsResponse.status}`);
      }
      return logsBody.result as Array<{ transactionHash?: unknown }>;
    }));
    const logs = chunks.flat();
    const newest = logs.length > 0 ? logs[logs.length - 1] : undefined;
    return {
      ...base,
      ok: true,
      fromBlock,
      toBlock,
      eventCount: logs.length,
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
