import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CompanyAnalysisResponse, HedgePlan, MarketSearchResponse } from '@switchboard/contracts';

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures');

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8')) as T;
}

export function loadCompanyAnalysis(): CompanyAnalysisResponse {
  return readJson('company-analysis.json');
}

export function loadRetailAnalysis(): CompanyAnalysisResponse {
  return readJson('retailer-analysis.json');
}

export function loadMarketSearch(): MarketSearchResponse {
  return readJson('market-search.json');
}

export function loadHedgePlan(): HedgePlan {
  return readJson('hedge-plan.json');
}

export const AS_OF = new Date('2026-10-24T22:00:00.000Z');
