import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { SettlementReceipt } from "@switchboard/contracts";
import { XRPL_EVM_CHAIN_ID } from "./capability-registry.js";

export const REAL_TX_HASH = /^0x[0-9a-fA-F]{64}$/;
export const SYNTHETIC_TX_HASH = "synthetic_not_a_transaction";

export interface ExchangeSettlementClient {
  readonly mode: "sandbox_simulator" | "abi_loaded";
  readonly canReportRealTxHash: false;
  observe(input: { clientOrderId: string; instrumentId?: string; now: Date }): Promise<SettlementReceipt>;
}

function unconfirmedReceipt(input: {
  now: Date;
  mode: string;
  note: string;
  extra?: Record<string, string>;
}): SettlementReceipt {
  return {
    receiptId: `receipt_${randomUUID()}`,
    kind: "exchange_settlement",
    chainId: XRPL_EVM_CHAIN_ID,
    transactionHash: SYNTHETIC_TX_HASH,
    confirmed: false,
    observedAt: input.now.toISOString(),
    metadata: {
      mode: input.mode,
      canReportRealTxHash: "false",
      note: input.note,
      ...input.extra,
    },
  };
}

class SandboxSettlementSimulator implements ExchangeSettlementClient {
  readonly mode = "sandbox_simulator" as const;
  readonly canReportRealTxHash = false as const;
  constructor(private readonly reason: string) {}

  async observe(input: { clientOrderId: string; instrumentId?: string; now: Date }): Promise<SettlementReceipt> {
    return unconfirmedReceipt({
      now: input.now,
      mode: "sandbox_simulator",
      note: "Sandbox simulator cannot report a real transaction hash. No chain receipt was observed.",
      extra: {
        clientOrderId: input.clientOrderId,
        reason: this.reason,
        ...(input.instrumentId ? { instrumentId: input.instrumentId } : {}),
      },
    });
  }
}

class AbiLoadedSettlementClient implements ExchangeSettlementClient {
  readonly mode = "abi_loaded" as const;
  readonly canReportRealTxHash = false as const;
  constructor(private readonly abiSummary: string) {}

  async observe(input: { clientOrderId: string; instrumentId?: string; now: Date }): Promise<SettlementReceipt> {
    return unconfirmedReceipt({
      now: input.now,
      mode: "abi_loaded",
      note: "ABI was loaded but no RPC receipt was observed. Refusing to invent a transaction hash.",
      extra: {
        clientOrderId: input.clientOrderId,
        abi: this.abiSummary,
        ...(input.instrumentId ? { instrumentId: input.instrumentId } : {}),
      },
    });
  }
}

export function createSettlementClient(
  abiPath: string | undefined,
  readText: (filePath: string) => string = (filePath) => readFileSync(filePath, "utf8"),
): ExchangeSettlementClient {
  if (!abiPath) return new SandboxSettlementSimulator("EXECUTION_EXCHANGE_ABI_PATH unset");
  try {
    const parsed = JSON.parse(readText(abiPath)) as unknown;
    const summary = Array.isArray(parsed) ? `array:${parsed.length}` : typeof parsed;
    return new AbiLoadedSettlementClient(summary);
  } catch {
    return new SandboxSettlementSimulator("abi_path_unreadable");
  }
}

export function isRealTxHash(value: string | undefined): boolean {
  return typeof value === "string" && REAL_TX_HASH.test(value);
}
