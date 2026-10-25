'use client';

import { useState } from 'react';
import type { ExchangeOrderbook } from '@switchboard/contracts';
import { messageOf, readJson } from '../../state/http';

export default function ExchangePage() {
  const [instrumentId, setInstrumentId] = useState('sb_sandbox_outage_20261130');
  const [book, setBook] = useState<ExchangeOrderbook | null>(null);
  const [bookNote, setBookNote] = useState<string | null>(null);
  const [bookSource, setBookSource] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [loadingBook, setLoadingBook] = useState(false);
  const [instrumentType, setInstrumentType] = useState<'binary' | 'capped_call' | 'capacity_option'>('binary');
  const [termsHash, setTermsHash] = useState('sandbox-terms');
  const [quantity, setQuantity] = useState('10');
  const [expiresAt, setExpiresAt] = useState('2026-11-01T00:00:00Z');
  const [jurisdiction, setJurisdiction] = useState('US');
  const [rfqBusy, setRfqBusy] = useState(false);
  const [rfqError, setRfqError] = useState<string | null>(null);
  const [rfqNote, setRfqNote] = useState<string | null>(null);
  const [rfqBody, setRfqBody] = useState<string | null>(null);

  async function loadBook(event: React.FormEvent) {
    event.preventDefault();
    setLoadingBook(true);
    setBookError(null);
    const response = await fetch(`/api/markets/orderbook/${encodeURIComponent(instrumentId)}`);
    const body = await readJson(response);
    setLoadingBook(false);
    if (!response.ok || !body.book) {
      setBook(null);
      setBookError(messageOf(body, 'Order book is unavailable.'));
      return;
    }
    setBook(body.book as unknown as ExchangeOrderbook);
    setBookNote(typeof body.note === 'string' ? body.note : null);
    setBookSource(typeof body.source === 'string' ? body.source : null);
  }

  async function sendRfq(event: React.FormEvent) {
    event.preventDefault();
    setRfqBusy(true);
    setRfqError(null);
    setRfqBody(null);
    const response = await fetch('/api/markets/rfqs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        instrumentType,
        canonicalTermsHash: termsHash,
        desiredQuantity: quantity,
        expiresAt,
        approvedJurisdiction: jurisdiction,
      }),
    });
    const body = await readJson(response);
    setRfqBusy(false);
    setRfqNote(typeof body.note === 'string' ? body.note : null);
    if (!response.ok) {
      setRfqError(messageOf(body, 'The RFQ was not accepted.'));
      return;
    }
    setRfqBody(JSON.stringify(body.body ?? body, null, 2));
  }

  return (
    <div className="page">
      <h1>Exchange</h1>
      <p className="warn">Sandbox / testnet. This screen does not place a live US derivatives order and does not hold a venue key.</p>
      <form onSubmit={loadBook}>
        <label className="field">
          <span>Instrument</span>
          <input value={instrumentId} onChange={(event) => setInstrumentId(event.target.value)} required />
        </label>
        <button className="btn" type="submit" disabled={loadingBook}>{loadingBook ? 'Loading book…' : 'Load order book'}</button>
      </form>
      {bookError ? <p className="bad" role="alert">{bookError}</p> : null}
      {bookNote ? <p className={bookSource === 'fixture' ? 'warn' : 'note'}>{bookNote}</p> : null}
      {!book && !loadingBook && !bookError ? <p className="note">No book loaded.</p> : null}
      {book ? (
        <div className="pair">
          <div>
            <h2>Bids</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th className="num">Price USD</th><th className="num">Quantity</th></tr></thead>
                <tbody>
                  {book.bids.length === 0 ? <tr><td colSpan={2}>No bids.</td></tr> : book.bids.map((level) => (
                    <tr key={`b-${level.priceUsd}-${level.quantity}`}><td className="num">{level.priceUsd}</td><td className="num">{level.quantity}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h2>Asks</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th className="num">Price USD</th><th className="num">Quantity</th></tr></thead>
                <tbody>
                  {book.asks.length === 0 ? <tr><td colSpan={2}>No asks.</td></tr> : book.asks.map((level) => (
                    <tr key={`a-${level.priceUsd}-${level.quantity}`}><td className="num">{level.priceUsd}</td><td className="num">{level.quantity}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
      {book ? <p className="note">Book mode {book.mode}. Updated {book.updatedAt}.</p> : null}
      <h2>RFQ</h2>
      <p className="lead">Sends a sandbox RFQ to the markets service. If that service is down, the request fails. It is not marked accepted locally.</p>
      <form onSubmit={sendRfq}>
        <div className="grid-2">
          <label className="field">
            <span>Instrument type</span>
            <select value={instrumentType} onChange={(event) => setInstrumentType(event.target.value as typeof instrumentType)}>
              <option value="binary">Binary</option>
              <option value="capped_call">Capped call</option>
              <option value="capacity_option">Capacity option</option>
            </select>
          </label>
          <label className="field"><span>Terms hash</span><input value={termsHash} onChange={(event) => setTermsHash(event.target.value)} required /></label>
          <label className="field"><span>Quantity</span><input value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
          <label className="field"><span>Expires</span><input value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required /></label>
          <label className="field"><span>Jurisdiction</span><input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} required /></label>
        </div>
        <button className="btn" type="submit" disabled={rfqBusy}>{rfqBusy ? 'Sending RFQ…' : 'Send RFQ'}</button>
      </form>
      {rfqError ? <p className="bad" role="alert">{rfqError}</p> : null}
      {rfqNote ? <p className="note">{rfqNote}</p> : null}
      {rfqBody ? <pre>{rfqBody}</pre> : null}
    </div>
  );
}
