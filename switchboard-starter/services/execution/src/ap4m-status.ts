export interface Ap4mReadiness {
  mode: "mock" | "live";
  chainId: number;
  settled: false;
  missing: string[];
  present: string[];
  note: string;
  ledgerAgentIntent: string;
}

function filled(env: NodeJS.ProcessEnv, names: string[]): boolean {
  return names.some((name) => {
    const value = env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
}

/** Names missing credentials. Never returns secret values. */
export function ap4mReadiness(env: NodeJS.ProcessEnv = process.env): Ap4mReadiness {
  const missing: string[] = [];
  const present: string[] = [];
  if (filled(env, ["AP4M_AGENT_PRIVATE_KEY", "AGENT_PRIVATE_KEY"])) present.push("agent key");
  else missing.push("AP4M_AGENT_PRIVATE_KEY");
  if (filled(env, ["AP4M_TEAM_NAME", "TEAM_NAME"])) present.push("team name");
  else missing.push("AP4M_TEAM_NAME");
  const mode = env.AP4M_MODE === "live" ? "live" : "mock";
  if (mode !== "live") missing.push("AP4M_MODE=live");
  const note = missing.length > 0
    ? "Live RLUSD settlement is not available. No voucher was signed and no transaction hash was created."
    : "Credentials are present in the environment. This status check does not open a channel, sign a voucher, or settle RLUSD.";
  return {
    mode,
    chainId: 1449000,
    settled: false,
    missing,
    present,
    note,
    ledgerAgentIntent: "UNSUPPORTED on XRPL EVM chain id 1449000. Ledger Agent Intent is not claimed. Mainnet chain id 1440000 is not used.",
  };
}
