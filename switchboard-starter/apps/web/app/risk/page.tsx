'use client';

import Link from 'next/link';
import { useDesk } from '../../components/desk-shell';

export default function RiskPage() {
  const { state, ready } = useDesk();
  if (!ready) return <div className="page"><p className="note" role="status">Loading desk…</p></div>;
  const company = state.analysis?.company;
  const plan = state.activeMode ? state.plans[state.activeMode] : undefined;
  if (!company) {
    return (
      <div className="page">
        <h1>Risk</h1>
        <p className="note">No company on this desk yet.</p>
        <Link className="btn" href="/onboard">Describe the company</Link>
      </div>
    );
  }
  return (
    <div className="page">
      <h1>Risk</h1>
      <p className="lead">Scenario losses are the ones you confirmed or the template returned. After-hedge figures appear only when a strategy plan exists. They are not a guarantee.</p>
      {!company.confirmedByUser ? <p className="warn">Assumptions are not confirmed.</p> : null}
      <div className="pair">
        <div>
          <p className="metric-label">CVaR before</p>
          <p className="metric">{plan ? plan.before.cvar95LossUsd : '—'}</p>
          <p className="metric-label">USD, published tail</p>
        </div>
        <div>
          <p className="metric-label">CVaR after</p>
          <p className="metric">{plan ? plan.after.cvar95LossUsd : '—'}</p>
          <p className="metric-label">{plan ? 'Includes premium once, fixture convention' : 'Generate a strategy to compute this'}</p>
        </div>
      </div>
      {!plan ? <p className="note">No hedge plan yet. Tail metrics after hedging are unavailable.</p> : null}
      {plan && plan.legs.length === 0 ? <p className="warn">No eligible hedge. The plan is no-trade. Losses are not marked as reduced.</p> : null}
      {plan ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Metric</th><th className="num">Before</th><th className="num">After</th></tr>
            </thead>
            <tbody>
              <tr><td>Expected loss</td><td className="num">{plan.before.expectedLossUsd}</td><td className="num">{plan.after.expectedLossUsd}</td></tr>
              <tr><td>95th percentile</td><td className="num">{plan.before.p95LossUsd}</td><td className="num">{plan.after.p95LossUsd}</td></tr>
              <tr><td>CVaR 95</td><td className="num">{plan.before.cvar95LossUsd}</td><td className="num">{plan.after.cvar95LossUsd}</td></tr>
              <tr><td>Worst scenario</td><td className="num">{plan.before.worstScenarioLossUsd}</td><td className="num">{plan.after.worstScenarioLossUsd}</td></tr>
              <tr><td>Premium in the plan</td><td className="num">0</td><td className="num">{plan.estimatedTotalCostUsd}</td></tr>
            </tbody>
          </table>
        </div>
      ) : null}
      <h2>Exposures</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Exposure</th><th>Category</th><th>Factors</th><th className="num">Horizon</th><th className="num">Confidence</th></tr>
          </thead>
          <tbody>
            {company.exposures.map((exposure) => (
              <tr key={exposure.exposureId}>
                <td>{exposure.label}<div>{exposure.description}</div></td>
                <td>{exposure.category}</td>
                <td>{exposure.riskFactors.join(', ')}</td>
                <td className="num">{exposure.horizonDays}</td>
                <td className="num">{exposure.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Scenarios</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Scenario</th><th className="num">Probability</th><th className="num">Baseline loss USD</th><th>Source</th></tr>
          </thead>
          <tbody>
            {company.scenarios.map((scenario) => (
              <tr key={scenario.scenarioId}>
                <td>{scenario.label}</td>
                <td className="num">{scenario.probability}</td>
                <td className="num">{scenario.baselineLossUsd}</td>
                <td>{scenario.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
