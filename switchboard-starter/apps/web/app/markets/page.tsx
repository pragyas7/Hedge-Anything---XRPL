'use client';

import { useState } from 'react';
import type { FeeBreakdown, MarketQuote, MarketSearchResponse } from '@switchboard/contracts';
import { useDesk } from '../../components/desk-shell';
import { messageOf, readJson } from '../../state/http';
import { deskEligibility, isUsJurisdiction, quoteAgeLabel, quoteFreshness } from '../../state/quotes';

function feeText(fees: FeeBreakdown): string {
  return `trade ${fees.tradingFeeUsd}, network ${fees.networkFeeUsd}, conversion ${fees.conversionFeeUsd}, slippage ${fees.modeledSlippageUsd}, other ${fees.otherFeeUsd}`;
}

export default function MarketsPage() {
  const { state, ready } = useDesk();
  const [companyId, setCompanyId] = useState(state.analysis?.company.companyId ?? 'co_demo_ai');
  const [jurisdiction, setJurisdiction] = useState(state.analysis?.company.jurisdiction ?? 'US');
  const [quantity, setQuantity] = useState('10');
  const [includeReference, setIncludeReference] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [source, setSource] = useState<'markets' | 'fixture' | null>(null);
  const [result, setResult] = useState<MarketSearchResponse | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/markets/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        companyId,
        exposureIds: state.analysis?.company.exposures.map((exposure) => exposure.exposureId) ?? [],
        requestedQuantity: quantity,
        jurisdiction,
        includeReferenceMarkets: includeReference,
      }),
    });
    const body = await readJson(response);
    setBusy(false);
    if (!response.ok || !body.result) {
      setResult(null);
      setError(messageOf(body, 'Market search failed.'));
      setNote(typeof body.note === 'string' ? body.note : null);
      return;
    }
    setResult(body.result as unknown as MarketSearchResponse);
    setNote(typeof body.note === 'string' ? body.note : null);
    setSource(body.source === 'fixture' ? 'fixture' : 'markets');
  }

  const quotes = result?.quotes ?? [];
  const eligibleCount = quotes.filter((quote) => deskEligibility(quote, jurisdiction).eligible).length;

  return (
    <div className="page">
      <h1>Markets</h1>
      <p className="lead">Venue, comparison, fees, depth, age, and whether this desk would treat the quote as buyable. International Polymarket stays reference-only in US mode.</p>
      {!ready ? <p className="note" role="status">Loading desk…</p> : null}
      <form onSubmit={search}>
        <div className="grid-2">
          <label className="field"><span>Company id</span><input value={companyId} onChange={(event) => setCompanyId(event.target.value)} required /></label>
          <label className="field"><span>Jurisdiction</span><input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} required /></label>
          <label className="field"><span>Requested quantity</span><input value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        </div>
        <label className="field">
          <span><input type="checkbox" checked={includeReference} onChange={(event) => setIncludeReference(event.target.checked)} /> Include reference markets</span>
        </label>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search markets'}</button>
      </form>
      {busy ? <p className="note" role="status">Asking the markets service…</p> : null}
      {error ? <p className="bad" role="alert">{error}</p> : null}
      {note ? <p className={source === 'fixture' ? 'warn' : 'note'}>{note}</p> : null}
      {isUsJurisdiction(jurisdiction) ? <p className="note">US mode: polymarket_international is reference only and is not a buyable leg.</p> : null}
      {result && quotes.length === 0 ? <p className="note">No quotes in this search.</p> : null}
      {result && quotes.length > 0 && eligibleCount === 0 ? <p className="warn">No eligible hedge in this search.</p> : null}
      {quotes.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Venue</th>
                <th>Comparison</th>
                <th className="num">Bid / ask</th>
                <th className="num">Depth</th>
                <th>Fees USD</th>
                <th>Age</th>
                <th>Desk</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote: MarketQuote) => {
                const freshness = quoteFreshness(quote);
                const eligibility = deskEligibility(quote, jurisdiction);
                return (
                  <tr key={quote.quoteId}>
                    <td>{quote.instrument.name}<div>{quote.basisRiskDescription}</div></td>
                    <td>{quote.venue}<div>{quote.capability} · {quote.source}</div></td>
                    <td>{quote.comparison === 'direct' ? 'Direct' : quote.comparison === 'proxy' ? 'Proxy' : 'Not comparable'}</td>
                    <td className="num">{quote.bidUsd} / {quote.askUsd}<div>all-in {quote.estimatedAllInBuyCostUsd}</div></td>
                    <td className="num">{quote.availableQuantity}</td>
                    <td>{feeText(quote.fees)}</td>
                    <td>{quoteAgeLabel(quote.quotedAt)}{freshness === 'fresh' ? '' : ` · ${freshness}`}</td>
                    <td>{eligibility.label}{quote.venue === 'polymarket_international' && isUsJurisdiction(jurisdiction) ? '. Reference only, not a buyable leg.' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {!result && !busy && !error ? <p className="note">Search has not been run.</p> : null}
    </div>
  );
}
