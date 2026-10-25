import { describe, expect, it } from 'vitest';
import { Decimal, dec, money } from '../src/money.js';
import { cvar, expectedLoss, percentile, probabilityWeights, repeatedShockFactors, stressWorstScenario, type WeightedLoss } from '../src/risk.js';
import { loadCompanyAnalysis, loadHedgePlan } from './fixtures.js';

function fixtureOutcomes(withHedges: boolean): WeightedLoss[] {
  const company = loadCompanyAnalysis().company;
  const plan = loadHedgePlan();
  const weights = probabilityWeights(company.scenarios);
  return company.scenarios.map((scenario, index) => {
    let loss = dec(scenario.baselineLossUsd);
    if (withHedges) {
      loss = loss.plus(dec(plan.estimatedTotalCostUsd));
      for (const leg of plan.legs) {
        loss = loss.minus(dec(leg.payoffByScenarioUsd[scenario.scenarioId] ?? '0'));
      }
    }
    return { loss, prob: weights[index]!, index };
  });
}

describe('fixture CVaR', () => {
  const alpha = new Decimal('0.95');
  const plan = loadHedgePlan();

  it('matches validate_starter.py percentile and CVaR on the seeded plan', () => {
    const before = fixtureOutcomes(false);
    const after = fixtureOutcomes(true);
    expect(money(expectedLoss(before))).toBe(plan.before.expectedLossUsd);
    expect(money(percentile(before, alpha))).toBe(plan.before.p95LossUsd);
    expect(money(cvar(before, alpha))).toBe(plan.before.cvar95LossUsd);
    expect(money(before.reduce((max, row) => (row.loss.gt(max) ? row.loss : max), before[0]!.loss))).toBe(plan.before.worstScenarioLossUsd);
    expect(money(expectedLoss(after))).toBe(plan.after.expectedLossUsd);
    expect(money(percentile(after, alpha))).toBe(plan.after.p95LossUsd);
    expect(money(cvar(after, alpha))).toBe(plan.after.cvar95LossUsd);
    expect(money(after.reduce((max, row) => (row.loss.gt(max) ? row.loss : max), after[0]!.loss))).toBe(plan.after.worstScenarioLossUsd);
    expect(dec(plan.after.cvar95LossUsd).lt(dec(plan.before.cvar95LossUsd))).toBe(true);
  });

  it('names factors that shock together and moves tail mass under stress', () => {
    const company = loadCompanyAnalysis().company;
    expect(repeatedShockFactors(company.scenarios)).toEqual(['fallback_spread', 'primary_outage']);
    const before = fixtureOutcomes(false);
    const stressed = stressWorstScenario(before, alpha);
    expect(stressed.stressed.gt(stressed.base)).toBe(true);
  });
});
