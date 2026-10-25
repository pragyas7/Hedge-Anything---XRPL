import type {
  Approval,
  ApprovalRequest,
  ApprovalStatus,
  ExecutionRun,
  FailoverArmRequest,
  FailoverRun,
  HedgePlan,
} from "@switchboard/contracts";

export interface StoredApproval {
  approvalId: string;
  request: ApprovalRequest;
  planSnapshot: HedgePlan;
  status: ApprovalStatus;
  method: Approval["method"];
  deviceProofId?: string;
  approvedAt?: string;
  warning?: string;
  issuedJtis: string[];
}

export interface IdempotencyRecord {
  bodyHash: string;
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface ArmedMonitor {
  monitorId: string;
  status: "ARMED" | "DISABLED" | "REJECTED";
  policyDigest: string;
  policy: FailoverArmRequest;
  spentUsd: string;
  disabledReason?: string;
}

export interface MemoryStore {
  approvals: Map<string, StoredApproval>;
  runs: Map<string, ExecutionRun>;
  runJtis: Map<string, string[]>;
  idempotency: Map<string, IdempotencyRecord>;
  revokedJtis: Set<string>;
  monitors: Map<string, ArmedMonitor>;
  failovers: Map<string, FailoverRun>;
}

export function createMemoryStore(): MemoryStore {
  return {
    approvals: new Map(),
    runs: new Map(),
    runJtis: new Map(),
    idempotency: new Map(),
    revokedJtis: new Set(),
    monitors: new Map(),
    failovers: new Map(),
  };
}

export function publicApproval(stored: StoredApproval): Approval {
  const approval: Approval = {
    approvalId: stored.approvalId,
    request: stored.request,
    status: stored.status,
    method: stored.method,
  };
  if (stored.deviceProofId) approval.deviceProofId = stored.deviceProofId;
  if (stored.approvedAt) approval.approvedAt = stored.approvedAt;
  return approval;
}
