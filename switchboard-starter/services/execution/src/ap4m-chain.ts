import { Contract, JsonRpcProvider, Wallet, id, parseUnits } from "ethers";

const LEDGER_ABI = [
  "function redeemVoucher((bytes32 channelId, uint256 cumulativeAmount) voucher, bytes agentSignature) returns (bytes32 claimId, uint256 amount, bytes32 digest)",
  "function channels(bytes32 channelId) view returns (bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,address,uint64,uint8,address,uint64,address,uint64,uint64,uint64)",
];

export const VOUCHER_REDEEMED_EVENT = "VoucherRedeemed(bytes32,bytes32,bytes32,bytes32,address,bytes32,address,address,uint256,uint256,uint256)";
export const REDEEMED_TOPIC = id(VOUCHER_REDEEMED_EVENT);

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : {};
  return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
}

export async function signInToAp4m(input: {
  apiUrl: string;
  teamName: string;
  privateKey: string;
  fetchImpl: typeof fetch;
}): Promise<{ token: string }> {
  const wallet = new Wallet(input.privateKey);
  const address = await wallet.getAddress();
  const challengeResp = await input.fetchImpl(`${input.apiUrl}/public/participant/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ teamName: input.teamName, wallet: address }),
  });
  const challenge = await readJson(challengeResp);
  if (!challengeResp.ok || typeof challenge.message !== "string" || typeof challenge.challengeId !== "string") {
    throw new Error(`AP4M sign-in challenge failed with HTTP ${challengeResp.status}.`);
  }
  const signature = await wallet.signMessage(challenge.message);
  const sessionResp = await input.fetchImpl(`${input.apiUrl}/public/participant/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challengeId: challenge.challengeId, signature }),
  });
  const session = await readJson(sessionResp);
  if (!sessionResp.ok || typeof session.token !== "string") {
    throw new Error(`AP4M sign-in failed with HTTP ${sessionResp.status}.`);
  }
  return { token: session.token };
}

export async function redeemAp4mVoucher(input: {
  apiUrl: string;
  token: string;
  privateKey: string;
  rpcUrl: string;
  priceRlusd: string;
  ledgerAddress: string;
  channelId?: string;
  capRlusd?: string;
  merchantId?: string;
  fetchImpl: typeof fetch;
}): Promise<{ txHash: string; channelId: string }> {
  const provider = new JsonRpcProvider(input.rpcUrl);
  const wallet = new Wallet(input.privateKey, provider);
  const headers = { "content-type": "application/json", authorization: `Bearer ${input.token}` };
  let channelId = input.channelId;
  if (!channelId) {
    if (!input.capRlusd) throw new Error("AP4M_CHANNEL_ID or AP4M_CHANNEL_CAP is required.");
    const prepareResp = await input.fetchImpl(`${input.apiUrl}/public/participant/channel-requests/prepare`, {
      method: "POST",
      headers,
      body: JSON.stringify({ cap_rlusd: input.capRlusd, merchant_id: input.merchantId }),
    });
    const prepared = await readJson(prepareResp);
    if (!prepareResp.ok || typeof prepared.to !== "string" || typeof prepared.data !== "string") {
      throw new Error(`AP4M channel prepare failed with HTTP ${prepareResp.status}.`);
    }
    const openTx = await wallet.sendTransaction({ to: prepared.to, data: prepared.data });
    await openTx.wait();
    const recordResp = await input.fetchImpl(`${input.apiUrl}/public/participant/channel-requests`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tx_hash: openTx.hash }),
    });
    const recorded = await readJson(recordResp);
    if (!recordResp.ok || typeof recorded.channel_id !== "string") {
      throw new Error(`Channel open was sent as ${openTx.hash} but was not recorded.`);
    }
    channelId = recorded.channel_id;
  }
  const contract = new Contract(input.ledgerAddress, LEDGER_ABI, wallet);
  const channel = await contract.channels(channelId);
  const redeemed = channel[8] as bigint;
  const cumulative = redeemed + parseUnits(input.priceRlusd, 18);
  const chainId = (await provider.getNetwork()).chainId;
  const signature = await wallet.signTypedData(
    { name: "AP4M Payment Ledger", version: "1", chainId, verifyingContract: input.ledgerAddress },
    { Voucher: [{ name: "channelId", type: "bytes32" }, { name: "cumulativeAmount", type: "uint256" }] },
    { channelId, cumulativeAmount: cumulative },
  );
  const tx = await contract.redeemVoucher({ channelId, cumulativeAmount: cumulative }, signature);
  const receipt = await tx.wait();
  const log = receipt?.logs?.find((entry: { address: string; topics: string[] }) => (
    entry.address.toLowerCase() === input.ledgerAddress.toLowerCase() && entry.topics[0] === REDEEMED_TOPIC
  ));
  if (!log) {
    throw new Error(`Transaction ${receipt?.hash ?? tx.hash} did not contain VoucherRedeemed.`);
  }
  return { txHash: receipt?.hash ?? tx.hash, channelId };
}
