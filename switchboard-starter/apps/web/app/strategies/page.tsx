'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { ExecutionRun, HedgePlan, MarketSearchResponse } from '@switchboard/contracts';
import { presentApproval } from '../../server/approval';
import { useDesk } from '../../components/desk-shell';
import type { PlanMode } from '../../state/desk';
import { messageOf, readJson } from '../../state/http';

const MODES: { id: PlanMode; label: string }[] = [
  { id: 'min_cvar', label: 'Minimum tail' },
  { id: 'min_cost', label: 'Minimum cost' },
  { id: 'balanced', label: 'Balanced' },
];

export default function StrategiesPage() {
  const { state, ready, update } = useDesk();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<PlanMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readBasis, setReadBasis] = useState(false);
  const [approveHash, setApproveHash] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runNote, setRunNote] = useState<string | null>(null);

  if (!ready) return <div className="page"><p className="note" role="status">Loading desk…</p></div>;
  const company = state.analysis?.company;
  const plan = state.activeMode ? state.plans[state.activeMode] : undefined;

  async function generate(mode: PlanMode) {
    if (!company) return;
    setBusy(mode);
    setError(null);
    const searchResponse = await fetch('/api/markets/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        companyId: company.companyId,
        exposureIds: company.exposures.map((exposure) => exposure.exposureId),
        requestedQuantity: '10',
        jurisdiction: company.jurisdiction,
        includeReferenceMarkets: true,
      }),
    });
    const searchBody = await readJson(searchResponse);
    if (!searchResponse.ok || !searchBody.result) {
      setBusy(null);
      setError(messageOf(searchBody, 'Market search failed. No plan was created.'));
      return;
    }
    const marketSearch = searchBody.result as unknown as MarketSearchResponse;
    const response = await fetch('/api/strategy/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ company, marketSearch, mode }),
    });
    const body = await readJson(response);
    setBusy(null);
    if (!response.ok) {
      setError(messageOf(body, 'Strategy service did not return a plan.'));
      return;
    }
    const nextPlan = body as unknown as HedgePlan;
    const source = searchBody.source === 'fixture' ? 'fixture' as const : 'strategy' as const;
    update((prev) => ({
      ...prev,
      plans: { ...prev.plans, [mode]: nextPlan },
      activeMode: mode,
      marketNote: typeof searchBody.note === 'string' ? searchBody.note : null,
      marketSource: searchBody.source === 'fixture' ? 'fixture' : 'markets',
      approval: prev.approval?.planId === nextPlan.planId ? prev.approval : null,
      activity: [{
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'plan',
        summary: `${mode} ${nextPlan.planId} hash ${nextPlan.planHash}`,
        source,
      }, ...prev.activity],
    }));
  }

  async function requestApproval() {
    if (!plan) return;
    setSubmitting(true);
    const response = await fetch('/api/execution/approvals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        planId: plan.planId,
        planHash: plan.planHash,
        expiresAt: plan.expiresAt,
        maxTotalSpendUsd: plan.estimatedTotalCostUsd,
        maxCollateralUsd: plan.budgetUsd,
        allowedVenues: [...new Set(plan.legs.map((leg) => leg.venue))],
        ap4mFallbackBudgetUsd: '25',
        plan,
      }),
    });
    const body = await readJson(response);
    const view = presentApproval({
      clicked: true,
      upstream: { status: response.status, body: body as { status?: string; code?: string; message?: string } },
    });
    const approvalId = typeof body.approvalId === 'string' ? body.approvalId : undefined;
    update((prev) => ({
      ...prev,
      approval: { planId: plan.planId, view, approvalId },
      activity: [{
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'approval',
        summary: view.label,
        source: 'execution',
      }, ...prev.activity],
    }));
    setSubmitting(false);
  }

  async function confirmApproval() {
    const approvalId = state.approval?.approvalId;
    if (!plan || !approvalId) return;
    setSubmitting(true);
    const response = await fetch(`/api/execution/approvals/${encodeURIComponent(approvalId)}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ method: 'app_manual', signedIntent: `app_manual:${plan.planHash}` }),
    });
    const body = await readJson(response);
    const view = presentApproval({
      clicked: true,
      upstream: { status: response.status, body: body as { status?: string; code?: string; message?: string } },
    });
    update((prev) => ({
      ...prev,
      approval: { planId: plan.planId, view, approvalId },
      activity: [{
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'approval-confirm',
        summary: view.label,
        source: 'execution',
      }, ...prev.activity],
    }));
    setSubmitting(false);
  }

  async function placeSandboxOrders() {
    const approvalId = state.approval?.approvalId;
    if (!plan || !approvalId) return;
    setSubmitting(true);
    setRunNote(null);
    const idempotencyKey = crypto.randomUUID();
    const response = await fetch('/api/execution/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ plan, approvalId, idempotencyKey }),
    });
    const body = await readJson(response);
    setSubmitting(false);
    if (!response.ok) {
      setRunNote(messageOf(body, 'Execution did not place sandbox orders.'));
      return;
    }
    const run = body as unknown as ExecutionRun;
    setRunNote(`Run ${run.runId} is ${run.status}. Orders are sandbox records.`);
    update((prev) => ({
      ...prev,
      lastRun: run,
      activity: [{
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'execution-run',
        summary: `${run.runId} ${run.status}`,
        source: 'execution',
      }, ...prev.activity],
    }));
  }

  const approval = state.approval && plan && state.approval.planId === plan.planId ? state.approval : null;
  const toneClass = approval?.view.tone === 'approved' ? 'good' : approval?.view.tone === 'error' ? 'bad' : 'pending';

  return (
    <div className="page">
      <h1>Strategies</h1>
      <p className="lead">Three selectors, one budget. Review the legs and the basis note before you ask execution to approve. This page does not turn a plan green on its own.</p>
      {!company ? (
        <>
          <p className="note">No company on this desk yet.</p>
          <Link className="btn" href="/onboard">Describe the company</Link>
        </>
      ) : (
        <>
          {!company.confirmedByUser ? <p className="warn">Assumptions are still unconfirmed. You can generate a plan, but the profile says the user has not confirmed it.</p> : null}
          <div className="row">
            {MODES.map((mode) => (
              <button key={mode.id} className="btn" type="button" disabled={busy !== null} onClick={() => generate(mode.id)}>
                {busy === mode.id ? 'Working…' : mode.label}
              </button>
            ))}
          </div>
          {busy ? <p className="note" role="status">Searching markets, then asking strategy…</p> : null}
          {error ? <p className="bad" role="alert">{error}</p> : null}
          {state.marketNote ? <p className={state.marketSource === 'fixture' ? 'warn' : 'note'}>{state.marketNote}</p> : null}
          {!plan && !busy ? <p className="note">No plan yet. Pick a mode.</p> : null}
          {plan ? (
            <section>
              <h2>{state.activeMode}</h2>
              <dl className="ledger">
                <div><dt>Plan</dt><dd>{plan.planId}</dd></div>
                <div><dt>Hash</dt><dd>{plan.planHash}</dd></div>
                <div><dt>Status</dt><dd>{plan.status}</dd></div>
                <div><dt>Premium</dt><dd>{plan.estimatedTotalCostUsd} of {plan.budgetUsd} USD</dd></div>
                <div><dt>CVaR before / after</dt><dd>{plan.before.cvar95LossUsd} / {plan.after.cvar95LossUsd}</dd></div>
                <div><dt>Demo data</dt><dd>{plan.syntheticDemo ? 'Synthetic or sandbox' : 'No synthetic flag on the chosen legs'}</dd></div>
              </dl>
              <p>{plan.rationale}</p>
              {plan.legs.length === 0 ? <p className="warn">No eligible hedge inside the budget. This is a no-trade plan.</p> : null}
              {plan.warnings.map((warning) => <p className="warn" key={warning}>{warning}</p>)}
              {plan.legs.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Leg</th><th>Venue</th><th className="num">Qty</th><th className="num">Premium USD</th><th>Basis</th></tr>
                    </thead>
                    <tbody>
                      {plan.legs.map((leg) => (
                        <tr key={leg.legId}>
                          <td>{leg.quoteId ?? leg.capacityOfferId} · {leg.kind}</td>
                          <td>{leg.venue}</td>
                          <td className="num">{leg.quantity}</td>
                          <td className="num">{leg.estimatedAllInCostUsd}</td>
                          <td>{leg.basisRisk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <button className="btn" type="button" disabled={plan.legs.length === 0} onClick={() => dialogRef.current?.showModal()}>
                Review and request approval
              </button>
              {plan.legs.length === 0 ? <p className="note">There is nothing to approve on a no-trade plan.</p> : null}
            </section>
          ) : null}
        </>
      )}
      <dialog className="review" ref={dialogRef}>
        <h2>Review plan</h2>
        {plan ? (
          <>
            <p>Hash {plan.planHash}. Premium {plan.estimatedTotalCostUsd} USD. Venues {plan.legs.map((leg) => leg.venue).join(', ') || 'none'}.</p>
            <p>The preauthorized AP4M fallback budget on this request is 25 USD. Execution recomputes the hash from the plan snapshot. A click is not approval until execution returns APPROVED. This confirmation is app_manual, not a Ledger device signature.</p>
            <label className="field">
              <span><input type="checkbox" checked={readBasis} onChange={(event) => setReadBasis(event.target.checked)} /> I have read the basis risk and the sandbox limits.</span>
            </label>
            <button className="btn" type="button" disabled={!readBasis || submitting} onClick={requestApproval}>
              {submitting ? 'Contacting execution…' : 'Request approval'}
            </button>
            {approval ? <p className={toneClass} role="status">{approval.view.label}</p> : null}
            {approval?.approvalId && approval.view.tone !== 'approved' ? (
              <>
                <label className="field">
                  <span><input type="checkbox" checked={approveHash} onChange={(event) => setApproveHash(event.target.checked)} /> I approve hash {plan.planHash} with method app_manual. This is not a Ledger signature.</span>
                </label>
                <button className="btn" type="button" disabled={!approveHash || submitting} onClick={confirmApproval}>
                  Confirm with execution
                </button>
              </>
            ) : null}
            {approval?.view.tone === 'approved' ? (
              <>
                <button className="btn" type="button" disabled={submitting} onClick={placeSandboxOrders}>
                  Place sandbox orders
                </button>
                {runNote ? <p className="note" role="status">{runNote}</p> : null}
                {state.lastRun && state.lastRun.planId === plan.planId ? (
                  <p className="note">Latest run {state.lastRun.runId} is {state.lastRun.status}. Filled quantities are sandbox records, and receipt hashes stay unconfirmed.</p>
                ) : null}
              </>
            ) : null}
          </>
        ) : <p>No plan is open.</p>}
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <button className="btn-quiet" type="button" onClick={() => dialogRef.current?.close()}>Close</button>
        </div>
      </dialog>
    </div>
  );
}
