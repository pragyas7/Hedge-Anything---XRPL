export interface UpstreamApproval {
  status: number;
  body: { status?: string; code?: string; message?: string } | null;
}

export interface ApprovalView {
  approved: boolean;
  tone: 'idle' | 'pending' | 'approved' | 'error';
  label: string;
}

/** Green only when execution itself returns status APPROVED. A click is not an approval. */
export function presentApproval(input: { clicked: boolean; upstream: UpstreamApproval | null }): ApprovalView {
  if (!input.upstream) {
    if (!input.clicked) return { approved: false, tone: 'idle', label: 'Not submitted' };
    return { approved: false, tone: 'error', label: 'Execution service did not respond. This plan is not approved.' };
  }
  const message = input.upstream.body?.message;
  if (input.upstream.status >= 400 || input.upstream.body?.code === 'EXECUTION_UNAVAILABLE') {
    return { approved: false, tone: 'error', label: message || 'Execution did not approve this plan.' };
  }
  if (input.upstream.body?.status === 'APPROVED') {
    return { approved: true, tone: 'approved', label: 'Execution confirmed this approval.' };
  }
  const reported = input.upstream.body?.status;
  return {
    approved: false,
    tone: 'pending',
    label: reported
      ? `Execution returned ${reported}. This plan is not approved.`
      : 'Execution returned no approval status. This plan is not approved.',
  };
}
