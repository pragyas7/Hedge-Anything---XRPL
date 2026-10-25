import type { Scenario, TailRiskMetrics } from '@switchboard/contracts';
import { StrategyError } from './errors.js';
import { Decimal, dec, money } from './money.js';

export interface WeightedLoss {
  loss: Decimal;
  prob: Decimal;
  index: number;
}

/**
 * Weighted upper-tail CVaR. Same accumulation order as tests/validate_starter.py:
 * walk losses from worst to best, take probability mass until (1-alpha) is filled.
 */
export function cvar(losses: WeightedLoss[], confidence: Decimal): Decimal {
  const tail = new Decimal(1).minus(confidence);
  if (tail.lte(0)) {
    throw new StrategyError(400, 'INVALID_ALPHA', 'CVaR confidence must be below 1.');
  }
  let remaining = tail;
  let accum = new Decimal(0);
  const sorted = [...losses].sort((a, b) => {
    const byLoss = b.loss.comparedTo(a.loss) ?? 0;
    if (byLoss !== 0) return byLoss;
    return a.index - b.index;
  });
  for (const row of sorted) {
    const take = Decimal.min(row.prob, remaining);
    accum = accum.plus(row.loss.times(take));
    remaining = remaining.minus(take);
    if (remaining.eq(0)) break;
  }
  if (!remaining.eq(0)) {
    throw new StrategyError(400, 'INVALID_SCENARIOS', 'Scenario probabilities do not cover the CVaR tail.');
  }
  return accum.div(tail);
}

/** Lower-tail walk matching validate_starter.percentile: first loss whose cumulative probability reaches alpha. */
export function percentile(losses: WeightedLoss[], alpha: Decimal): Decimal {
  let cumulative = new Decimal(0);
  const sorted = [...losses].sort((a, b) => {
    const byLoss = a.loss.comparedTo(b.loss) ?? 0;
    if (byLoss !== 0) return byLoss;
    return a.index - b.index;
  });
  for (const row of sorted) {
    cumulative = cumulative.plus(row.prob);
    if (cumulative.gte(alpha)) return row.loss;
  }
  throw new StrategyError(400, 'INVALID_SCENARIOS', 'Scenario probabilities do not reach the percentile.');
}

export function expectedLoss(losses: WeightedLoss[]): Decimal {
  return losses.reduce((sum, row) => sum.plus(row.loss.times(row.prob)), new Decimal(0));
}

export function worstLoss(losses: WeightedLoss[]): Decimal {
  return losses.reduce((max, row) => (row.loss.gt(max) ? row.loss : max), losses[0]?.loss ?? new Decimal(0));
}

export function toMetrics(losses: WeightedLoss[], alpha: Decimal): TailRiskMetrics {
  return {
    expectedLossUsd: money(expectedLoss(losses)),
    p95LossUsd: money(percentile(losses, alpha)),
    cvar95LossUsd: money(cvar(losses, alpha)),
    worstScenarioLossUsd: money(worstLoss(losses)),
  };
}

export function probabilityWeights(scenarios: Scenario[]): Decimal[] {
  if (scenarios.length === 0) {
    throw new StrategyError(400, 'INVALID_SCENARIOS', 'At least one scenario is required.');
  }
  const weights = scenarios.map((scenario) => {
    if (typeof scenario.probability !== 'number' || !Number.isFinite(scenario.probability) || scenario.probability < 0 || scenario.probability > 1) {
      throw new StrategyError(400, 'INVALID_SCENARIOS', `Scenario ${scenario.scenarioId} has an invalid probability.`);
    }
    return dec(scenario.probability);
  });
  const sum = weights.reduce((total, weight) => total.plus(weight), new Decimal(0));
  const gap = new Decimal(1).minus(sum);
  if (gap.abs().gt('0.001')) {
    throw new StrategyError(400, 'INVALID_SCENARIOS', `Scenario probabilities sum to ${sum.toString()}, not 1.`);
  }
  if (!gap.eq(0)) {
    const last = weights.length - 1;
    weights[last] = weights[last]!.plus(gap);
  }
  return weights;
}

/** Move `shift` probability from the largest other bucket onto the worst loss. */
export function stressWorstScenario(losses: WeightedLoss[], alpha: Decimal, shift: Decimal = new Decimal('0.02')): { base: Decimal; stressed: Decimal } {
  const base = cvar(losses, alpha);
  if (losses.length < 2) return { base, stressed: base };
  let worst = 0;
  for (let i = 1; i < losses.length; i += 1) {
    if (losses[i]!.loss.gt(losses[worst]!.loss)) worst = i;
  }
  let donor = -1;
  for (let i = 0; i < losses.length; i += 1) {
    if (i === worst) continue;
    if (donor < 0 || losses[i]!.prob.gt(losses[donor]!.prob)) donor = i;
  }
  if (donor < 0) return { base, stressed: base };
  const amount = Decimal.min(shift, losses[donor]!.prob);
  const stressed = losses.map((row, index) => {
    if (index === worst) return { ...row, prob: row.prob.plus(amount) };
    if (index === donor) return { ...row, prob: row.prob.minus(amount) };
    return row;
  });
  return { base, stressed: cvar(stressed, alpha) };
}

export function repeatedShockFactors(scenarios: Scenario[]): string[] {
  const counts = new Map<string, number>();
  for (const scenario of scenarios) {
    for (const [factor, shock] of Object.entries(scenario.factorShocks)) {
      if (typeof shock === 'number' && shock !== 0) {
        counts.set(factor, (counts.get(factor) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()].filter(([, count]) => count >= 2).map(([factor]) => factor).sort();
}
