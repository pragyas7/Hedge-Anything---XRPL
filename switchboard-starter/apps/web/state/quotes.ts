import type { MarketQuote } from '@switchboard/contracts';

export function isUsJurisdiction(value: string): boolean {
  const jurisdiction = value.trim().toLowerCase();
  return jurisdiction === 'us'
    || jurisdiction === 'usa'
    || jurisdiction === 'united states'
    || jurisdiction.startsWith('us-')
    || jurisdiction.startsWith('us ');
}

export function quoteAgeLabel(quotedAt: string, now = Date.now()): string {
  const quoted = Date.parse(quotedAt);
  if (Number.isNaN(quoted)) return 'unknown age';
  const seconds = Math.max(0, Math.round((now - quoted) / 1000));
  if (seconds < 60) return `${seconds}s old`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h old`;
  return `${Math.round(hours / 24)}d old`;
}

export function quoteFreshness(quote: { quotedAt: string; expiresAt: string }, now = Date.now()): 'expired' | 'stale' | 'fresh' {
  const expires = Date.parse(quote.expiresAt);
  if (!Number.isNaN(expires) && expires <= now) return 'expired';
  const quoted = Date.parse(quote.quotedAt);
  if (Number.isNaN(quoted) || now - quoted > 30_000) return 'stale';
  return 'fresh';
}

export function deskEligibility(quote: MarketQuote, jurisdiction: string, now = Date.now()): { eligible: boolean; label: string } {
  if (isUsJurisdiction(jurisdiction) && quote.venue === 'polymarket_international') {
    return { eligible: false, label: 'Reference only' };
  }
  if (quote.capability === 'read_only' || quote.capability === 'unsupported') {
    return { eligible: false, label: quote.capability === 'read_only' ? 'Read only' : 'Unsupported' };
  }
  if (quote.comparison === 'not_comparable') return { eligible: false, label: 'Not comparable' };
  if (quoteFreshness(quote, now) === 'expired') return { eligible: false, label: 'Expired' };
  return { eligible: true, label: quote.capability === 'sandbox' ? 'Sandbox' : 'Executable' };
}
