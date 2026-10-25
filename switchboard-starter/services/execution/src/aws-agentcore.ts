import { decide402 } from "./ap4m.js";
import { runAp4mPayment, type Ap4mPaymentReport } from "./ap4m-live.js";

export interface AwsSponsorStatus {
  deployed: false;
  missing: string[];
  localEndpoints: ["/ping", "/invocations"];
  note: string;
}

export interface AgentInvocation {
  protocol: "agentcore-http";
  pay: boolean;
  reason: string;
  resourceStatus: number | null;
  awsDeployed: false;
  settlement: Ap4mPaymentReport | null;
}

const REQUIRED = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AGENTCORE_RUNTIME_ARN"] as const;

/**
 * The AWS sponsor track is parked. The routes and status card stay off unless this flag is set,
 * so the code below can be switched back on without rewriting it.
 */
export function awsAgentCoreEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.AWS_AGENTCORE_ENABLED ?? "").trim().toLowerCase() === "true";
}

/**
 * Vercel functions set AWS_REGION even when the project has no AWS account.
 * That value counts only after both the access key and the secret are present.
 */
function regionValue(env: NodeJS.ProcessEnv): string {
  const explicit = (env.SWITCHBOARD_AWS_REGION ?? "").trim();
  if (explicit) return explicit;
  const access = (env.AWS_ACCESS_KEY_ID ?? "").trim();
  const secret = (env.AWS_SECRET_ACCESS_KEY ?? "").trim();
  if (!access || !secret) return "";
  return (env.AWS_REGION ?? "").trim();
}

export function awsSponsorStatus(env: NodeJS.ProcessEnv = process.env): AwsSponsorStatus {
  const missing = REQUIRED.filter((name) => {
    if (name === "AWS_REGION") return regionValue(env).length === 0;
    return !(env[name] ?? "").trim();
  });
  return {
    deployed: false,
    missing: [...missing],
    localEndpoints: ["/ping", "/invocations"],
    note: missing.length > 0
      ? "AWS AgentCore is not deployed. GET /ping and POST /invocations implement the AgentCore HTTP contract on this process. Pasting AWS credentials does not by itself create a runtime."
      : "AWS credentials are present. This process still has no deployed AgentCore runtime. POST /invocations runs the local payment decision here.",
  };
}

/** Local stand-in for AgentCore POST /invocations. Pays only through the AP4M client, which settles only on a real payout. */
export async function handleInvocation(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentInvocation> {
  const resourceUrl = body && typeof body === "object" && typeof (body as { resourceUrl?: unknown }).resourceUrl === "string"
    ? (body as { resourceUrl: string }).resourceUrl
    : undefined;
  if (!resourceUrl) {
    return {
      protocol: "agentcore-http",
      pay: false,
      reason: "No resourceUrl was provided, so the agent did not look for an HTTP 402.",
      resourceStatus: null,
      awsDeployed: false,
      settlement: null,
    };
  }
  const response = await fetchImpl(resourceUrl, { method: "GET" });
  if (response.status !== 402) {
    return {
      protocol: "agentcore-http",
      pay: false,
      reason: `Resource returned HTTP ${response.status}. The agent pays only after a 402.`,
      resourceStatus: response.status,
      awsDeployed: false,
      settlement: null,
    };
  }
  let quoted = "1";
  try {
    const parsed = await response.json() as { amount?: unknown; amountUsd?: unknown };
    if (typeof parsed.amountUsd === "string") quoted = parsed.amountUsd;
    else if (typeof parsed.amount === "string") quoted = parsed.amount;
  } catch {
    quoted = "1";
  }
  const cap = (env.AP4M_FALLBACK_BUDGET_USD ?? "25").trim() || "25";
  const decision = decide402({
    quotedUsd: quoted,
    remainingBudgetUsd: cap,
    maxPerTriggerUsd: cap,
    fallbackHealthy: true,
    voucherValid: true,
    balanceAvailable: true,
  });
  if (!decision.pay) {
    return {
      protocol: "agentcore-http",
      pay: false,
      reason: decision.reason,
      resourceStatus: 402,
      awsDeployed: false,
      settlement: null,
    };
  }
  const settlement = await runAp4mPayment({ ...env, AP4M_RESOURCE_URL: resourceUrl }, { fetchImpl });
  return {
    protocol: "agentcore-http",
    pay: true,
    reason: settlement.settled ? settlement.note : `${decision.reason} ${settlement.note}`,
    resourceStatus: 402,
    awsDeployed: false,
    settlement,
  };
}
