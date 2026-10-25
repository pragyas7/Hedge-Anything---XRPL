import { ap4mReadiness } from "./ap4m-status.js";
import { awsAgentCoreEnabled, awsSponsorStatus, type AwsSponsorStatus } from "./aws-agentcore.js";
import { ledgerDeviceStatus, type LedgerDeviceStatus } from "./ledger-device.js";
import { readPaymentLedgerLogs, type SettlementLogReport } from "./quicknode.js";

export interface SponsorStatus {
  ap4m: ReturnType<typeof ap4mReadiness>;
  quicknode: SettlementLogReport;
  /** Present only when AWS_AGENTCORE_ENABLED=true. The AWS track is parked by default. */
  aws?: AwsSponsorStatus;
  ledger: LedgerDeviceStatus;
}

export async function sponsorStatus(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<SponsorStatus> {
  const [quicknode, ledger] = await Promise.all([
    readPaymentLedgerLogs(env, fetchImpl),
    ledgerDeviceStatus(),
  ]);
  return {
    ap4m: ap4mReadiness(env),
    quicknode,
    ...(awsAgentCoreEnabled(env) ? { aws: awsSponsorStatus(env) } : {}),
    ledger,
  };
}
