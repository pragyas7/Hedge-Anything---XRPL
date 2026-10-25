export interface LedgerDeviceStatus {
  deviceSeen: false;
  signed: false;
  agentIntent: "UNSUPPORTED";
  chainId: 1449000;
  signerPackage: "@ledgerhq/device-signer-kit-xrp";
  packageLoaded: boolean;
  clearSignFormat: "switchboard.xrpl-clear-sign.v1";
  note: string;
}

/** Does not open a device session. A loaded package is still not a signature. */
export async function ledgerDeviceStatus(): Promise<LedgerDeviceStatus> {
  let packageLoaded = false;
  try {
    const packageName = "@ledgerhq/device-signer-kit-xrp";
    await import(packageName);
    packageLoaded = true;
  } catch {
    packageLoaded = false;
  }
  return {
    deviceSeen: false,
    signed: false,
    agentIntent: "UNSUPPORTED",
    chainId: 1449000,
    signerPackage: "@ledgerhq/device-signer-kit-xrp",
    packageLoaded,
    clearSignFormat: "switchboard.xrpl-clear-sign.v1",
    note: packageLoaded
      ? "The Ledger XRP signer package loaded. No device session was opened, and ledger_agent_intent stays unsupported on chain id 1449000. Nothing was signed."
      : "No Ledger device is connected and the XRP signer package is not installed. The clear-signing parser is a preview. ledger_agent_intent stays unsupported on chain id 1449000. Nothing was signed.",
  };
}
