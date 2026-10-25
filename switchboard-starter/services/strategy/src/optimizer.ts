import type {
  CapacityOffer,
  CompanyProfile,
  GenerateStrategyRequest,
  HedgeLeg,
  HedgePlan,
  MarketQuote,
  Scenario,
  Venue,
} from '@switchboard/contracts';
import { StrategyError } from './errors.js';
import { canonicalJson, planHash, sha256Hex } from './hash.js';
import { Decimal, dec, isMoneyString, money } from './money.js';
import { probabilityWeights, repeatedShockFactors, stressWorstScenario, toMetrics, type WeightedLoss } from './risk.js';

/** Integer lot grid. 0 is always the no-trade point on a leg. */
export const LOT_GRID = [0, 1, 2, 5, 10, 20, 25, 50] as const;
export const MAX_SEARCH_CANDIDATES = 5;
export const MAX_QTY_PER_LEG = 100;
/** Share of contractual payoff removed for proxy settlement mismatch. */
export const PROXY_BASIS_SHORTFALL = new Decimal('0.25');

const REPORTING_WARNING = 'Reporting convention: published hedged loss adds estimatedTotalCostUsd on every scenario (same arithmetic as tests/validate_starter.py). The lot selector does not put that premium inside residual loss; premium is only the budget constraint. Proxy basis shortfall is 25% of contractual payoff and is already removed from payoffByScenarioUsd.';

const NO_ACTION_RATIONALE = 'NO_ACTION: no eligible, unexpired, US-executable quote reduces tail loss inside the budget.';

export type StrategyMode = GenerateStrategyRequest['mode'];

interface PreparedCandidate extends SearchCandidate {
  quote: MarketQuote;
  basisFraction: Decimal;
  effectiveComparison: 'direct' | 'proxy';
}

export interface SearchCandidate {
  id: string;
  unitCost: Decimal;
  quantities: number[];
  payoffPerUnit: Decimal[];
}

export interface SearchProblem {
  mode: StrategyMode;
  budget: Decimal;
  alpha: Decimal;
  baselineLoss: Decimal[];
  probabilities: Decimal[];
  candidates: SearchCandidate[];
}

/** Replacement point for a MILP solver. Return one integer quantity per candidate. */
export type LotSolver = (problem: SearchProblem) => number[];

interface Scored {
  quantities: number[];
  cost: Decimal;
  residualCvar: Decimal;
  publishedCvar: Decimal;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StrategyError(400, 'INVALID_REQUEST', message);
  }
  return value as Record<string, unknown>;
}

function requireString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new StrategyError(400, 'INVALID_REQUEST', `${field} is required.`);
  }
  return value;
}

export function isUsJurisdiction(value: string): boolean {
  const jurisdiction = value.trim().toLowerCase();
  return jurisdiction === 'us'
    || jurisdiction === 'usa'
    || jurisdiction === 'united states'
    || jurisdiction.startsWith('us-')
    || jurisdiction.startsWith('us ');
}

export function normalizeIso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new StrategyError(400, 'INVALID_TIMESTAMP', `${field} is not a timestamp.`);
  }
  return new Date(parsed).toISOString().replace(/\.000Z$/, 'Z');
}

function addHours(iso: string, hours: number): string {
  const parsed = Date.parse(iso);
  return new Date(parsed + hours * 3_600_000).toISOString().replace(/\.000Z$/, 'Z');
}

function companyText(company: CompanyProfile): string {
  return [
    company.description,
    company.name,
    ...company.exposures.flatMap((exposure) => [exposure.category, exposure.label, exposure.description, ...exposure.riskFactors]),
  ].join(' ').toLowerCase();
}

function quoteText(quote: MarketQuote): string {
  return [
    quote.instrument.name,
    quote.instrument.riskFactor,
    quote.instrument.eventRule,
    quote.basisRiskDescription,
    quote.eligibilityReason,
  ].join(' ').toLowerCase();
}

const WEATHER = /\b(weather|storm|hurricane|rainfall|temperature|snow|wind|flood|climate)\b/;
const DIGITAL = /\b(cloud|uptime|outage|inference|api|compute|gpu|model|saas|server|digital)\b/;

export function blocksWeatherOnDigital(quote: MarketQuote, company: CompanyProfile): boolean {
  const instrument = quoteText(quote);
  const business = companyText(company);
  return WEATHER.test(instrument) && DIGITAL.test(business) && !WEATHER.test(business);
}

function knownFactors(company: CompanyProfile): Set<string> {
  const factors = new Set<string>();
  for (const exposure of company.exposures) {
    for (const factor of exposure.riskFactors) factors.add(factor);
  }
  for (const scenario of company.scenarios) {
    for (const factor of Object.keys(scenario.factorShocks)) factors.add(factor);
  }
  return factors;
}

export interface Exclusion {
  quoteId: string;
  reason: string;
}

export function grossPayoffPerUnit(quote: MarketQuote, scenario: Scenario): Decimal {
  const shockRaw = scenario.factorShocks[quote.instrument.riskFactor];
  const shock = new Decimal(typeof shockRaw === 'number' && Number.isFinite(shockRaw) ? shockRaw.toString() : '0');
  if (shock.lte(0)) return new Decimal(0);
  const perUnit = dec(quote.instrument.payoutPerUnitUsd);
  const cap = dec(quote.instrument.maximumPayoutUsd);
  if (quote.instrument.settlementType === 'capped_call') {
    return Decimal.min(perUnit.times(shock), cap);
  }
  return Decimal.min(perUnit, cap);
}

function feeSum(quote: MarketQuote): Decimal {
  const fees = quote.fees;
  return dec(fees.tradingFeeUsd)
    .plus(fees.networkFeeUsd)
    .plus(fees.conversionFeeUsd)
    .plus(fees.modeledSlippageUsd)
    .plus(fees.otherFeeUsd);
}

function unitAllIn(quote: MarketQuote): Decimal {
  const requested = dec(quote.requestedQuantity);
  if (requested.gt(0)) return dec(quote.estimatedAllInBuyCostUsd).div(requested);
  return dec(quote.askUsd);
}

function lotsFor(maxQty: number): number[] {
  const lots = new Set<number>([0]);
  for (const point of LOT_GRID) {
    if (point <= maxQty) lots.add(point);
  }
  if (maxQty > 0) lots.add(maxQty);
  return [...lots].sort((a, b) => a - b);
}

function quoteIsExecutableCapability(quote: MarketQuote): boolean {
  return quote.capability === 'live' || quote.capability === 'sandbox';
}

function eligibilityBlocked(reason: string): boolean {
  return /reference only|ineligible|jurisdiction blocked|not permitted|cannot execute|not executable/i.test(reason);
}

export function exclusionReason(quote: MarketQuote, company: CompanyProfile, now: Date): string | null {
  if (quote.venue !== quote.instrument.venue) return 'quote venue does not match instrument venue';
  if (!quoteIsExecutableCapability(quote)) return `capability ${quote.capability} is not executable`;
  if (quote.comparison === 'not_comparable') return 'comparison not_comparable is not executable';
  const quoteExpiry = Date.parse(quote.expiresAt);
  const instrumentExpiry = Date.parse(quote.instrument.expiresAt);
  if (Number.isNaN(quoteExpiry) || quoteExpiry <= now.getTime()) return 'expired';
  if (!Number.isNaN(instrumentExpiry) && instrumentExpiry <= now.getTime()) return 'instrument expired';
  if (isUsJurisdiction(company.jurisdiction) && (quote.venue === 'polymarket_international' || quote.instrument.venue === 'polymarket_international')) {
    return 'polymarket_international is reference only for a US jurisdiction and cannot be bought';
  }
  if (eligibilityBlocked(quote.eligibilityReason)) return 'source or venue is not eligible for this jurisdiction';
  if (blocksWeatherOnDigital(quote, company)) {
    return 'weather or climate contract is not a direct hedge of digital uptime and is not executable';
  }
  if (!isMoneyString(quote.estimatedAllInBuyCostUsd) || !isMoneyString(quote.askUsd)) return 'quote price is not a decimal string';
  const cost = unitAllIn(quote);
  if (cost.lte(0)) return 'non-positive all-in cost';
  return null;
}

function effectiveComparison(quote: MarketQuote, company: CompanyProfile): 'direct' | 'proxy' {
  if (quote.comparison === 'proxy') return 'proxy';
  const factor = quote.instrument.riskFactor;
  if (!knownFactors(company).has(factor)) return 'proxy';
  return 'direct';
}

function scaledFeeNote(quote: MarketQuote, quantity: number): string {
  const requested = dec(quote.requestedQuantity);
  if (requested.lte(0) || quantity === 0) return '0';
  return money(feeSum(quote).times(quantity).div(requested));
}

interface Evaluated {
  cost: Decimal;
  legCosts: string[];
  residual: WeightedLoss[];
  published: WeightedLoss[];
  residualCvar: Decimal;
  publishedCvar: Decimal;
}

function evaluate(problem: SearchProblem, quantities: number[]): Evaluated {
  const costParts: Decimal[] = quantities.map((quantity, index) => problem.candidates[index]!.unitCost.times(quantity));
  const legCosts = costParts.map((cost, index) => (quantities[index] === 0 ? '0' : money(cost)));
  const cost = legCosts.reduce((sum, part, index) => (quantities[index] === 0 ? sum : sum.plus(dec(part))), new Decimal(0));
  const residual: WeightedLoss[] = problem.baselineLoss.map((loss, index) => {
    let payoff = new Decimal(0);
    problem.candidates.forEach((candidate, candidateIndex) => {
      payoff = payoff.plus(candidate.payoffPerUnit[index]!.times(quantities[candidateIndex] ?? 0));
    });
    return { loss: loss.minus(payoff), prob: problem.probabilities[index]!, index };
  });
  const published = residual.map((row) => ({ ...row, loss: row.loss.plus(cost) }));
  const metricsResidual = toMetrics(residual, problem.alpha);
  const metricsPublished = toMetrics(published, problem.alpha);
  return {
    cost,
    legCosts,
    residual,
    published,
    residualCvar: dec(metricsResidual.cvar95LossUsd),
    publishedCvar: dec(metricsPublished.cvar95LossUsd),
  };
}

function lexLess(left: number[], right: number[]): boolean {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index]! < right[index]!;
  }
  return false;
}

function better(mode: StrategyMode, left: Scored, right: Scored, balancedCeiling: Decimal | null): boolean {
  if (mode === 'min_cost') {
    if (!left.cost.eq(right.cost)) return left.cost.lt(right.cost);
    if (!left.residualCvar.eq(right.residualCvar)) return left.residualCvar.lt(right.residualCvar);
    return lexLess(left.quantities, right.quantities);
  }
  if (mode === 'balanced') {
    const leftIn = balancedCeiling ? left.publishedCvar.lte(balancedCeiling) : true;
    const rightIn = balancedCeiling ? right.publishedCvar.lte(balancedCeiling) : true;
    if (leftIn !== rightIn) return leftIn;
    if (!left.cost.eq(right.cost)) return left.cost.lt(right.cost);
    if (!left.publishedCvar.eq(right.publishedCvar)) return left.publishedCvar.lt(right.publishedCvar);
    return lexLess(left.quantities, right.quantities);
  }
  if (!left.residualCvar.eq(right.residualCvar)) return left.residualCvar.lt(right.residualCvar);
  if (!left.publishedCvar.eq(right.publishedCvar)) return left.publishedCvar.lt(right.publishedCvar);
  if (!left.cost.eq(right.cost)) return left.cost.lt(right.cost);
  return lexLess(left.quantities, right.quantities);
}

export function gridLotSolver(problem: SearchProblem): number[] {
  const scored: Scored[] = [];
  const chosen = new Array<number>(problem.candidates.length).fill(0);

  const visit = (index: number): void => {
    if (index === problem.candidates.length) {
      const outcome = evaluate(problem, chosen);
      if (outcome.cost.gt(problem.budget)) return;
      scored.push({
        quantities: [...chosen],
        cost: outcome.cost,
        residualCvar: outcome.residualCvar,
        publishedCvar: outcome.publishedCvar,
      });
      return;
    }
    for (const quantity of problem.candidates[index]!.quantities) {
      chosen[index] = quantity;
      visit(index + 1);
    }
  };

  if (problem.candidates.length === 0) return [];
  visit(0);
  const zero = scored.find((row) => row.quantities.every((quantity) => quantity === 0));
  if (!zero) return problem.candidates.map(() => 0);
  const improving = scored.filter((row) => row.publishedCvar.lt(zero.publishedCvar) && row.quantities.some((quantity) => quantity > 0));
  if (improving.length === 0) return problem.candidates.map(() => 0);
  const bestPublished = improving.reduce((best, row) => (row.publishedCvar.lt(best) ? row.publishedCvar : best), improving[0]!.publishedCvar);
  const reduction = zero.publishedCvar.minus(bestPublished);
  const ceiling = zero.publishedCvar.minus(reduction.times('0.5'));
  let winner = improving[0]!;
  for (const row of improving.slice(1)) {
    if (better(problem.mode, row, winner, ceiling)) winner = row;
  }
  return winner.quantities;
}

function quoteDemo(quote: MarketQuote): boolean {
  return quote.source === 'synthetic' || quote.source === 'sandbox' || quote.capability === 'sandbox';
}

function offerDemo(offer: CapacityOffer): boolean {
  return offer.capability === 'sandbox' || offer.capability === 'unsupported' || offer.capability === 'read_only';
}

function validateCompany(company: CompanyProfile): CompanyProfile {
  if (!company || typeof company !== 'object') {
    throw new StrategyError(400, 'INVALID_REQUEST', 'company is required.');
  }
  if (!isMoneyString(company.monthlyHedgeBudgetUsd) || !isMoneyString(company.maxTolerableTailLossUsd)) {
    throw new StrategyError(400, 'INVALID_MONEY', 'Company money fields must be decimal strings.');
  }
  if (company.monthlyHedgeBudgetUsd.startsWith('-') || dec(company.monthlyHedgeBudgetUsd).lt(0)) {
    throw new StrategyError(400, 'INFEASIBLE_BUDGET', 'monthlyHedgeBudgetUsd cannot be negative.');
  }
  if (typeof company.cvarAlpha !== 'number' || company.cvarAlpha < 0.5 || company.cvarAlpha > 0.999) {
    throw new StrategyError(400, 'INVALID_ALPHA', 'cvarAlpha must be between 0.5 and 0.999.');
  }
  if (!Array.isArray(company.scenarios) || company.scenarios.length === 0) {
    throw new StrategyError(400, 'INVALID_SCENARIOS', 'At least one scenario is required.');
  }
  const seen = new Set<string>();
  for (const scenario of company.scenarios) {
    if (!scenario?.scenarioId || seen.has(scenario.scenarioId)) {
      throw new StrategyError(400, 'INVALID_SCENARIOS', 'Scenario ids must be unique.');
    }
    seen.add(scenario.scenarioId);
    if (!isMoneyString(scenario.baselineLossUsd)) {
      throw new StrategyError(400, 'INVALID_MONEY', `baselineLossUsd for ${scenario.scenarioId} must be a decimal string.`);
    }
    if (!scenario.factorShocks || typeof scenario.factorShocks !== 'object') {
      throw new StrategyError(400, 'INVALID_SCENARIOS', `factorShocks missing on ${scenario.scenarioId}.`);
    }
  }
  probabilityWeights(company.scenarios);
  return company;
}

function validateQuote(value: unknown): MarketQuote {
  const quote = value as MarketQuote;
  if (!quote || typeof quote !== 'object' || !quote.quoteId || !quote.instrument?.instrumentId) {
    throw new StrategyError(400, 'INVALID_QUOTE', 'Each quote needs an id and an instrument.');
  }
  return quote;
}

export function validateGenerateRequest(body: unknown): GenerateStrategyRequest {
  const source = asRecord(body, 'Expected a strategy request.');
  const allowed = new Set(['company', 'marketSearch', 'mode']);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) throw new StrategyError(400, 'INVALID_REQUEST', `Unknown field ${key}.`);
  }
  const mode = source.mode;
  if (mode !== 'min_cvar' && mode !== 'min_cost' && mode !== 'balanced') {
    throw new StrategyError(400, 'INVALID_MODE', 'mode must be min_cvar, min_cost, or balanced.');
  }
  const company = validateCompany(source.company as CompanyProfile);
  const market = asRecord(source.marketSearch, 'marketSearch is required.');
  if (market.companyId !== company.companyId) {
    throw new StrategyError(409, 'COMPANY_MISMATCH', 'marketSearch.companyId must match company.companyId.');
  }
  if (!Array.isArray(market.quotes) || !Array.isArray(market.capacityOffers) || typeof market.retrievedAt !== 'string') {
    throw new StrategyError(400, 'INVALID_REQUEST', 'marketSearch is missing quotes, capacity offers, or retrievedAt.');
  }
  return {
    company,
    marketSearch: {
      companyId: requireString(market, 'companyId'),
      quotes: market.quotes.map((quote) => validateQuote(quote)),
      capacityOffers: market.capacityOffers as CapacityOffer[],
      retrievedAt: requireString(market, 'retrievedAt'),
      warnings: Array.isArray(market.warnings) ? market.warnings.map(String) : [],
    },
    mode,
  };
}

function basisText(quote: MarketQuote, comparison: 'direct' | 'proxy', fraction: Decimal): string {
  const venueNote = quote.basisRiskDescription?.trim() || 'No venue basis note was supplied.';
  if (comparison === 'proxy') {
    return `${venueNote} Settlement mismatch: this quote is a proxy, not a direct hedge. ${money(fraction.times(100))}% of contractual payoff is basis shortfall and is removed from modeled payoff.`;
  }
  return `${venueNote} Comparison is direct on risk factor ${quote.instrument.riskFactor}. Basis shortfall fraction is 0.`;
}

function preselect(prepared: PreparedCandidate[], problemWithoutMode: Omit<SearchProblem, 'mode' | 'candidates'> & { candidates: SearchCandidate[] }, budget: Decimal): PreparedCandidate[] {
  if (prepared.length <= MAX_SEARCH_CANDIDATES) return prepared;
  const ranked = prepared.map((candidate) => {
    let best = new Decimal('1e30');
    for (const quantity of candidate.quantities) {
      if (quantity === 0) continue;
      const solo = evaluate(
        { ...problemWithoutMode, mode: 'min_cvar', candidates: [candidate] },
        [quantity],
      );
      if (solo.cost.lte(budget) && solo.publishedCvar.lt(best)) best = solo.publishedCvar;
    }
    return { candidate, best };
  });
  ranked.sort((left, right) => {
    const byScore = left.best.comparedTo(right.best) ?? 0;
    if (byScore !== 0) return byScore;
    return left.candidate.quote.quoteId.localeCompare(right.candidate.quote.quoteId);
  });
  return ranked.slice(0, MAX_SEARCH_CANDIDATES).map((row) => row.candidate).sort((left, right) => left.quote.quoteId.localeCompare(right.quote.quoteId));
}

export function generatePlan(request: GenerateStrategyRequest, now: Date, solver: LotSolver = gridLotSolver): HedgePlan {
  const company = validateCompany(request.company);
  if (request.marketSearch.companyId !== company.companyId) {
    throw new StrategyError(409, 'COMPANY_MISMATCH', 'marketSearch.companyId must match company.companyId.');
  }
  const alpha = dec(company.cvarAlpha);
  const budget = dec(company.monthlyHedgeBudgetUsd);
  const probabilities = probabilityWeights(company.scenarios);
  const baselineLoss = company.scenarios.map((scenario) => dec(scenario.baselineLossUsd));
  const exclusions: Exclusion[] = [];
  const downgrades: string[] = [];
  const prepared: PreparedCandidate[] = [];

  const quotes = [...request.marketSearch.quotes].sort((left, right) => left.quoteId.localeCompare(right.quoteId));
  for (const quote of quotes) {
    const reason = exclusionReason(quote, company, now);
    if (reason) {
      exclusions.push({ quoteId: quote.quoteId, reason });
      continue;
    }
    const comparison = effectiveComparison(quote, company);
    if (quote.comparison === 'direct' && comparison === 'proxy') {
      downgrades.push(`Quote ${quote.quoteId} claimed a direct hedge, but ${quote.instrument.riskFactor} is not a company risk factor. Treated as proxy.`);
    }
    const fraction = comparison === 'proxy' ? PROXY_BASIS_SHORTFALL : new Decimal(0);
    const payoffPerUnit = company.scenarios.map((scenario) => grossPayoffPerUnit(quote, scenario).times(new Decimal(1).minus(fraction)));
    const unitCost = unitAllIn(quote);
    // All-in cost is the price of requestedQuantity, not a license to scale past that size.
    const quotedSize = dec(quote.requestedQuantity).floor();
    const affordable = Decimal.min(
      dec(quote.availableQuantity).floor(),
      quotedSize.gt(0) ? quotedSize : new Decimal(0),
      unitCost.gt(0) ? budget.div(unitCost).floor() : new Decimal(0),
      new Decimal(MAX_QTY_PER_LEG),
    );
    const maxQty = Math.max(0, affordable.toNumber());
    const quantities = lotsFor(maxQty);
    if (maxQty === 0) {
      exclusions.push({ quoteId: quote.quoteId, reason: 'no whole lot fits inside the budget and available quantity' });
      continue;
    }
    if (!payoffPerUnit.some((payoff) => payoff.gt(0))) {
      exclusions.push({ quoteId: quote.quoteId, reason: 'no scenario payoff on company risk factors' });
      continue;
    }
    prepared.push({
      id: quote.quoteId,
      quote,
      unitCost,
      quantities,
      payoffPerUnit,
      basisFraction: fraction,
      effectiveComparison: comparison,
    });
  }

  const kept = preselect(prepared, {
    budget,
    alpha,
    baselineLoss,
    probabilities,
    candidates: prepared,
  }, budget);
  const dropped = prepared.filter((candidate) => !kept.includes(candidate));
  const problem: SearchProblem = {
    mode: request.mode,
    budget,
    alpha,
    baselineLoss,
    probabilities,
    candidates: kept,
  };
  const quantities = kept.length === 0 ? [] : solver(problem);
  const selected = kept.flatMap((candidate, index) => {
    const quantity = quantities[index] ?? 0;
    return quantity > 0 ? [{ candidate, quantity }] : [];
  });

  const createdAt = normalizeIso(request.marketSearch.retrievedAt, 'retrievedAt');
  const totalCost = selected.reduce((sum, row) => sum.plus(dec(money(row.candidate.unitCost.times(row.quantity)))), new Decimal(0));
  const payoffByScenario = company.scenarios.map((scenario, scenarioIndex) => {
    const payoff = selected.reduce((sum, row) => sum.plus(row.candidate.payoffPerUnit[scenarioIndex]!.times(row.quantity)), new Decimal(0));
    return money(payoff);
  });
  const beforeLosses: WeightedLoss[] = baselineLoss.map((loss, index) => ({ loss, prob: probabilities[index]!, index }));
  const afterLosses: WeightedLoss[] = beforeLosses.map((row, index) => ({
    ...row,
    loss: row.loss.plus(totalCost).minus(dec(payoffByScenario[index] ?? '0')),
  }));
  const before = toMetrics(beforeLosses, alpha);
  const after = toMetrics(afterLosses, alpha);

  const legs: HedgeLeg[] = selected.map((row, index) => {
    const payoffByScenarioUsd: Record<string, string> = {};
    company.scenarios.forEach((scenario, scenarioIndex) => {
      payoffByScenarioUsd[scenario.scenarioId] = money(row.candidate.payoffPerUnit[scenarioIndex]!.times(row.quantity));
    });
    return {
      legId: `leg_${index + 1}_${row.candidate.quote.quoteId}`,
      kind: 'financial',
      quoteId: row.candidate.quote.quoteId,
      instrumentId: row.candidate.quote.instrument.instrumentId,
      venue: row.candidate.quote.venue,
      quantity: String(row.quantity),
      estimatedAllInCostUsd: money(row.candidate.unitCost.times(row.quantity)),
      maxAdditionalObligationUsd: '0',
      payoffByScenarioUsd,
      basisRisk: basisText(row.candidate.quote, row.candidate.effectiveComparison, row.candidate.basisFraction),
    };
  });

  const warnings: string[] = [REPORTING_WARNING];
  if (request.marketSearch.warnings.length > 0) {
    warnings.push(...request.marketSearch.warnings.map((warning) => `Market search: ${warning}`));
  }
  for (const exclusion of exclusions) warnings.push(`Excluded ${exclusion.quoteId}: ${exclusion.reason}.`);
  warnings.push(...downgrades);
  if (dropped.length > 0) {
    warnings.push(`Lot search kept ${MAX_SEARCH_CANDIDATES} of ${prepared.length} candidates by standalone CVaR. A MILP solver can replace gridLotSolver without changing the published metric convention.`);
  }
  const factors = repeatedShockFactors(company.scenarios);
  if (factors.length > 0) {
    warnings.push(`Correlated factor shocks across scenarios: ${factors.join(', ')}.`);
  }
  if (selected.length > 0) {
    const stressed = stressWorstScenario(afterLosses, alpha);
    warnings.push(`Stress: moving 0.02 probability onto the worst hedged scenario changes published CVaR from ${money(stressed.base)} to ${money(stressed.stressed)}.`);
  }
  const capacityNotes = request.marketSearch.capacityOffers.map((offer) => {
    const verified = offer.verifiedCapacity ? 'verified flag is true but this service does not monetize capacity without a payoff schedule' : 'unverified, so operational benefit is not counted as payoff';
    return `Capacity offer ${offer.offerId} (${offer.providerName}) excluded from legs: ${verified}.`;
  });
  warnings.push(...capacityNotes);
  if (selected.some((row) => row.candidate.effectiveComparison === 'proxy')) {
    warnings.push('At least one bought leg is a proxy. Settlement mismatch is in that leg basisRisk. Do not read the premium as elimination of the business loss.');
  }
  if (legs.length === 0) {
    warnings.push('No eligible hedge reduced published tail loss inside the budget.');
  }

  const syntheticDemo = selected.some((row) => quoteDemo(row.candidate.quote))
    || (selected.length === 0 && request.marketSearch.quotes.some((quote) => quoteDemo(quote)) && !request.marketSearch.quotes.some((quote) => quote.source === 'live' && quote.capability === 'live'))
    || request.marketSearch.capacityOffers.some((offer) => selected.length === 0 && offerDemo(offer) && request.marketSearch.quotes.length === 0);

  if (syntheticDemo) {
    warnings.push('Synthetic or sandbox market data is in this decision. This is not a live venue quote and not a guaranteed risk reduction.');
  }

  const feeNotes = selected.map((row) => `${row.candidate.quote.quoteId} fees ${scaledFeeNote(row.candidate.quote, row.quantity)} USD (already inside all-in premium, not added again)`);
  const bought = legs.length === 0
    ? NO_ACTION_RATIONALE
    : `Bought ${legs.map((leg) => `${leg.quantity} of ${leg.quoteId} on ${leg.venue as Venue}`).join('; ')}.`;
  const rationale = [
    `Mode ${request.mode}.`,
    'Selector residual = baseline loss − net hedge payoff. Premium is a budget constraint only.',
    'Published before/after uses baseline and baseline + estimatedTotalCostUsd − payoff.',
    `Lot grid ${LOT_GRID.join(',')} plus the budget-capped maximum, at most ${MAX_QTY_PER_LEG} units and ${MAX_SEARCH_CANDIDATES} candidates.`,
    bought,
    feeNotes.length > 0 ? feeNotes.join('. ') + '.' : 'No premium paid.',
  ].join(' ');

  const expiresAt = selected.length > 0
    ? selected.map((row) => normalizeIso(row.candidate.quote.expiresAt, row.candidate.quote.quoteId)).sort()[0]!
    : addHours(createdAt, 24);

  const planId = `plan_${sha256Hex(canonicalJson({
    companyId: company.companyId,
    mode: request.mode,
    budgetUsd: money(budget),
    createdAt,
    expiresAt,
    legs: legs.map((leg) => ({
      quoteId: leg.quoteId,
      quantity: leg.quantity,
      cost: leg.estimatedAllInCostUsd,
      payoffByScenarioUsd: leg.payoffByScenarioUsd,
    })),
    before,
    after,
  })).slice(0, 24)}`;

  const draft: HedgePlan = {
    planId,
    companyId: company.companyId,
    version: 1,
    status: 'QUOTED',
    createdAt,
    expiresAt,
    planHash: '',
    budgetUsd: money(budget),
    estimatedTotalCostUsd: money(totalCost),
    before,
    after,
    legs,
    rationale,
    warnings,
    syntheticDemo,
  };
  draft.planHash = planHash(draft);
  return draft;
}
