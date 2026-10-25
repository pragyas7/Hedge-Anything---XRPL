'use client';

import Link from 'next/link';
import { useDesk } from '../../components/desk-shell';

export default function ActivityPage() {
  const { state, ready } = useDesk();
  if (!ready) return <div className="page"><p className="note" role="status">Loading desk…</p></div>;
  return (
    <div className="page">
      <h1>Activity</h1>
      <p className="lead">What this browser desk has asked the services to do. It is not a venue audit log and it does not prove settlement.</p>
      {state.activity.length === 0 ? (
        <>
          <p className="note">No proposals, approvals, or runs on this desk yet.</p>
          <Link className="btn" href="/onboard">Describe the company</Link>
        </>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>When</th><th>Kind</th><th>Source</th><th>What happened</th></tr>
            </thead>
            <tbody>
              {state.activity.map((item) => (
                <tr key={item.id}>
                  <td>{item.at}</td>
                  <td>{item.kind}</td>
                  <td>{item.source}</td>
                  <td>{item.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
