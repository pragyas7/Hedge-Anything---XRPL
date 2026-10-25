import { describe, expect, it } from "vitest";
import { id } from "ethers";
import { runAp4mPayment } from "../src/ap4m-live.js";
import { awsSponsorStatus, handleInvocation } from "../src/aws-agentcore.js";
import { REDEEMED_TOPIC, VOUCHER_REDEEMED_EVENT } from "../src/ap4m-chain.js";
import { CLEAR_SIGN_FORMAT, CLEAR_SIGN_METADATA } from "../src/clear-sign.js";
import { ledgerDeviceStatus } from "../src/ledger-device.js";
import { readPaymentLedgerLogs } from "../src/quicknode.js";
import { sponsorStatus } from "../src/sponsors.js";

const SECRET = "0xdo-not-echo-this-key";
const REDEEM = `0x${"11".repeat(32)}`;
const PAYOUT = `0x${"22".repeat(32)}`;

function liveEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    AP4M_AGENT_PRIVATE_KEY: SECRET,
    AP4M_TEAM_NAME: "Penn",
    AP4M_MODE: "live",
    AP4M_RESOURCE_URL: "https://merchant.test/resource",
    AP4M_CHANNEL_ID: "0xchannel",
    AP4M_BASE_URL: "https://ap4m.test",
    ...extra,
  };
}

describe("AP4M payment stays honest without a payout", () => {
  it("does not fetch or sign when credentials are missing", async () => {
    const report = await runAp4mPayment({}, {
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      },
    });
    expect(report.settled).toBe(false);
    expect(report.attempted).toBe(false);
    expect(report.txHash).toBeNull();
    expect(report.missing).toContain("AP4M_AGENT_PRIVATE_KEY");
    expect(report.missing).toContain("AP4M_MODE=live");
  });

  it("does not sign when the resource is not HTTP 402", async () => {
    const report = await runAp4mPayment(liveEnv(), {
      fetchImpl: async () => new Response("{}", { status: 200 }),
      signIn: async () => {
        throw new Error("sign-in should not run");
      },
    });
    expect(report.attempted).toBe(true);
    expect(report.settled).toBe(false);
    expect(report.stepsRun).toEqual(["fetch-resource"]);
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  it("marks settled only when settle returns a 32-byte payout hash", async () => {
    const report = await runAp4mPayment(liveEnv(), {
      signIn: async () => ({ token: "session-token" }),
      payOnChain: async () => ({ txHash: REDEEM, channelId: "0xchannel" }),
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/resource")) return new Response(JSON.stringify({ amountUsd: "1.5" }), { status: 402 });
        if (url.endsWith("/record-redemption")) return new Response("{}", { status: 200 });
        if (url.endsWith("/settle")) {
          return new Response(JSON.stringify({
            payout_tx: PAYOUT,
            amount_rlusd: "1.5",
            receipt_url: "https://ap4m.test/r/1",
          }), { status: 200 });
        }
        throw new Error(`unexpected ${url}`);
      },
    });
    expect(report.settled).toBe(true);
    expect(report.txHash).toBe(REDEEM);
    expect(report.payoutTx).toBe(PAYOUT);
    expect(report.amountRlusd).toBe("1.5");
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  it("keeps a redeem hash unsettled when settle has no payout transaction", async () => {
    const report = await runAp4mPayment(liveEnv(), {
      signIn: async () => ({ token: "session-token" }),
      payOnChain: async () => ({ txHash: REDEEM, channelId: "0xchannel" }),
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/resource")) return new Response(JSON.stringify({ amount: "1" }), { status: 402 });
        if (url.endsWith("/record-redemption")) return new Response("{}", { status: 200 });
        if (url.endsWith("/settle")) return new Response(JSON.stringify({ status: "pending" }), { status: 200 });
        throw new Error(`unexpected ${url}`);
      },
    });
    expect(report.settled).toBe(false);
    expect(report.txHash).toBe(REDEEM);
    expect(report.payoutTx).toBeNull();
    expect(report.note).toContain("not marked as RLUSD settled");
  });
});

describe("PaymentLedger log topic", () => {
  it("uses the keccak of VoucherRedeemed and hides the RPC path", async () => {
    expect(REDEEMED_TOPIC).toBe(id(VOUCHER_REDEEMED_EVENT));
    expect(REDEEMED_TOPIC).not.toBe("0x8f0b4f0e6a0e5a5c5e5b5d5c5a595857565554535251504f4e4d4c4b4a494847");
    let seenTopic = "";
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params?: [{ topics?: string[] }] };
      if (body.method === "eth_getLogs") seenTopic = body.params?.[0]?.topics?.[0] ?? "";
      const result = body.method === "eth_blockNumber" ? "0x20" : [];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
    };
    const report = await readPaymentLedgerLogs({
      QUICKNODE_RPC_URL: "https://example.quiknode.pro/secret-token-value/",
    }, fetchImpl);
    expect(seenTopic).toBe(REDEEMED_TOPIC);
    expect(report.provider).toBe("quicknode");
    expect(report.rpcHost).toBe("example.quiknode.pro");
    expect(report.eventCount).toBe(0);
    expect(JSON.stringify(report)).not.toContain("secret-token-value");
  });

  it("labels the public RPC and does not invent a transaction", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      const result = body.method === "eth_blockNumber" ? "0x10" : [];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
    };
    const report = await readPaymentLedgerLogs({ XRPL_EVM_RPC_URL: "https://rpc.testnet.xrplevm.org" }, fetchImpl);
    expect(report.ok).toBe(true);
    expect(report.provider).toBe("public-xrpl-evm-testnet");
    expect(report.label).toContain("not use QuickNode");
    expect(report.eventCount).toBe(0);
    expect(report.newestTransactionHash).toBeNull();
  });

  it("keeps every eth_getLogs span within QuickNode's 5-block free-plan limit", async () => {
    const spans: Array<[number, number]> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params?: [{ fromBlock: string; toBlock: string }] };
      if (body.method === "eth_blockNumber") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x64" }), { status: 200 });
      }
      const from = Number.parseInt(body.params![0].fromBlock, 16);
      const to = Number.parseInt(body.params![0].toBlock, 16);
      spans.push([from, to]);
      const result = from <= 0x60 && 0x60 <= to ? [{ transactionHash: `0x${"cd".repeat(32)}` }] : [];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result }), { status: 200 });
    };
    const report = await readPaymentLedgerLogs({ QUICKNODE_RPC_URL: "https://example.quiknode.pro/token/" }, fetchImpl);
    expect(report.ok).toBe(true);
    expect(report.fromBlock).toBe(80);
    expect(report.toBlock).toBe(100);
    expect(spans.every(([from, to]) => to - from + 1 <= 5)).toBe(true);
    const covered = spans.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => from + i)).sort((a, b) => a - b);
    expect(covered).toEqual(Array.from({ length: 21 }, (_, i) => 80 + i));
    expect(report.eventCount).toBe(1);
    expect(report.newestTransactionHash).toBe(`0x${"cd".repeat(32)}`);
  });
});

describe("AWS AgentCore stand-in", () => {
  it("stays undeployed with or without credential names", () => {
    const empty = awsSponsorStatus({});
    expect(empty.deployed).toBe(false);
    expect(empty.missing).toEqual([
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_REGION",
      "AGENTCORE_RUNTIME_ARN",
    ]);
    const filled = awsSponsorStatus({
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AGENTCORE_RUNTIME_ARN: "arn:aws:bedrock-agentcore:us-east-1:0:runtime/demo",
    });
    expect(filled.deployed).toBe(false);
    expect(filled.missing).toEqual([]);
    expect(JSON.stringify(filled)).not.toContain("secret");
    const platformRegion = awsSponsorStatus({ AWS_REGION: "us-east-1" });
    expect(platformRegion.deployed).toBe(false);
    expect(platformRegion.missing).toContain("AWS_REGION");
    expect(platformRegion.missing).toContain("AWS_ACCESS_KEY_ID");
  });

  it("does not pay without a 402, and does not settle a 402 when AP4M keys are absent", async () => {
    const idle = await handleInvocation({}, {}, async () => {
      throw new Error("fetch should not run");
    });
    expect(idle.pay).toBe(false);
    expect(idle.awsDeployed).toBe(false);
    expect(idle.settlement).toBeNull();

    const quoted = await handleInvocation(
      { resourceUrl: "https://merchant.test/resource" },
      {},
      async () => new Response(JSON.stringify({ amountUsd: "1" }), { status: 402 }),
    );
    expect(quoted.pay).toBe(true);
    expect(quoted.awsDeployed).toBe(false);
    expect(quoted.settlement?.settled).toBe(false);
    expect(quoted.settlement?.attempted).toBe(false);
  });
});

describe("Ledger and combined sponsor status", () => {
  it("does not claim a device or a signature", async () => {
    const ledger = await ledgerDeviceStatus();
    expect(ledger.deviceSeen).toBe(false);
    expect(ledger.signed).toBe(false);
    expect(ledger.agentIntent).toBe("UNSUPPORTED");
    expect(ledger.chainId).toBe(1449000);
    expect(ledger.clearSignFormat).toBe(CLEAR_SIGN_FORMAT);
    expect(CLEAR_SIGN_METADATA.format).toBe("switchboard.xrpl-clear-sign.v1");
    expect(CLEAR_SIGN_METADATA.notDeviceClearSigning).toBe(true);
  });

  it("reports every sponsor without echoing a key", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      const result = body.method === "eth_blockNumber" ? "0x10" : [];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
    };
    const report = await sponsorStatus({ AP4M_AGENT_PRIVATE_KEY: SECRET, AP4M_TEAM_NAME: "Penn" }, fetchImpl);
    expect(report.ap4m.settled).toBe(false);
    expect(report.ap4m.present).toContain("team name");
    expect(report.ap4m.missing).toContain("AP4M_MODE=live");
    expect(report.quicknode.provider).toBe("public-xrpl-evm-testnet");
    expect(report.aws).toBeUndefined();
    expect(report.ledger.signed).toBe(false);
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  it("reports AWS only when the parked track is switched back on", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x10" }), { status: 200 });
    const report = await sponsorStatus({ AWS_AGENTCORE_ENABLED: "true" }, fetchImpl);
    expect(report.aws?.deployed).toBe(false);
    expect(report.aws?.missing).toContain("AGENTCORE_RUNTIME_ARN");
  });
});
