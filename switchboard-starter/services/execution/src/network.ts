export interface NetworkReport {
  ok: boolean;
  provider: "quicknode" | "public-xrpl-evm-testnet";
  label: string;
  rpcHost: string;
  expectedChainId: number;
  chainId: number | null;
  blockNumber: number | null;
  chainMatches: boolean;
  error?: string;
}

function hostOf(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "invalid-rpc-url";
  }
}

function hexQuantity(value: unknown): number | null {
  if (typeof value !== "string" || !value.startsWith("0x")) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

async function rpc(fetchImpl: typeof fetch, rpcUrl: string, method: string): Promise<unknown> {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
  });
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (!response.ok || body.error) {
    throw new Error(body.error?.message || `RPC HTTP ${response.status}`);
  }
  return body.result;
}

/** Reads chain id and block number. Never returns the RPC path, so a QuickNode token stays off the page. */
export async function readNetwork(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<NetworkReport> {
  const quicknode = (env.QUICKNODE_RPC_URL ?? env.QUICKNODE_XRPL_EVM_HTTP ?? "").trim();
  const rpcUrl = quicknode || (env.XRPL_EVM_RPC_URL ?? "").trim() || "https://rpc.testnet.xrplevm.org";
  const provider = quicknode ? "quicknode" : "public-xrpl-evm-testnet";
  const expectedChainId = Number(env.XRPL_EVM_CHAIN_ID ?? 1449000);
  const label = quicknode
    ? "QuickNode HTTP endpoint. The URL path is hidden because it can contain an API token."
    : "Public XRPL EVM testnet RPC (rpc.testnet.xrplevm.org). This request did not use QuickNode.";
  const base = {
    provider,
    label,
    rpcHost: hostOf(rpcUrl),
    expectedChainId: Number.isFinite(expectedChainId) ? expectedChainId : 1449000,
  } as const;
  try {
    const chainHex = await rpc(fetchImpl, rpcUrl, "eth_chainId");
    const blockHex = await rpc(fetchImpl, rpcUrl, "eth_blockNumber");
    const chainId = hexQuantity(chainHex);
    const blockNumber = hexQuantity(blockHex);
    return {
      ...base,
      ok: chainId !== null && blockNumber !== null,
      chainId,
      blockNumber,
      chainMatches: chainId === base.expectedChainId,
      ...(chainId !== null && chainId !== base.expectedChainId
        ? { error: `RPC chain id ${chainId} is not the expected XRPL EVM testnet chain id ${base.expectedChainId}.` }
        : {}),
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      chainId: null,
      blockNumber: null,
      chainMatches: false,
      error: error instanceof Error ? error.message : "RPC request failed.",
    };
  }
}
