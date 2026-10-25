'use client';

import { useEffect, useState } from 'react';
import type { ExecutionRun, FailoverRun } from '@switchboard/contracts';
import { useDesk } from '../../components/desk-shell';
import { messageOf, readJson } from '../../state/http';

interface OperationsBody {
  executionService: 'up' | 'down';
  source: string;
  note: string;
  failover: FailoverRun;
  sampleRun: ExecutionRun;
}

const PRIMARY = 'https://primary.invalid/infer';
const FALLBACK = 'https://fallback.invalid/infer';
const SCENARIOS = ['success', 'failing_backup', 'invalid_voucher', 'no_balance', 'budget_exceeded', 'receipt_failed', 'proof_missing'] as const;

export default function OperationsPage() {
  const { state, ready, update } = useDesk();
  const [data, setData] = useState<OperationsBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]>('success');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [network, setNetwork] = useState<string>('Chain head has not been read.');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/operations')
      .then(async (response) => {
        const body = await readJson(response);
        if (!response.ok) throw new Error(messageOf(body, 'Operations view is unavailable.'));
        if (!cancelled) setData(body as unknown as OperationsBody);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Operations view is unavailable.');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/execution/network')
      .then(async (response) => {
        const body = await readJson(response);
        if (cancelled) return;
        const label = typeof body.label === 'string' ? body.label : 'No chain label.';
        const block = typeof body.blockNumber === 'number' ? ` Block ${body.blockNumber}.` : '';
        const chain = typeof body.chainId === 'number' ? ` Chain ${body.chainId}.` : '';
        const problem = typeof body.error === 'string' ? ` ${body.error}` : '';
        setNetwork(`${label}${chain}${block}${problem}`);
      })
      .catch(() => {
        if (!cancelled) setNetwork('Chain head could not be read.');
      });
    return () => { cancelled = true; };
  }, []);

  const plan = state.activeMode ? state.plans[state.activeMode] : undefined;
  const approved = Boolean(ready && plan && state.approval?.planId === plan.planId && state.approval.view.tone === 'approved' && state.approval.approvalId);

  async function simulateFailover() {
    if (!plan || !state.approval?.approvalId) return;
    setBusy(true);
    setActionError(null);
    const armKey = crypto.randomUUID();
    const arm = await fetch('/api/failover/arm', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': armKey },
      body: JSON.stringify({
        planId: plan.planId,
        approvalId: state.approval.approvalId,
        primaryService: PRIMARY,
        fallbackOfferId: 'cap_sandbox_standby',
        maxPerTriggerUsd: '10',
        maxDailySpendUsd: '25',
        triggerRuleId: 'primary_down',
      }),
    });
    const armBody = await readJson(arm);
    if (!arm.ok || armBody.status === 'REJECTED') {
      setBusy(false);
      setActionError(messageOf(armBody, 'Failover was not armed.'));
      return;
    }
    const simKey = crypto.randomUUID();
    const response = await fetch('/api/failover/simulate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': simKey,
        'x-failover-scenario': scenario,
        'x-failover-quote-usd': '1',
      },
      body: JSON.stringify({
        planId: plan.planId,
        primaryService: PRIMARY,
        fallbackService: FALLBACK,
        failureMode: 'provider_down',
      }),
    });
    const body = await readJson(response);
    setBusy(false);
    if (!response.ok) {
      setActionError(messageOf(body, 'Failover simulation did not run.'));
      return;
    }
    const run = body as unknown as FailoverRun;
    update((prev) => ({
      ...prev,
      lastFailover: run,
      activity: [{
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'failover',
        summary: `${run.failoverId} ${run.state}`,
        source: 'execution',
      }, ...prev.activity],
    }));
  }

  return (
    <div className="page">
      <h1>Operations</h1>
      <p className="lead">Sandbox failover for the plan you approved, plus a chain-head read. A fixture row is not a confirmed payment.</p>
      <section>
        <h2>This session</h2>
        <p className="note">{network}</p>
        {!approved ? <p className="warn">Approve a plan on Strategies before arming failover. This page will not invent an approval.</p> : <p className="note">Approved plan {plan?.planId}. AP4M cap used here is 25 USD. The success path signs nothing on chain.</p>}
        <label className="field">
          <span>Fault scenario</span>
          <select value={scenario} onChange={(event) => setScenario(event.target.value as (typeof SCENARIOS)[number])}>
            {SCENARIOS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button className="btn" type="button" disabled={!approved || busy} onClick={simulateFailover}>
          {busy ? 'Contacting execution…' : 'Arm and simulate'}
        </button>
        {actionError ? <p className="bad" role="alert">{actionError}</p> : null}
        {state.lastFailover ? (
          <>
            <p className={state.lastFailover.state === 'RLUSD_SETTLED' ? 'bad' : 'note'}>
              Sandbox monitor {state.lastFailover.failoverId} is {state.lastFailover.state}. Spend {state.lastFailover.ap4mSpendingUsd} USD. This is the execution service response, not the fixture below.
            </p>
            {state.lastFailover.errors.map((item) => <p className="warn" key={item}>{item}</p>)}
            {state.lastFailover.receipts.map((receipt) => (
              <p className="note" key={receipt.receiptId}>{receipt.kind} · {receipt.transactionHash ?? 'no hash'} · {receipt.confirmed ? 'confirmed' : 'unconfirmed'}</p>
            ))}
          </>
        ) : null}
        {state.lastRun ? <p className="note">Latest sandbox run {state.lastRun.runId} is {state.lastRun.status}.</p> : null}
      </section>
      {!data && !error ? <p className="note" role="status">Loading monitor…</p> : null}
      {error ? <p className="bad" role="alert">{error}</p> : null}
      {data ? (
        <>
          <p className="warn">{data.note} Source: {data.source}. Execution service is {data.executionService}.</p>
          <dl className="ledger">
            <div><dt>Monitor</dt><dd>{data.failover.failoverId}</dd></div>
            <div><dt>State</dt><dd>{data.failover.state} · fixture</dd></div>
            <div><dt>Primary</dt><dd>{data.failover.primaryService}</dd></div>
            <div><dt>Fallback</dt><dd>{data.failover.fallbackService}</dd></div>
            <div><dt>AP4M spend</dt><dd>{data.failover.ap4mSpendingUsd} USD · not a live charge</dd></div>
          </dl>
          {data.failover.receipts.length === 0 ? <p className="note">No receipts on the fixture monitor.</p> : null}
          <h2>Sample run</h2>
          <p>Run {data.sampleRun.runId} is {data.sampleRun.status}. Orders below are from the checked-in fixture.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Order</th><th>Status</th><th className="num">Filled</th><th>Record</th></tr>
              </thead>
              <tbody>
                {data.sampleRun.orders.map((order) => (
                  <tr key={order.clientOrderId}>
                    <td>{order.clientOrderId}</td>
                    <td>{order.status}</td>
                    <td className="num">{order.filledQuantity}</td>
                    <td>{order.syntheticDemo ? 'Synthetic demo' : 'Service record'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Receipts</h2>
          {data.sampleRun.receipts.length === 0 ? <p className="note">No sample receipts.</p> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Receipt</th><th>Kind</th><th>Hash</th><th>Record</th></tr>
                </thead>
                <tbody>
                  {data.sampleRun.receipts.map((receipt) => (
                    <tr key={receipt.receiptId}>
                      <td>{receipt.receiptId}</td>
                      <td>{receipt.kind}</td>
                      <td>{receipt.transactionHash ?? 'none'}</td>
                      <td>{receipt.confirmed ? 'Confirmed' : 'Mock / unconfirmed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.failover.errors.length > 0 ? <p className="bad">{data.failover.errors.join(' ')}</p> : null}
        </>
      ) : null}
    </div>
  );
}
