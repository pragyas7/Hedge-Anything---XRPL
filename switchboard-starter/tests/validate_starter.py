"""Validate shared API and seeded examples. Run at repo root: python tests/validate_starter.py."""
from __future__ import annotations
import json
from pathlib import Path
from decimal import Decimal
import yaml
import jsonschema

ROOT = Path(__file__).resolve().parents[1]
api = yaml.safe_load((ROOT/'contracts/openapi.yaml').read_text())
schemas = api['components']['schemas']
assert api['openapi'].startswith('3.1.')
checks = {
    'company-analysis.json':'CompanyAnalysisResponse',
    'market-search.json':'MarketSearchResponse',
    'hedge-plan.json':'HedgePlan',
    'approval.json':'Approval',
    'execution-run.json':'ExecutionRun',
    'failover-run.json':'FailoverRun',
    'retailer-analysis.json':'CompanyAnalysisResponse',
}
for filename, schema in checks.items():
    data = json.loads((ROOT/'fixtures'/filename).read_text())
    jsonschema.validate(data, {'$ref':f'#/components/schemas/{schema}', 'components':api['components']},format_checker=jsonschema.FormatChecker())
    print(f'PASS schema {filename} → {schema}')

co=json.loads((ROOT/'fixtures/company-analysis.json').read_text())['company']
market=json.loads((ROOT/'fixtures/market-search.json').read_text())
plan=json.loads((ROOT/'fixtures/hedge-plan.json').read_text())
app=json.loads((ROOT/'fixtures/approval.json').read_text())
run=json.loads((ROOT/'fixtures/execution-run.json').read_text())
assert co['companyId']==plan['companyId']==market['companyId']
assert plan['planId']==app['request']['planId']==run['planId']
assert app['request']['planHash']==plan['planHash']
assert run['approvalId']==app['approvalId']
assert set(leg['quoteId'] for leg in plan['legs'] if leg.get('quoteId')).issubset(set(q['quoteId'] for q in market['quotes']))
assert set(leg['capacityOfferId'] for leg in plan['legs'] if leg.get('capacityOfferId')).issubset(set(o['offerId'] for o in market['capacityOffers']))
assert sum(Decimal(leg['estimatedAllInCostUsd']) for leg in plan['legs'])==Decimal(plan['estimatedTotalCostUsd'])
assert Decimal(plan['estimatedTotalCostUsd'])<=Decimal(plan['budgetUsd'])
assert sum(Decimal(str(s['probability'])) for s in co['scenarios'])==Decimal('1.00')

def cvar(losses, confidence=Decimal('.95')):
    """Weighted extreme upper tail; losses is (loss, probability)."""
    remaining=Decimal(1)-confidence
    accum=Decimal(0)
    for loss, prob in sorted(losses, key=lambda x:x[0], reverse=True):
        take=min(prob,remaining)
        accum+=loss*take
        remaining-=take
        if remaining == 0:break
    assert remaining==0
    return accum/(Decimal(1)-confidence)

def percentile(losses, alpha=Decimal('.95')):
    cumulative=Decimal(0)
    for loss,prob in sorted(losses, key=lambda x:x[0]):
        cumulative+=prob
        if cumulative>=alpha:return loss
    raise AssertionError('missing percentile')

def risk_metrics(with_hedges):
    outcome=[]
    for s in co['scenarios']:
        loss=Decimal(s['baselineLossUsd'])
        if with_hedges:
            # Fixture payoff models; capacity leg deliberately has zero monetized unverified benefits.
            loss+=Decimal(plan['estimatedTotalCostUsd'])
            for leg in plan['legs']:
                loss-=Decimal(leg['payoffByScenarioUsd'].get(s['scenarioId'],'0'))
        outcome.append((loss,Decimal(str(s['probability']))))
    result={
      'expectedLossUsd':str(sum(loss*p for loss,p in outcome)),
      'p95LossUsd':str(percentile(outcome)),
      'cvar95LossUsd':str(cvar(outcome)),
      'worstScenarioLossUsd':str(max(loss for loss,_ in outcome))
    }
    return {k:Decimal(v) for k,v in result.items()}
for actual,expected in [(risk_metrics(False),plan['before']),(risk_metrics(True),plan['after'])]:
    assert all(actual[k]==Decimal(expected[k]) for k in expected), (actual,expected)
assert Decimal(plan['after']['cvar95LossUsd'])<Decimal(plan['before']['cvar95LossUsd'])
assert all(q['source']!='live' for q in market['quotes'])
assert all(not r['confirmed'] for r in run['receipts'])
assert app['status']=='PENDING'
print('PASS cross-service foreign keys, budget, scenario CVaR calculation, synthetic provenance and approval safety')
print(f'PASS {len(api["paths"])} API routes, {len(schemas)} schema components')
