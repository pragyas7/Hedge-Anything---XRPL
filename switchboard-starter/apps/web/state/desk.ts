import type { CompanyAnalysisResponse, HedgePlan } from '@switchboard/contracts';
import type { ApprovalView } from '../server/approval';

export type PlanMode = 'min_cvar' | 'min_cost' | 'balanced';

export interface ActivityItem {
  id: string;
  at: string;
  kind: string;
  summary: string;
  source: 'desk' | 'strategy' | 'markets' | 'execution' | 'fixture';
}

export interface StoredApproval {
  planId: string;
  view: ApprovalView;
  approvalId?: string;
}

export interface DeskState {
  analysis: CompanyAnalysisResponse | null;
  plans: Partial<Record<PlanMode, HedgePlan>>;
  activeMode: PlanMode | null;
  marketNote: string | null;
  marketSource: 'markets' | 'fixture' | null;
  approval: StoredApproval | null;
  activity: ActivityItem[];
}

export const DESK_KEY = 'switchboard.desk.v1';

export function emptyDesk(): DeskState {
  return {
    analysis: null,
    plans: {},
    activeMode: null,
    marketNote: null,
    marketSource: null,
    approval: null,
    activity: [],
  };
}

export function loadDesk(): DeskState {
  if (typeof window === 'undefined') return emptyDesk();
  try {
    const raw = sessionStorage.getItem(DESK_KEY);
    if (!raw) return emptyDesk();
    return { ...emptyDesk(), ...JSON.parse(raw) as DeskState };
  } catch {
    return emptyDesk();
  }
}

export function saveDesk(state: DeskState): void {
  sessionStorage.setItem(DESK_KEY, JSON.stringify(state));
}
