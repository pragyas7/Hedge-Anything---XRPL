import { describe, expect, it } from "vitest";
import { ECDSA, Wallet, decode, encode } from "xrpl";
import { MEMO_TYPE, ledgerConfig, verifyApprovalTx } from "../../../demo/ledger.js";

const PLAN = "sha256:0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";
const hex = (text: string) => Buffer.from(text, "utf8").toString("hex").toUpperCase();

/** A software key stands in for the device. The check only sees a signed blob either way. */
function signApproval(wallet: Wallet, overrides: Record<string, unknown> = {}, planHash = PLAN): string {
  const tx = {
    TransactionType: "AccountSet",
    Account: wallet.classicAddress,
    Fee: "12",
    Sequence: 7,
    LastLedgerSequence: 1000,
    Memos: [{ Memo: { MemoType: hex(MEMO_TYPE), MemoData: hex(planHash) } }],
    ...overrides,
  };
  return wallet.sign(tx as never).tx_blob;
}

const device = Wallet.generate(ECDSA.secp256k1);
const expected = { planHash: PLAN, address: device.classicAddress, publicKey: device.publicKey };

describe("Ledger approval verification", () => {
  it("accepts the plan hash signed by the Ledger account", async () => {
    const result = await verifyApprovalTx(signApproval(device), expected);
    expect(result).toEqual({ ok: true, reason: expect.stringContaining("match") });
  });

  it("rejects a signature over a different plan", async () => {
    const result = await verifyApprovalTx(signApproval(device, {}, "sha256:another-plan"), expected);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("plan's hash");
  });

  it("rejects a different account signing the right plan", async () => {
    const other = Wallet.generate(ECDSA.secp256k1);
    const result = await verifyApprovalTx(signApproval(other), expected);
    expect(result.ok).toBe(false);
  });

  it("rejects a blob whose signature was tampered with", async () => {
    const tx = decode(signApproval(device)) as Record<string, unknown>;
    const signature = String(tx.TxnSignature);
    const flipped = signature.slice(0, -2) + (signature.endsWith("00") ? "01" : "00");
    const result = await verifyApprovalTx(encode({ ...tx, TxnSignature: flipped } as never), expected);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("signature");
  });

  it("rejects a memo that was changed after signing", async () => {
    const tx = decode(signApproval(device)) as Record<string, unknown>;
    const swapped = { ...tx, Memos: [{ Memo: { MemoType: hex(MEMO_TYPE), MemoData: hex("sha256:swapped") } }] };
    const result = await verifyApprovalTx(encode(swapped as never), { ...expected, planHash: "sha256:swapped" });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("signature");
  });

  it("rejects a transaction that is not the approval AccountSet", async () => {
    const payment = signApproval(device, { TransactionType: "Payment", Destination: Wallet.generate().classicAddress, Amount: "1" });
    const result = await verifyApprovalTx(payment, expected);
    expect(result.ok).toBe(false);
  });

  it("rejects garbage", async () => {
    expect((await verifyApprovalTx("not-a-transaction", expected)).ok).toBe(false);
  });
});

describe("Ledger config", () => {
  it("is off unless LEDGER_SPECULOS_URL is set", () => {
    expect(ledgerConfig({})).toBeNull();
    expect(ledgerConfig({ LEDGER_SPECULOS_URL: "http://127.0.0.1:5001/" })).toMatchObject({ url: "http://127.0.0.1:5001", model: "STAX" });
  });
});
