import { createHash } from 'node:crypto';
import type {
  CompanyAnalysisResponse,
  CompanyAnalyzeRequest,
  CompanyProfile,
  RiskExposure,
  Scenario,
} from '@switchboard/contracts';
import { StrategyError } from './errors.js';
import { isMoneyString } from './money.js';

export type TemplateId = 'ai_demo' | 'retail_demo' | 'digital' | 'climate' | 'supply_chain' | 'thin' | 'freeform';

const THIN_WARNING = [
  'Description is too thin to estimate a loss distribution.',
  'Missing data: business model and revenue driver, critical dependencies or suppliers, loss magnitude or a historical shock, time horizon, and where the loss is booked.',
  'Placeholder scenarios are not a risk measurement. Do not treat the confidence score as evidence.',
];

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StrategyError(400, 'INVALID_REQUEST', 'Expected a JSON object.');
  }
  return value as Record<string, unknown>;
}

function requireMoneyField(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (!isMoneyString(value)) {
    throw new StrategyError(400, 'INVALID_MONEY', `${field} must be a decimal string.`);
  }
  return value;
}

export function validateAnalyzeRequest(body: unknown): CompanyAnalyzeRequest {
  const source = asRecord(body);
  const allowed = new Set(['description', 'jurisdiction', 'monthlyHedgeBudgetUsd', 'maxTolerableTailLossUsd']);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) {
      throw new StrategyError(400, 'INVALID_REQUEST', `Unknown field ${key}.`);
    }
  }
  if (typeof source.description !== 'string' || source.description.trim().length === 0) {
    throw new StrategyError(400, 'INVALID_REQUEST', 'description is required.');
  }
  if (typeof source.jurisdiction !== 'string' || source.jurisdiction.trim().length === 0) {
    throw new StrategyError(400, 'INVALID_REQUEST', 'jurisdiction is required.');
  }
  const monthlyHedgeBudgetUsd = requireMoneyField(source, 'monthlyHedgeBudgetUsd');
  const maxTolerableTailLossUsd = requireMoneyField(source, 'maxTolerableTailLossUsd');
  if (monthlyHedgeBudgetUsd.startsWith('-') || maxTolerableTailLossUsd.startsWith('-')) {
    throw new StrategyError(400, 'INFEASIBLE_BUDGET', 'Budget and max tolerable tail loss must be non-negative.');
  }
  return {
    description: source.description.trim(),
    jurisdiction: source.jurisdiction.trim(),
    monthlyHedgeBudgetUsd,
    maxTolerableTailLossUsd,
  };
}

function wordCount(description: string): number {
  return description.trim().split(/\s+/).filter(Boolean).length;
}

export function isThinDescription(description: string): boolean {
  return description.trim().length < 40 || wordCount(description) < 6;
}

function countHits(text: string, phrases: string[]): number {
  return phrases.reduce((total, phrase) => total + (text.includes(phrase) ? 1 : 0), 0);
}

export function classifyDescription(description: string): TemplateId {
  const text = description.toLowerCase();
  if (isThinDescription(description)) return 'thin';
  if (
    text.includes('demo support ai')
    || text.includes('fictional ai customer-support')
    || (text.includes('customer-support') && text.includes('primary model api'))
  ) {
    return 'ai_demo';
  }
  if (
    text.includes('demo coastal retailer')
    || text.includes('storm-related delivery')
    || text.includes('fictional retail operator')
  ) {
    return 'retail_demo';
  }
  const digital = countHits(text, ['inference', 'llm', 'gpu', 'uptime', 'outage', 'model api', 'cloud', 'openai', 'anthropic', 'token']);
  const climate = countHits(text, ['retail', 'store', 'weather', 'storm', 'hurricane', 'climate', 'rainfall', 'snow', 'flood', 'temperature']);
  const supply = countHits(text, ['shipping', 'freight', 'port', 'container', 'supply chain', 'importer', 'logistics', 'vessel', 'customs']);
  const best = Math.max(digital, climate, supply);
  if (best === 0) return 'freeform';
  if (supply === best && supply >= climate && supply >= digital) return 'supply_chain';
  if (climate === best && climate >= digital) return 'climate';
  return 'digital';
}

function stableId(prefix: string, material: string): string {
  const hex = createHash('sha256').update(material).digest('hex').slice(0, 16);
  return `${prefix}_${hex}`;
}

function titleFrom(description: string, fallback: string): string {
  const cleaned = description.replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= 80) return cleaned;
  return `${cleaned.slice(0, 77).trimEnd()}...`;
}

function provenance(template: TemplateId, confirmed: boolean): string {
  return `Provenance: template=${template}; evidence=synthetic_template; generator=switchboard-strategy; confirmedByUser=${confirmed}.`;
}

function shell(request: CompanyAnalyzeRequest, companyId: string, name: string, exposures: RiskExposure[], scenarios: Scenario[]): CompanyProfile {
  return {
    companyId,
    name,
    description: request.description,
    jurisdiction: request.jurisdiction,
    baseCurrency: 'USD',
    monthlyHedgeBudgetUsd: request.monthlyHedgeBudgetUsd,
    maxTolerableTailLossUsd: request.maxTolerableTailLossUsd,
    cvarAlpha: 0.95,
    exposures,
    scenarios,
    confirmedByUser: false,
  };
}

function aiDemo(request: CompanyAnalyzeRequest): CompanyAnalysisResponse {
  const scenarios: Scenario[] = [
    { scenarioId: 'normal', label: 'Normal operations', probability: 0.85, baselineLossUsd: '0', factorShocks: { primary_outage: 0, fallback_spread: 0 }, source: 'synthetic' },
    { scenarioId: 'price_spike', label: 'Price spike without outage', probability: 0.1, baselineLossUsd: '2500', factorShocks: { primary_outage: 0, fallback_spread: 1 }, source: 'synthetic' },
    { scenarioId: 'primary_down', label: 'Primary outage; fallback available', probability: 0.04, baselineLossUsd: '5000', factorShocks: { primary_outage: 1, fallback_spread: 1 }, source: 'synthetic' },
    { scenarioId: 'correlated_down', label: 'Correlated provider outage', probability: 0.01, baselineLossUsd: '25000', factorShocks: { primary_outage: 1, fallback_spread: 2 }, source: 'synthetic' },
  ];
  const exposures: RiskExposure[] = [{
    exposureId: 'exp_inference',
    category: 'digital',
    label: 'Inference provider outage and replacement-cost spread',
    description: 'Loss of traffic and higher fallback inference expenses',
    riskFactors: ['primary_outage', 'fallback_spread'],
    horizonDays: 30,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: 0.6,
  }];
  return {
    company: shell(request, 'co_demo_ai', 'Demo Support AI (fictional)', exposures, scenarios),
    assumptions: [
      provenance('ai_demo', false),
      'All company data are fictional. Loss scenarios are synthetic and user-editable.',
      'Primary and fallback models must pass task-specific equivalence checks.',
    ],
    warnings: [
      'Current amounts are not actuarially calibrated or derived from live market prices.',
      'confirmedByUser is false until this desk submits the profile on strategy generate.',
    ],
  };
}

function retailDemo(request: CompanyAnalyzeRequest): CompanyAnalysisResponse {
  const scenarios: Scenario[] = [
    { scenarioId: 'storm_normal', label: 'No significant storm', probability: 0.85, baselineLossUsd: '0', factorShocks: { storm_severity: 0, shipping_delay: 0 }, source: 'synthetic' },
    { scenarioId: 'storm_delay', label: 'Minor storm logistics delay', probability: 0.1, baselineLossUsd: '8000', factorShocks: { storm_severity: 1, shipping_delay: 1 }, source: 'synthetic' },
    { scenarioId: 'storm_severe', label: 'Severe storm warehouse outage', probability: 0.05, baselineLossUsd: '40000', factorShocks: { storm_severity: 3, shipping_delay: 3 }, source: 'synthetic' },
  ];
  const exposures: RiskExposure[] = [{
    exposureId: 'exp_storm',
    category: 'climate',
    label: 'Coastal storm logistics interruption',
    description: 'Lost retail sales and late delivery if warehouse/logistics shuts down',
    riskFactors: ['storm_severity', 'shipping_delay'],
    horizonDays: 60,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: 0.5,
  }];
  return {
    company: shell(request, 'co_retail_demo', 'Demo Coastal Retailer (fictional)', exposures, scenarios),
    assumptions: [
      provenance('retail_demo', false),
      'Illustrative retailer; scenario losses and frequencies require user validation.',
    ],
    warnings: [
      'Current amounts are not actuarially calibrated or derived from live market prices.',
      'confirmedByUser is false until this desk submits the profile on strategy generate.',
    ],
  };
}

function digitalTemplate(request: CompanyAnalyzeRequest): CompanyAnalysisResponse {
  const companyId = stableId('co', `${request.jurisdiction}|${request.description.toLowerCase()}`);
  const scenarios: Scenario[] = [
    { scenarioId: 'normal', label: 'Normal API operations', probability: 0.84, baselineLossUsd: '0', factorShocks: { primary_outage: 0, fallback_spread: 0 }, source: 'synthetic' },
    { scenarioId: 'price_spike', label: 'Token or API price spike', probability: 0.1, baselineLossUsd: '1800', factorShocks: { primary_outage: 0, fallback_spread: 1 }, source: 'synthetic' },
    { scenarioId: 'primary_down', label: 'Primary provider outage', probability: 0.05, baselineLossUsd: '7000', factorShocks: { primary_outage: 1, fallback_spread: 1 }, source: 'synthetic' },
    { scenarioId: 'correlated_down', label: 'Correlated provider failure', probability: 0.01, baselineLossUsd: '22000', factorShocks: { primary_outage: 1, fallback_spread: 2 }, source: 'synthetic' },
  ];
  const exposures: RiskExposure[] = [{
    exposureId: `exp_inference_${companyId.slice(-8)}`,
    category: 'digital',
    label: 'API or inference dependency',
    description: 'Unhedged loss if the primary digital dependency fails or reprices.',
    riskFactors: ['primary_outage', 'fallback_spread'],
    horizonDays: 30,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: 0.48,
  }];
  return {
    company: shell(request, companyId, titleFrom(request.description, 'Digital dependency'), exposures, scenarios),
    assumptions: [
      provenance('digital', false),
      'Loss levels are a digital-inference template, not the company ledger.',
    ],
    warnings: [
      'Template scenarios only. Replace losses with the operator\'s figures before approval.',
      'confirmedByUser is false.',
    ],
  };
}

function climateTemplate(request: CompanyAnalyzeRequest): CompanyAnalysisResponse {
  const companyId = stableId('co', `${request.jurisdiction}|${request.description.toLowerCase()}`);
  const scenarios: Scenario[] = [
    { scenarioId: 'weather_normal', label: 'No material weather shock', probability: 0.8, baselineLossUsd: '0', factorShocks: { storm_severity: 0, footfall: 0 }, source: 'synthetic' },
    { scenarioId: 'weather_disruption', label: 'Weather disruption', probability: 0.15, baselineLossUsd: '5000', factorShocks: { storm_severity: 1, footfall: 1 }, source: 'synthetic' },
    { scenarioId: 'weather_severe', label: 'Severe local weather closure', probability: 0.05, baselineLossUsd: '30000', factorShocks: { storm_severity: 3, footfall: 2 }, source: 'synthetic' },
  ];
  const exposures: RiskExposure[] = [{
    exposureId: `exp_climate_${companyId.slice(-8)}`,
    category: 'climate',
    label: 'Weather-sensitive revenue or logistics',
    description: 'Sales, spoilage, or site closure if local weather is severe.',
    riskFactors: ['storm_severity', 'footfall'],
    horizonDays: 60,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: 0.44,
  }];
  return {
    company: shell(request, companyId, titleFrom(request.description, 'Weather-sensitive business'), exposures, scenarios),
    assumptions: [
      provenance('climate', false),
      'Weather losses are a retail/climate template. They are not a forecast or an insurance quote.',
    ],
    warnings: [
      'No station history was supplied. Confidence stays moderate.',
      'confirmedByUser is false.',
    ],
  };
}

function supplyTemplate(request: CompanyAnalyzeRequest): CompanyAnalysisResponse {
  const companyId = stableId('co', `${request.jurisdiction}|${request.description.toLowerCase()}`);
  const scenarios: Scenario[] = [
    { scenarioId: 'ship_normal', label: 'Schedule holds', probability: 0.8, baselineLossUsd: '0', factorShocks: { port_delay: 0, freight_rate: 0 }, source: 'synthetic' },
    { scenarioId: 'ship_delay', label: 'Multi-day port delay', probability: 0.15, baselineLossUsd: '6000', factorShocks: { port_delay: 1, freight_rate: 1 }, source: 'synthetic' },
    { scenarioId: 'ship_closed', label: 'Lane closure or rolled bookings', probability: 0.05, baselineLossUsd: '28000', factorShocks: { port_delay: 3, freight_rate: 2 }, source: 'synthetic' },
  ];
  const exposures: RiskExposure[] = [{
    exposureId: `exp_shipping_${companyId.slice(-8)}`,
    category: 'supply_chain',
    label: 'Inbound freight delay',
    description: 'Stockout and expedite cost if a lane, port, or booking rolls.',
    riskFactors: ['port_delay', 'freight_rate'],
    horizonDays: 45,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: 0.42,
  }];
  return {
    company: shell(request, companyId, titleFrom(request.description, 'Shipping exposure'), exposures, scenarios),
    assumptions: [
      provenance('supply_chain', false),
      'Delay losses are a shipping template, not a carrier schedule or bill of lading.',
    ],
    warnings: [
      'No lane, Incoterm, or inventory figure was supplied.',
      'confirmedByUser is false.',
    ],
  };
}

function freeform(request: CompanyAnalyzeRequest, template: 'thin' | 'freeform'): CompanyAnalysisResponse {
  const companyId = stableId('co', `${template}|${request.jurisdiction}|${request.description.toLowerCase()}`);
  const thin = template === 'thin';
  const scenarios: Scenario[] = [
    { scenarioId: 'base', label: thin ? 'Placeholder base case' : 'Base case', probability: 0.8, baselineLossUsd: '0', factorShocks: { demand_shock: 0, cost_shock: 0 }, source: 'synthetic' },
    { scenarioId: 'moderate', label: thin ? 'Placeholder moderate shock' : 'Moderate shock', probability: 0.15, baselineLossUsd: thin ? '1000' : '4000', factorShocks: { demand_shock: 1, cost_shock: 0 }, source: 'synthetic' },
    { scenarioId: 'severe', label: thin ? 'Placeholder severe shock' : 'Severe shock', probability: 0.05, baselineLossUsd: thin ? '5000' : '20000', factorShocks: { demand_shock: 1, cost_shock: 2 }, source: 'synthetic' },
  ];
  const exposures: RiskExposure[] = [{
    exposureId: `exp_general_${companyId.slice(-8)}`,
    category: 'other',
    label: thin ? 'Unclassified exposure' : 'General operating exposure',
    description: thin
      ? 'Not enough description to name a real exposure. Edit this before using it.'
      : 'Free-form operating loss. Map it to a concrete risk factor before hedging.',
    riskFactors: ['demand_shock', 'cost_shock'],
    horizonDays: 30,
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    confidence: thin ? 0.12 : 0.28,
  }];
  return {
    company: shell(request, companyId, thin ? 'Unclassified company' : titleFrom(request.description, 'Unclassified company'), exposures, scenarios),
    assumptions: [
      provenance(template, false),
      thin
        ? 'These numbers are placeholders so the form is editable. They are not an estimate.'
        : 'No industry template matched. Scenarios are a generic three-point sketch.',
    ],
    warnings: thin
      ? THIN_WARNING
      : [
        'Free-form fallback. Confidence is low until the operator replaces the scenarios.',
        'Missing data: a named dependency, a unit of loss, and evidence for the shock probabilities.',
        'confirmedByUser is false.',
      ],
  };
}

export function analyzeCompany(request: CompanyAnalyzeRequest): CompanyAnalysisResponse {
  switch (classifyDescription(request.description)) {
    case 'ai_demo':
      return aiDemo(request);
    case 'retail_demo':
      return retailDemo(request);
    case 'digital':
      return digitalTemplate(request);
    case 'climate':
      return climateTemplate(request);
    case 'supply_chain':
      return supplyTemplate(request);
    case 'thin':
      return freeform(request, 'thin');
    default:
      return freeform(request, 'freeform');
  }
}
