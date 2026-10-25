'use client';

import { useEffect, useState } from 'react';
import type { ExecutionRun, FailoverRun } from '@switchboard/contracts';
import { messageOf, readJson } from '../../state/http';

interface OperationsBody {
  executionService: 'up' | 'down';
  source: string;
  note: string;
  failover: FailoverRun;
  sampleRun: ExecutionRun;
}

export default function OperationsPage() {
  const [data, setData] = useState<OperationsBody | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="page">
      <h1>Operations</h1>
      <p className="lead">Failover state and sample receipts. A fixture row is not a confirmed payment.</p>
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
