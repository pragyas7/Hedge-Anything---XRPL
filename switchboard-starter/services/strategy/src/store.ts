import type { CompanyAnalysisResponse, HedgePlan } from '@switchboard/contracts';

export interface IdempotencyRecord {
  bodyHash: string;
  status: number;
  body: unknown;
}

export interface Store {
  companies: Map<string, CompanyAnalysisResponse>;
  plans: Map<string, HedgePlan>;
  idempotency: Map<string, IdempotencyRecord>;
}

export function createStore(): Store {
  return {
    companies: new Map(),
    plans: new Map(),
    idempotency: new Map(),
  };
}
