import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportJWK } from "jose";
import { describe, expect, it } from "vitest";
import { capabilityRegistry, XRPL_EVM_CHAIN_ID } from "../src/capability-registry.js";
import { packageRoot } from "../src/config.js";
import { authSeedBytes, deriveAuthKeysFromSeed, loadAuthKeys } from "../src/keys.js";
import { allInUnitPrice } from "../src/money.js";
import { computePlanHash, isPlaceholderPlanHash, PLACEHOLDER_PLAN_HASH, withComputedPlanHash } from "../src/plan-hash.js";
import { loadFixturePlan } from "./helpers.js";
import type { HedgePlan } from "@switchboard/contracts";

describe("plan hash", () => {
  it("rejects the fixture placeholder and ignores status and planHash", () => {
    const plan = loadFixturePlan();
    expect(isPlaceholderPlanHash(PLACEHOLDER_PLAN_HASH)).toBe(true);
    expect(plan.planHash).not.toBe(PLACEHOLDER_PLAN_HASH);
    expect(plan.planHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const changedStatus = structuredClone(plan);
    changedStatus.status = "APPROVED";
    changedStatus.planHash = "sha256:whatever";
    expect(computePlanHash(changedStatus)).toBe(plan.planHash);
    const changedWarning = structuredClone(plan);
    changedWarning.warnings = [...changedWarning.warnings, "changed"];
    expect(computePlanHash(changedWarning)).not.toBe(plan.planHash);
  });

  it("uses the leg all-in unit price", () => {
    const plan = loadFixturePlan();
    const leg = plan.legs[0];
    expect(leg).toBeDefined();
    expect(allInUnitPrice(leg!.estimatedAllInCostUsd, leg!.quantity)).toBe("20.4");
  });
});

describe("deterministic auth key", () => {
  it("uses a 32-byte seed and matches the committed public key", async () => {
    expect(authSeedBytes().length).toBe(32);
    const derived = await deriveAuthKeysFromSeed();
    const root = packageRoot();
    const loaded = await loadAuthKeys(
      path.join(root, "dev-keys", "execution-auth-private.pem"),
      path.join(root, "dev-keys", "execution-auth-public.pem"),
    );
    const fromFile = await exportJWK(loaded.publicKey);
    expect(fromFile.x).toBe(derived.publicJwk.x);
    expect(fromFile.crv).toBe("Ed25519");
    const pem = readFileSync(path.join(root, "dev-keys", "execution-auth-public.pem"), "utf8");
    expect(pem).toContain("BEGIN PUBLIC KEY");
    expect(loaded.publicJwk.d).toBeUndefined();
  });
});

describe("ledger capability registry", () => {
  it("marks ledger_agent_intent unsupported on XRPL EVM and notes ETH/SOL", () => {
    const intent = capabilityRegistry.ledger_agent_intent;
    expect(intent.supportedForChain(XRPL_EVM_CHAIN_ID)).toBe(false);
    expect(intent.supportedNetworks).toEqual(["ethereum", "solana"]);
    expect(intent.docUrl).toBe("https://developers.ledger.com/docs/ai-tools/agent-intent");
    expect(intent.note.toLowerCase()).toContain("1449000");
    expect(capabilityRegistry.ledger_dmk_verified.supportedForChain(1449000)).toBe(false);
    expect(capabilityRegistry.ledger_dmk_verified.docUrl).toContain("signers/eth");
  });
});

describe("raw fixture", () => {
  it("still contains the untrusted placeholder", () => {
    const raw = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../fixtures/hedge-plan.json"), "utf8")) as HedgePlan;
    expect(raw.planHash).toBe(PLACEHOLDER_PLAN_HASH);
    expect(withComputedPlanHash(raw).planHash).not.toBe(PLACEHOLDER_PLAN_HASH);
  });
});
