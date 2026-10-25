/**
 * Ledger capability registry for this product.
 * Ledger Agent Intent beta documents Ethereum and Solana sends, plus some Ethereum swaps.
 * It does not document XRPL EVM (chain id 1449000). DMK Ethereum signing is a separate
 * device session and is not treated as Agent Intent.
 */
export const XRPL_EVM_CHAIN_ID = 1449000;

export const LEDGER_AGENT_INTENT_DOC_URL = "https://developers.ledger.com/docs/ai-tools/agent-intent";

export const LEDGER_DMK_ETH_DOC_URL =
  "https://developers.ledger.com/docs/device-interaction/dmk-ts/references/signers/eth";

export interface LedgerCapability {
  method: "ledger_agent_intent" | "ledger_dmk_verified";
  supportedForChain: (chainId: number) => boolean;
  supportedNetworks: readonly string[];
  docUrl: string;
  note: string;
}

export const capabilityRegistry: Record<"ledger_agent_intent" | "ledger_dmk_verified", LedgerCapability> = {
  ledger_agent_intent: {
    method: "ledger_agent_intent",
    supportedForChain: (chainId: number) => chainId !== XRPL_EVM_CHAIN_ID && false,
    supportedNetworks: ["ethereum", "solana"],
    docUrl: LEDGER_AGENT_INTENT_DOC_URL,
    note: "Unsupported for XRPL EVM chain id 1449000. Ledger Agent Intent beta lists Ethereum and Solana sends and some Ethereum decentralized swaps, not XRPL EVM. This service never sets APPROVED for ledger_agent_intent.",
  },
  ledger_dmk_verified: {
    method: "ledger_dmk_verified",
    supportedForChain: () => false,
    supportedNetworks: [],
    docUrl: LEDGER_DMK_ETH_DOC_URL,
    note: "DMK Ethereum signer methods (getAddress, signTransaction, signMessage, signTypedData) require a physical device session that this process does not open. Default is UNSUPPORTED unless LEDGER_DMK_VERIFIED=true with a dmk: intent and deviceProofId. That flag is an operator assertion, not an observation of a device screen. It is not Ledger Agent Intent.",
  },
};

export function ledgerAgentIntentWarning(): string {
  return `ledger_agent_intent is unsupported for XRPL EVM chain id ${XRPL_EVM_CHAIN_ID}. Ledger Agent Intent beta supports Ethereum and Solana only. ${LEDGER_AGENT_INTENT_DOC_URL}`;
}

export function ledgerDmkUnsupportedWarning(): string {
  return "ledger_dmk_verified is UNSUPPORTED unless LEDGER_DMK_VERIFIED=true, deviceProofId is present, and signedIntent starts with dmk:. No physical Ledger device was observed. This is not Ledger Agent Intent.";
}

export function ledgerDmkOperatorWarning(): string {
  return "method is ledger_dmk_verified because LEDGER_DMK_VERIFIED=true and a dmk: intent was presented. This process did not observe a physical Ledger device, device screen, or DMK session. Not Ledger Agent Intent and not hardware proof.";
}
