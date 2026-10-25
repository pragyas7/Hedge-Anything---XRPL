import { describe, expect, it } from "vitest";
import { ap4mPreflight } from "../src/ap4m-preflight.js";

const KEY = `0x${"ab".repeat(32)}`;
const RESOURCE = "https://merchant.example/infer?token=secret-path";

function fakeFetch(options: { resourceStatus?: number; resourceBody?: unknown; apiStatus?: number; chainHex?: string; apiDown?: boolean } = {}) {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    seen.push(`${init?.method ?? "GET"} ${url}`);
    if (url === RESOURCE) {
      return new Response(JSON.stringify(options.resourceBody ?? { amount: "0.5" }), { status: options.resourceStatus ?? 402 });
    }
    if (url.startsWith("https://hackathon.ap4m.build")) {
      if (options.apiDown) throw new Error("connect ECONNREFUSED");
      return new Response("ok", { status: options.apiStatus ?? 200 });
    }
    const body = JSON.parse(String(init?.body)) as { method: string };
    const result = body.method === "eth_chainId" ? (options.chainHex ?? "0x161c28") : "0x10";
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
  };
  return { fetchImpl, seen };
}

const LIVE_ENV = {
  AP4M_AGENT_PRIVATE_KEY: KEY,
  AP4M_TEAM_NAME: "Penn",
  AP4M_MODE: "live",
  AP4M_RESOURCE_URL: RESOURCE,
  AP4M_CHANNEL_CAP: "5",
};

describe("AP4M preflight", () => {
  it("passes with a 402 resource, a valid key, and chain 1449000", async () => {
    const { fetchImpl, seen } = fakeFetch();
    const report = await ap4mPreflight(LIVE_ENV, fetchImpl);
    expect(report.ready).toBe(true);
    expect(report.checks.every((check) => check.ok)).toBe(true);
    expect(seen.every((line) => line.startsWith("GET ") || line.startsWith("POST https://rpc."))).toBe(true);
    expect(seen.some((line) => line.includes("/public/participant/"))).toBe(false);
  });

  it("never prints the key or the resource path", async () => {
    const { fetchImpl } = fakeFetch();
    const text = JSON.stringify(await ap4mPreflight(LIVE_ENV, fetchImpl));
    expect(text).not.toContain("ab".repeat(32));
    expect(text).not.toContain("secret-path");
    expect(text).toContain("merchant.example");
  });

  it("names missing variables without touching the resource", async () => {
    const { fetchImpl, seen } = fakeFetch();
    const report = await ap4mPreflight({}, fetchImpl);
    expect(report.ready).toBe(false);
    expect(report.checks[0]?.detail).toContain("AP4M_AGENT_PRIVATE_KEY");
    expect(seen.some((line) => line.includes("merchant.example"))).toBe(false);
  });

  it("fails when the resource does not return 402", async () => {
    const { fetchImpl } = fakeFetch({ resourceStatus: 200 });
    const report = await ap4mPreflight(LIVE_ENV, fetchImpl);
    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.name === "HTTP 402 resource")?.detail).toContain("HTTP 200");
  });

  it("fails when the 402 has no price", async () => {
    const { fetchImpl } = fakeFetch({ resourceBody: { message: "pay me" } });
    const report = await ap4mPreflight(LIVE_ENV, fetchImpl);
    expect(report.ready).toBe(false);
  });

  it("reports the portal as down when the API does not answer", async () => {
    const { fetchImpl } = fakeFetch({ apiDown: true });
    const report = await ap4mPreflight(LIVE_ENV, fetchImpl);
    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.name === "AP4M API")?.detail).toContain("portal may be down");
  });

  it("fails on the wrong chain and on a malformed key", async () => {
    const { fetchImpl } = fakeFetch({ chainHex: "0x1" });
    const report = await ap4mPreflight({ ...LIVE_ENV, AP4M_AGENT_PRIVATE_KEY: "not-a-key" }, fetchImpl);
    expect(report.checks.find((check) => check.name === "XRPL EVM RPC")?.ok).toBe(false);
    expect(report.checks.find((check) => check.name === "Agent key format")?.ok).toBe(false);
  });
});
