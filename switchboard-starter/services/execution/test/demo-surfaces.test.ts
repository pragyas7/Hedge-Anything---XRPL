import { describe, expect, it } from "vitest";
import { ap4mReadiness } from "../src/ap4m-status.js";
import { CLEAR_SIGN_DISCLAIMER, previewXrplTransaction } from "../src/clear-sign.js";
import { readNetwork } from "../src/network.js";

describe("clear-signing preview", () => {
  it("turns a TrustSet into plain language and does not claim a signature", () => {
    const preview = previewXrplTransaction({
      TransactionType: "TrustSet",
      Account: "rDemo",
      LimitAmount: { currency: "USD", issuer: "rIssuer", value: "100" },
    });
    expect(preview.summary).toContain("trust line");
    expect(preview.summary).toContain("Nothing was signed");
    expect(preview.disclaimer).toBe(CLEAR_SIGN_DISCLAIMER);
    expect(preview.disclaimer).toContain("1449000");
    expect(preview.summary.toLowerCase()).not.toContain("signed on ledger");
  });

  it("says when a type has no field summary", () => {
    const preview = previewXrplTransaction({ TransactionType: "NFTokenMint", Account: "rDemo" });
    expect(preview.summary).toContain("raw bytes");
    expect(preview.summary).toContain("Nothing was signed");
  });
});

describe("network label", () => {
  it("hides a QuickNode token and names the provider", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      const result = body.method === "eth_chainId" ? "0x161c28" : "0x10";
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
    };
    const report = await readNetwork({
      QUICKNODE_RPC_URL: "https://example.quiknode.pro/secret-token-value/",
      XRPL_EVM_CHAIN_ID: "1449000",
    }, fetchImpl);
    expect(report.provider).toBe("quicknode");
    expect(report.rpcHost).toBe("example.quiknode.pro");
    expect(JSON.stringify(report)).not.toContain("secret-token-value");
    expect(report.chainId).toBe(1449000);
    expect(report.blockNumber).toBe(16);
    expect(report.chainMatches).toBe(true);
  });

  it("does not call the public RPC a QuickNode request", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: "0x1",
    }), { status: 200 });
    const report = await readNetwork({ XRPL_EVM_RPC_URL: "https://rpc.testnet.xrplevm.org" }, fetchImpl);
    expect(report.provider).toBe("public-xrpl-evm-testnet");
    expect(report.label).toContain("not use QuickNode");
  });
});

describe("AP4M readiness", () => {
  it("names missing variables and does not echo a key", () => {
    const report = ap4mReadiness({ AP4M_AGENT_PRIVATE_KEY: "0xsupersecret" });
    expect(report.settled).toBe(false);
    expect(report.missing).toContain("AP4M_TEAM_NAME");
    expect(report.missing).toContain("AP4M_MODE=live");
    expect(JSON.stringify(report)).not.toContain("supersecret");
    expect(report.chainId).toBe(1449000);
  });
});
