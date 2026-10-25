export interface ClearSignLine {
  label: string;
  value: string;
}

export interface ClearSignPreview {
  transactionType: string;
  summary: string;
  lines: ClearSignLine[];
  disclaimer: string;
}

export const CLEAR_SIGN_FORMAT = "switchboard.xrpl-clear-sign.v1";

export const CLEAR_SIGN_METADATA = {
  format: CLEAR_SIGN_FORMAT,
  chain: "xrpl-mainnet-ledger-app",
  notDeviceClearSigning: true,
  types: {
    TrustSet: ["Account", "LimitAmount", "Flags"],
    OfferCreate: ["Account", "TakerPays", "TakerGets"],
    AMMDeposit: ["Account", "Asset", "Asset2", "Amount"],
    EscrowCreate: ["Account", "Destination", "Amount", "CancelAfter", "FinishAfter"],
    Payment: ["Account", "Destination", "Amount", "SendMax"],
  },
} as const;

export const CLEAR_SIGN_DISCLAIMER =
  "Plain-language preview only. This process did not sign anything. It is not a Ledger device signature, not Ledger Clear Signing, and not an ERC-7730 file loaded on a device. ledger_agent_intent stays unsupported on XRPL EVM chain id 1449000. XRPL EVM mainnet chain id 1440000 is not used.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (isRecord(value)) {
    const currency = typeof value.currency === "string" ? value.currency : "issued currency";
    const issuer = typeof value.issuer === "string" ? value.issuer : "unknown issuer";
    const amount = typeof value.value === "string" ? value.value : "unspecified amount";
    return `${amount} ${currency} issued by ${issuer}`;
  }
  return "not provided";
}

function drops(value: unknown): string {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return `${value} drops of XRP (1 XRP = 1000000 drops)`;
  }
  return text(value);
}

function linesFrom(entries: Array<[string, unknown]>, format: (value: unknown) => string = text): ClearSignLine[] {
  return entries
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => ({ label, value: format(value) }));
}

export function previewXrplTransaction(tx: unknown): ClearSignPreview {
  if (!isRecord(tx) || typeof tx.TransactionType !== "string") {
    return {
      transactionType: "unknown",
      summary: "This payload has no XRPL TransactionType. There is no type-aware summary, and nothing was signed.",
      lines: [],
      disclaimer: CLEAR_SIGN_DISCLAIMER,
    };
  }
  const type = tx.TransactionType;
  const account = text(tx.Account);
  let summary = `${type} from ${account}. No type-aware field summary is available yet, so a device signer would only see raw bytes. Nothing was signed.`;
  let lines: ClearSignLine[] = linesFrom([
    ["Account", tx.Account],
    ["Destination", tx.Destination],
  ]);
  if (type === "TrustSet") {
    const limit = text(tx.LimitAmount);
    summary = `${account} would set a trust line for ${limit}. This lets that issuer's currency be held. It does not by itself send a payment. Nothing was signed.`;
    lines = linesFrom([
      ["Account", tx.Account],
      ["Limit", tx.LimitAmount],
      ["Flags", tx.Flags],
    ]);
  } else if (type === "OfferCreate") {
    summary = `${account} would place an order-book offer, paying ${drops(tx.TakerPays)} and asking ${drops(tx.TakerGets)}. Nothing was signed.`;
    lines = linesFrom([
      ["Account", tx.Account],
      ["Taker pays", tx.TakerPays],
      ["Taker gets", tx.TakerGets],
    ], drops);
  } else if (type === "AMMDeposit") {
    summary = `${account} would add liquidity to an AMM pool of ${text(tx.Asset)} and ${text(tx.Asset2)}. Amount ${drops(tx.Amount)}. Nothing was signed.`;
    lines = linesFrom([
      ["Account", tx.Account],
      ["Asset", tx.Asset],
      ["Asset 2", tx.Asset2],
      ["Amount", tx.Amount],
    ]);
    lines = lines.map((line) => line.label === "Amount" ? { ...line, value: drops(tx.Amount) } : line);
  } else if (type === "EscrowCreate") {
    summary = `${account} would lock ${drops(tx.Amount)} in escrow for ${text(tx.Destination)}. Nothing was signed.`;
    lines = linesFrom([
      ["Account", tx.Account],
      ["Destination", tx.Destination],
      ["Amount", tx.Amount],
      ["Cancel after", tx.CancelAfter],
      ["Finish after", tx.FinishAfter],
    ]);
    lines = lines.map((line) => line.label === "Amount" ? { ...line, value: drops(tx.Amount) } : line);
  } else if (type === "Payment") {
    summary = `${account} would pay ${drops(tx.Amount)} to ${text(tx.Destination)}. Nothing was signed.`;
    lines = linesFrom([
      ["Account", tx.Account],
      ["Destination", tx.Destination],
      ["Amount", tx.Amount],
      ["Send max", tx.SendMax],
    ]);
    lines = lines.map((line) => line.label === "Amount" || line.label === "Send max" ? { ...line, value: drops(tx[line.label === "Amount" ? "Amount" : "SendMax"]) } : line);
  }
  return { transactionType: type, summary, lines, disclaimer: CLEAR_SIGN_DISCLAIMER };
}

export const SAMPLE_XRPL_TRANSACTIONS: Record<string, unknown>[] = [
  {
    TransactionType: "TrustSet",
    Account: "rDemoAccount111111111111111111",
    LimitAmount: { currency: "USD", issuer: "rIssuerDemo222222222222222222", value: "100" },
    Flags: 131072,
  },
  {
    TransactionType: "OfferCreate",
    Account: "rDemoAccount111111111111111111",
    TakerPays: "1000000",
    TakerGets: { currency: "USD", issuer: "rIssuerDemo222222222222222222", value: "1" },
  },
  {
    TransactionType: "AMMDeposit",
    Account: "rDemoAccount111111111111111111",
    Asset: { currency: "XRP" },
    Asset2: { currency: "USD", issuer: "rIssuerDemo222222222222222222" },
    Amount: "5000000",
  },
  {
    TransactionType: "EscrowCreate",
    Account: "rDemoAccount111111111111111111",
    Destination: "rDestination333333333333333333",
    Amount: "2000000",
    CancelAfter: 840000000,
    FinishAfter: 830000000,
  },
];
