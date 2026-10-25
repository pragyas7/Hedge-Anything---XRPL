'use client';

import { useEffect, useState } from 'react';
import type { CompanyAnalysisResponse, CompanyProfile, RiskExposure, Scenario } from '@switchboard/contracts';
import { useDesk } from '../../components/desk-shell';
import { messageOf, readJson } from '../../state/http';

const MONEY = /^-?[0-9]+(?:\.[0-9]+)?$/;

export default function OnboardPage() {
  const { state, ready, update } = useDesk();
  const [description, setDescription] = useState('Fictional AI customer-support service that depends on primary model API');
  const [jurisdiction, setJurisdiction] = useState('US');
  const [budget, setBudget] = useState('800');
  const [tail, setTail] = useState('8000');
  const [draft, setDraft] = useState<CompanyAnalysisResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && state.analysis) setDraft(state.analysis);
  }, [ready, state.analysis]);

  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!MONEY.test(budget) || !MONEY.test(tail)) {
      setError('Budget and max tail loss must be decimal strings, such as 800 or 8000.50.');
      return;
    }
    setBusy(true);
    const response = await fetch('/api/strategy/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        description,
        jurisdiction,
        monthlyHedgeBudgetUsd: budget,
        maxTolerableTailLossUsd: tail,
      }),
    });
    const body = await readJson(response);
    setBusy(false);
    if (!response.ok) {
      setError(messageOf(body, 'Strategy service could not analyze this description.'));
      return;
    }
    const analysis = body as unknown as CompanyAnalysisResponse;
    setDraft(analysis);
    update((prev) => ({
      ...prev,
      analysis,
      activity: [{
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'analyze',
        summary: `Parsed ${analysis.company.companyId}`,
        source: 'strategy',
      }, ...prev.activity],
    }));
  }

  function patchCompany(patch: Partial<CompanyProfile>) {
    setDraft((current) => current ? { ...current, company: { ...current.company, ...patch, confirmedByUser: false } } : current);
  }

  function patchExposure(index: number, patch: Partial<RiskExposure>) {
    setDraft((current) => {
      if (!current) return current;
      const exposures = current.company.exposures.map((exposure, exposureIndex) => (
        exposureIndex === index ? { ...exposure, ...patch } : exposure
      ));
      return { ...current, company: { ...current.company, exposures, confirmedByUser: false } };
    });
  }

  function patchScenario(index: number, patch: Partial<Scenario>) {
    setDraft((current) => {
      if (!current) return current;
      const scenarios = current.company.scenarios.map((scenario, scenarioIndex) => (
        scenarioIndex === index ? { ...scenario, ...patch } : scenario
      ));
      return { ...current, company: { ...current.company, scenarios, confirmedByUser: false } };
    });
  }

  function confirmAssumptions() {
    if (!draft) return;
    const confirmed: CompanyAnalysisResponse = {
      ...draft,
      company: { ...draft.company, confirmedByUser: true },
    };
    setDraft(confirmed);
    update((prev) => ({
      ...prev,
      analysis: confirmed,
      activity: [{
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: 'confirm',
        summary: `Confirmed assumptions for ${confirmed.company.companyId} on this desk`,
        source: 'desk',
      }, ...prev.activity],
    }));
  }

  const probabilitySum = draft?.company.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0) ?? 0;

  return (
    <div className="page">
      <h1>Describe the company</h1>
      <p className="lead">The strategy service returns an editable profile. Confirming stores it on this desk and sends it with the next plan. It does not create a trade.</p>
      <form onSubmit={analyze}>
        <label className="field">
          <span>What does the business depend on?</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Jurisdiction</span>
            <input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} required />
          </label>
          <label className="field">
            <span>Monthly hedge budget, USD</span>
            <input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" required />
          </label>
          <label className="field">
            <span>Max tolerable tail loss, USD</span>
            <input value={tail} onChange={(event) => setTail(event.target.value)} inputMode="decimal" required />
          </label>
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Reading description…' : 'Parse exposures'}</button>
      </form>
      {busy ? <p className="note" role="status">Asking the strategy service…</p> : null}
      {error ? <p className="bad" role="alert">{error}</p> : null}
      {!draft && !busy ? <p className="note">No profile yet. A short description comes back with low confidence and a list of missing data.</p> : null}
      {draft ? (
        <section>
          <h2>{draft.company.name}</h2>
          <p>Confidence on the first exposure is {draft.company.exposures[0]?.confidence ?? 'n/a'}. User confirmation is {draft.company.confirmedByUser ? 'yes' : 'no'}.</p>
          {draft.warnings.map((warning) => <p className="warn" key={warning}>{warning}</p>)}
          <h3>Assumptions</h3>
          <ul>{draft.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
          <label className="field">
            <span>Name</span>
            <input value={draft.company.name} onChange={(event) => patchCompany({ name: event.target.value })} />
          </label>
          <label className="field">
            <span>Jurisdiction</span>
            <input value={draft.company.jurisdiction} onChange={(event) => patchCompany({ jurisdiction: event.target.value })} />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Monthly hedge budget, USD</span>
              <input value={draft.company.monthlyHedgeBudgetUsd} onChange={(event) => patchCompany({ monthlyHedgeBudgetUsd: event.target.value })} />
            </label>
            <label className="field">
              <span>Max tolerable tail loss, USD</span>
              <input value={draft.company.maxTolerableTailLossUsd} onChange={(event) => patchCompany({ maxTolerableTailLossUsd: event.target.value })} />
            </label>
          </div>
          {draft.company.exposures.map((exposure, index) => (
            <fieldset key={exposure.exposureId}>
              <legend>{exposure.category} · {exposure.horizonDays} days</legend>
              <label className="field">
                <span>Exposure</span>
                <input value={exposure.label} onChange={(event) => patchExposure(index, { label: event.target.value })} />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea value={exposure.description} onChange={(event) => patchExposure(index, { description: event.target.value })} />
              </label>
            </fieldset>
          ))}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Probability</th>
                  <th className="num">Baseline loss USD</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {draft.company.scenarios.map((scenario, index) => (
                  <tr key={scenario.scenarioId}>
                    <td><input value={scenario.label} onChange={(event) => patchScenario(index, { label: event.target.value })} /></td>
                    <td><input value={String(scenario.probability)} onChange={(event) => patchScenario(index, { probability: Number(event.target.value) })} /></td>
                    <td className="num"><input value={scenario.baselineLossUsd} onChange={(event) => patchScenario(index, { baselineLossUsd: event.target.value })} /></td>
                    <td>{scenario.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Math.abs(probabilitySum - 1) > 0.001 ? (
            <p className="warn">Probabilities sum to {probabilitySum.toFixed(4)}, not 1. The strategy service will reject a plan until they do.</p>
          ) : null}
          <button className="btn" type="button" onClick={confirmAssumptions}>Confirm assumptions</button>
        </section>
      ) : null}
    </div>
  );
}
