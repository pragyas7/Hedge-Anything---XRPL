/**
 * Ledger approval for the demo, through Speculos (Ledger's device emulator) running the real XRP app.
 *
 * The device signs an XRPL testnet AccountSet whose memo is the plan hash. The server verifies the
 * signature, the account, the public key, and the memo before the plan counts as Ledger-approved,
 * then submits it so the approval has a testnet transaction hash.
 *
 * Off unless LEDGER_SPECULOS_URL is set. Ledger and xrpl packages load lazily, so a deploy without
 * the emulator never loads them.
 */

export const MEMO_TYPE = "switchboard/plan-approval";
const DEFAULT_PATH = "44'/144'/0'/0/0";
const DEFAULT_WSS = "wss://s.altnet.rippletest.net:51233";
const FAUCET = "https://faucet.altnet.rippletest.net/accounts";
/** The device waits for a person. Give up after this long so the request cannot hang forever. */
const SIGN_TIMEOUT_MS = 180_000;

export interface LedgerConfig {
  url: string;
  model: string;
  path: string;
  wss: string;
}

export function ledgerConfig(env: NodeJS.ProcessEnv = process.env): LedgerConfig | null {
  const url = (env.LEDGER_SPECULOS_URL ?? "").trim().replace(/\/+$/, "");
  if (!url) return null;
  return {
    url,
    model: (env.LEDGER_SPECULOS_MODEL ?? "STAX").trim().toUpperCase(),
    path: (env.LEDGER_DERIVATION_PATH ?? DEFAULT_PATH).trim(),
    wss: (env.XRPL_TESTNET_WSS ?? DEFAULT_WSS).trim(),
  };
}

export interface LedgerStatus {
  enabled: boolean;
  reachable: boolean;
  emulator: boolean;
  model: string | null;
  address: string | null;
  note: string;
}

export interface LedgerApproval {
  txHash: string;
  result: string;
  address: string;
  publicKey: string;
  explorerUrl: string;
}

export interface VerifyResult {
  ok: boolean;
  reason: string;
}

/** LEDGER_DEBUG=1 prints each approval step with timing to stderr. */
const debug = (step: string, detail = "") => {
  if (process.env.LEDGER_DEBUG === "1") console.error(`[ledger] ${new Date().toISOString().slice(11, 23)} ${step} ${detail}`);
};

const hexOf = (text: string) => Buffer.from(text, "utf8").toString("hex").toUpperCase();
const textOf = (hex: unknown) => (typeof hex === "string" ? Buffer.from(hex, "hex").toString("utf8") : "");

/**
 * Checks a signed transaction blob before the plan counts as approved: it must be an AccountSet
 * from the expected account, signed by the expected key, carrying exactly this plan hash.
 */
export async function verifyApprovalTx(
  signedBlob: string,
  expected: { planHash: string; address: string; publicKey: string },
): Promise<VerifyResult> {
  const xrpl = await import("xrpl");
  let tx: Record<string, unknown>;
  try {
    tx = xrpl.decode(signedBlob) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "The signed transaction could not be decoded." };
  }
  if (tx.TransactionType !== "AccountSet") return { ok: false, reason: "The device signed something other than the approval transaction." };
  if (tx.Account !== expected.address) return { ok: false, reason: "The signing account is not the Ledger account." };
  const signingKey = String(tx.SigningPubKey ?? "").toUpperCase();
  if (signingKey !== expected.publicKey.toUpperCase()) return { ok: false, reason: "The signing key is not the Ledger key." };
  if (xrpl.deriveAddress(signingKey) !== expected.address) return { ok: false, reason: "The signing key does not belong to the Ledger account." };
  const memos = Array.isArray(tx.Memos) ? tx.Memos as Array<{ Memo?: { MemoType?: string; MemoData?: string } }> : [];
  const memo = memos.find((entry) => textOf(entry.Memo?.MemoType) === MEMO_TYPE)?.Memo;
  if (!memo || textOf(memo.MemoData) !== expected.planHash) return { ok: false, reason: "The signed memo is not this plan's hash." };
  let signatureOk = false;
  try {
    signatureOk = xrpl.verifySignature(signedBlob, signingKey);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return { ok: false, reason: "The signature does not verify." };
  return { ok: true, reason: "Signature, account, key, and plan hash all match." };
}

type Signer = {
  getAddress: (path: string, options: { checkOnDevice: boolean }) => { observable: import("rxjs").Observable<unknown>; cancel: () => void };
  signTransaction: (path: string, tx: Uint8Array) => { observable: import("rxjs").Observable<unknown>; cancel: () => void };
};

interface DeviceResult<T> {
  status: string;
  output?: T;
  error?: unknown;
}

async function finish<T>(action: { observable: import("rxjs").Observable<unknown>; cancel: () => void }, timeoutMs: number): Promise<T> {
  const { firstValueFrom, filter, timeout } = await import("rxjs");
  try {
    const result = await firstValueFrom((action.observable as import("rxjs").Observable<DeviceResult<T>>).pipe(
      filter((state) => state.status === "completed" || state.status === "error"),
      timeout(timeoutMs),
    ));
    if (result.status === "error") {
      const message = result.error && typeof result.error === "object" && "message" in result.error
        ? String((result.error as { message: unknown }).message)
        : "The device reported an error.";
      throw new Error(/rejected by user/i.test(message) ? "The approval was rejected on the Ledger." : message);
    }
    return result.output as T;
  } catch (error) {
    debug("device action failed", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    action.cancel();
    if (error instanceof Error && error.name === "TimeoutError") throw new Error("Nobody approved on the device in time. Nothing was signed.");
    throw error;
  }
}

export class LedgerApprover {
  private signer: Signer | null = null;
  private account: { address: string; publicKey: string } | null = null;
  private busy = false;

  constructor(readonly config: LedgerConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  private async connect(): Promise<{ signer: Signer; address: string; publicKey: string }> {
    if (this.signer && this.account) return { signer: this.signer, ...this.account };
    const dmkMod = await import("@ledgerhq/device-management-kit");
    const { SignerXrpBuilder } = await import("@ledgerhq/device-signer-kit-xrp");
    const { speculosTransportFactory, speculosIdentifier } = await import("@ledgerhq/device-transport-kit-speculos");
    const { firstValueFrom, timeout } = await import("rxjs");
    const model = (dmkMod.DeviceModelId as Record<string, string>)[this.config.model] ?? dmkMod.DeviceModelId.STAX;
    const dmk = new dmkMod.DeviceManagementKitBuilder()
      .addTransport(speculosTransportFactory(this.config.url, false, model as typeof dmkMod.DeviceModelId.STAX))
      .build();
    const device = await firstValueFrom(dmk.startDiscovering({ transport: speculosIdentifier }).pipe(timeout(10_000)));
    const sessionId = await dmk.connect({ device });
    const signer = new SignerXrpBuilder({ dmk, sessionId }).build() as unknown as Signer;
    const output = await finish<{ address: string; publicKey: string }>(signer.getAddress(this.config.path, { checkOnDevice: false }), 30_000);
    this.signer = signer;
    this.account = { address: output.address, publicKey: output.publicKey.toUpperCase() };
    return { signer, ...this.account };
  }

  async status(): Promise<LedgerStatus> {
    const base = { enabled: true, emulator: true, model: this.config.model };
    try {
      const response = await this.fetchImpl(this.config.url, { signal: AbortSignal.timeout(2000) });
      if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
    } catch {
      return { ...base, reachable: false, address: null, note: `Speculos did not answer at ${this.config.url}. Start it, or approve in the app.` };
    }
    try {
      const { address } = await this.connect();
      return { ...base, reachable: true, address, note: `Ledger ${this.config.model} emulator (Speculos) running the XRP app. Approvals are signed on it and verified here.` };
    } catch (error) {
      this.signer = null;
      this.account = null;
      return { ...base, reachable: false, address: null, note: `Speculos answered but the XRP app did not: ${error instanceof Error ? error.message : "unknown error"}.` };
    }
  }

  /** Signs the plan hash on the device, verifies it, and submits it to XRPL testnet. */
  async approve(planHash: string): Promise<LedgerApproval> {
    if (this.busy) throw new Error("The device is already waiting on another approval.");
    this.busy = true;
    const xrpl = await import("xrpl");
    const dmkMod = await import("@ledgerhq/device-management-kit");
    const client = new xrpl.Client(this.config.wss);
    try {
      debug("approve", planHash);
      const { signer, address, publicKey } = await this.connect();
      await client.connect();
      debug("xrpl connected");
      await this.ensureFunded(client, address);
      debug("funded", address);
      const tx = await client.autofill({
        TransactionType: "AccountSet",
        Account: address,
        SigningPubKey: publicKey,
        Memos: [{ Memo: { MemoType: hexOf(MEMO_TYPE), MemoData: hexOf(planHash) } }],
        // autofill allows about a minute. A person reading the device screen needs longer.
        LastLedgerSequence: (await client.getLedgerIndex()) + 150,
      });
      const unsigned = xrpl.encode(tx);
      const bytes = dmkMod.hexaStringToBuffer(unsigned);
      if (!bytes) throw new Error("Could not serialize the approval transaction.");
      debug("signing on device");
      const signature = await finish<Uint8Array>(signer.signTransaction(this.config.path, bytes), SIGN_TIMEOUT_MS);
      const signed = xrpl.encode({ ...tx, TxnSignature: dmkMod.bufferToHexaString(signature, false).toUpperCase() });
      debug("signed");
      const verified = await verifyApprovalTx(signed, { planHash, address, publicKey });
      if (!verified.ok) throw new Error(`${verified.reason} The plan was not approved.`);
      const submitted = await client.submitAndWait(signed);
      const meta = submitted.result.meta;
      const result = typeof meta === "object" && meta && "TransactionResult" in meta ? String(meta.TransactionResult) : "unknown";
      if (result !== "tesSUCCESS") throw new Error(`XRPL testnet returned ${result}. The plan was not approved.`);
      return {
        txHash: submitted.result.hash,
        result,
        address,
        publicKey,
        explorerUrl: `https://testnet.xrpl.org/transactions/${submitted.result.hash}`,
      };
    } finally {
      this.busy = false;
      if (client.isConnected()) await client.disconnect();
    }
  }

  private async ensureFunded(client: import("xrpl").Client, address: string): Promise<void> {
    try {
      await client.getXrpBalance(address);
      return;
    } catch (error) {
      const code = (error as { data?: { error?: string } }).data?.error;
      if (code !== "actNotFound") throw error;
    }
    const response = await this.fetchImpl(FAUCET, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destination: address }),
    });
    if (!response.ok) throw new Error(`The testnet faucet returned HTTP ${response.status}.`);
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        await client.getXrpBalance(address);
        return;
      } catch {
        // Not funded yet.
      }
    }
    throw new Error("The testnet faucet did not fund the Ledger account in time.");
  }

  async screenshot(): Promise<Response> {
    return this.fetchImpl(`${this.config.url}/screenshot`, { signal: AbortSignal.timeout(3000) });
  }

  async finger(action: "press" | "release", x: number, y: number): Promise<void> {
    await this.fetchImpl(`${this.config.url}/finger`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, x, y }),
      signal: AbortSignal.timeout(3000),
    });
  }
}
