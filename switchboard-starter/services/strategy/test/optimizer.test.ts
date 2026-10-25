import { describe, expect, it } from 'vitest';
import type { HedgePlan, MarketQuote, MarketSearchResponse } from '@switchboard/contracts';
import { StrategyError } from '../src/errors.js';
import { planHash } from '../src/hash.js';
import { dec } from '../src/money.js';
import { generatePlan } from '../src/optimizer.js';
import { AS_OF, loadCompanyAnalysis, loadMarketSearch } from './fixtures.js';

function request(mode: 'min_cvar' | 'min_cost' | 'balanced', market: MarketSearchResponse = loadMarketSearch()) {
  return {
    company: loadCompanyAnalysis().company,
    marketSearch: structuredClone(market),
    mode,
  } as const;
}

function quoteOverride(patch: Partial<Omit<MarketQuote, 'instrument'>> & { instrument?: Partial<MarketQuote['instrument']> }): MarketQuote {
  const base = structuredClone(loadMarketSearch().quotes[0]!);
  return {
    ...base,
    ...patch,
    instrument: { ...base.instrument, ...patch.instrument },
  };
}

describe('optimizer', () => {
  it('buys a budgeted hedge whose published CVaR is below the unhedged fixture math', () => {
    const plan = generatePlan(request('min_cvar'), AS_OF);
    expect(plan.legs.length).toBeGreaterThan(0);
    expect(dec(plan.estimatedTotalCostUsd).lte(dec(plan.budgetUsd))).toBe(true);
    expect(plan.legs.some((leg) => leg.venue === 'polymarket_international')).toBe(false);
    const legSum = plan.legs.reduce((sum, leg) => sum.plus(dec(leg.estimatedAllInCostUsd)), dec(0));
    expect(legSum.eq(dec(plan.estimatedTotalCostUsd))).toBe(true);
    expect(dec(plan.after.cvar95LossUsd).lt(dec(plan.before.cvar95LossUsd))).toBe(true);
    expect(plan.planHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(plan.planHash).not.toBe('sha256:demo_only_untrusted_digest_replace_in_production');
    expect(plan.syntheticDemo).toBe(true);
    const altered: HedgePlan = { ...plan, status: 'FAILED', planHash: 'sha256:ignored' };
    expect(planHash(altered)).toBe(plan.planHash);
  });

  it('separates min_cvar, min_cost, and balanced inside the same budget', () => {
    const plans = (['min_cvar', 'min_cost', 'balanced'] as const).map((mode) => generatePlan(request(mode), AS_OF));
    for (const plan of plans) {
      expect(dec(plan.estimatedTotalCostUsd).lte(dec(plan.budgetUsd))).toBe(true);
      expect(dec(plan.after.cvar95LossUsd).lt(dec(plan.before.cvar95LossUsd))).toBe(true);
    }
    const quantities = plans.map((plan) => plan.legs.map((leg) => leg.quantity).join(','));
    expect(new Set(quantities).size).toBe(3);
    expect(dec(plans[1]!.estimatedTotalCostUsd).lt(dec(plans[0]!.estimatedTotalCostUsd))).toBe(true);
  });

  it('returns NO_ACTION when every quote is expired', () => {
    const market = loadMarketSearch();
    market.quotes[0]!.expiresAt = '2020-01-01T00:00:00Z';
    const plan = generatePlan(request('min_cvar', market), AS_OF);
    expect(plan.legs).toEqual([]);
    expect(plan.estimatedTotalCostUsd).toBe('0');
    expect(plan.rationale).toContain('NO_ACTION');
    expect(plan.warnings.some((warning) => /expired/i.test(warning))).toBe(true);
    expect(dec(plan.after.cvar95LossUsd).eq(dec(plan.before.cvar95LossUsd))).toBe(true);
  });

  it('drops an expired quote and keeps a live-dated one', () => {
    const market = loadMarketSearch();
    const fresh = quoteOverride({ quoteId: 'quote_fresh' });
    const stale = quoteOverride({ quoteId: 'quote_stale', expiresAt: '2020-01-01T00:00:00Z' });
    market.quotes = [stale, fresh];
    const plan = generatePlan(request('min_cost', market), AS_OF);
    expect(plan.legs.every((leg) => leg.quoteId !== 'quote_stale')).toBe(true);
    expect(plan.legs.some((leg) => leg.quoteId === 'quote_fresh')).toBe(true);
  });

  it('refuses a negative budget instead of inventing a plan', () => {
    const body = request('min_cvar');
    body.company.monthlyHedgeBudgetUsd = '-10';
    expect(() => generatePlan(body, AS_OF)).toThrow(StrategyError);
    try {
      generatePlan(body, AS_OF);
    } catch (error) {
      expect(error).toMatchObject({ status: 400, code: 'INFEASIBLE_BUDGET' });
    }
  });

  it('does not buy polymarket international for a US company', () => {
    const market = loadMarketSearch();
    market.quotes = [quoteOverride({
      quoteId: 'quote_poly_intl',
      venue: 'polymarket_international',
      instrument: { venue: 'polymarket_international', name: 'Reference outage print' },
      capability: 'sandbox',
      comparison: 'direct',
      eligibilityReason: 'Displayed for reference',
    })];
    const plan = generatePlan(request('min_cvar', market), AS_OF);
    expect(plan.legs).toEqual([]);
    expect(plan.rationale).toContain('NO_ACTION');
    expect(plan.warnings.some((warning) => warning.includes('polymarket_international') && /reference only/i.test(warning))).toBe(true);
  });

  it('labels proxy settlement mismatch and does not treat weather as digital uptime cover', () => {
    const proxy = generatePlan(request('min_cost'), AS_OF);
    expect(proxy.legs[0]?.basisRisk).toMatch(/Settlement mismatch/);
    expect(proxy.warnings.some((warning) => /proxy/i.test(warning))).toBe(true);

    const market = loadMarketSearch();
    market.quotes = [quoteOverride({
      quoteId: 'quote_hurricane',
      venue: 'kalshi',
      comparison: 'direct',
      capability: 'sandbox',
      eligibilityReason: 'Sandbox quote',
      instrument: {
        venue: 'kalshi',
        name: 'Hurricane landfall',
        riskFactor: 'hurricane',
        eventRule: 'Pays on a named hurricane landfall, not on cloud uptime.',
      },
      basisRiskDescription: 'Storm settlement is not an outage observation.',
    })];
    const blocked = generatePlan(request('min_cvar', market), AS_OF);
    expect(blocked.legs).toEqual([]);
    expect(blocked.warnings.some((warning) => /not a direct hedge of digital uptime/i.test(warning))).toBe(true);
  });

  it('keeps the same plan hash for the same request body', () => {
    const first = generatePlan(request('balanced'), AS_OF);
    const second = generatePlan(request('balanced'), AS_OF);
    expect(second.planHash).toBe(first.planHash);
    expect(second.planId).toBe(first.planId);
  });
});
