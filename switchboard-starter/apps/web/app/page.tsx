'use client';

import Link from 'next/link';
import { useDesk } from '../components/desk-shell';

export default function OverviewPage() {
  const { state, ready } = useDesk();
  if (!ready) return <div className="page"><p className="note" role="status">Loading desk…</p></div>;
  const company = state.analysis?.company;
  const plan = state.activeMode ? state.plans[state.activeMode] : undefined;
  const approval = state.approval?.view;
  return (
    <div className="page">
      <h1>Desk</h1>
      <p className="lead">Describe the exposure, check the tail, then send one versioned plan for approval. Nothing here is a live trade.</p>
      {!company ? (
        <div className="stack">
          <p className="note">No company on this desk yet.</p>
          <Link className="btn" href="/onboard">Describe the company</Link>
        </div>
      ) : (
        <dl className="ledger">
          <div><dt>Company</dt><dd>{company.name}</dd></div>
          <div><dt>Assumptions</dt><dd>{company.confirmedByUser ? 'Confirmed on this desk' : 'Still unconfirmed'}</dd></div>
          <div><dt>Budget</dt><dd className="num">{company.monthlyHedgeBudgetUsd} USD / month</dd></div>
          <div><dt>Latest plan</dt><dd>{plan ? `${state.activeMode} · ${plan.planId}` : 'None yet'}</dd></div>
          <div><dt>Approval</dt><dd>{approval ? approval.label : 'Not submitted'}</dd></div>
        </dl>
      )}
      <div className="row" style={{ marginTop: '1.2rem' }}>
        <Link className="btn-quiet" href="/risk">Open risk</Link>
        <Link className="btn-quiet" href="/strategies">Open strategies</Link>
      </div>
      <h2>Rules on this desk</h2>
      <ul>
        <li>Polymarket International is reference only when the jurisdiction is the US.</li>
        <li>A weather contract is not a hedge of cloud or API uptime.</li>
        <li>The approval button stays unapproved until the execution service says APPROVED.</li>
      </ul>
    </div>
  );
}
