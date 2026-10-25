# @switchboard/strategy

Company profiling and a deterministic scenario CVaR hedge selector. Port **4101**.

This service does not place orders, sign transactions, or call Kalshi, Polymarket, Ledger, or Mastercard AP4M. Quotes arrive from the caller (Agent B or a fixture).

## Auth

`Authorization: Bearer <token>` must equal `SWITCHBOARD_DEV_BEARER`.

The default, `switchboard-dev-platform-token`, is a **local dev token** checked into `.env.example`. It is not production authentication. `GET /healthz` is open.

## Run

From `switchboard-starter`:

```bash
pnpm install
pnpm --filter @switchboard/strategy dev
```

Production-style start (tsx, no separate build):

```bash
pnpm --filter @switchboard/strategy start
```

```bash
pnpm --filter @switchboard/strategy test
pnpm --filter @switchboard/strategy typecheck
```

Copy `.env.example` to `.env` if you want a different port or token. Persistence is in memory. `DATABASE_URL` is unused; tests do not need Docker.

Every POST requires `Idempotency-Key`. The same key and same JSON body returns the original response. The same key with a different body returns **409**. `X-Request-ID` is echoed or generated. `X-Correlation-ID` is accepted and copied onto errors.

## Endpoints

- `GET /healthz`
- `POST /v1/companies/analyze`
- `GET /v1/companies/{companyId}`
- `POST /v1/strategies/generate`
- `GET /v1/strategies/{planId}`

`POST /v1/companies/analyze` always stores `confirmedByUser: false`. A later `POST /v1/strategies/generate` whose company has `confirmedByUser: true` replaces the stored profile. There is no separate confirm field on the analyze schema.

Descriptions that match the AI inference demo or the coastal-retailer demo return those fixture shapes (ids included). Other text uses a digital, climate, supply-chain, or free-form template. A short description comes back with low confidence and a missing-data warning instead of a precise loss estimate.

## Optimizer

`gridLotSolver` enumerates a small integer grid. Replace that function with a MILP solver that returns the same quantity vector; `generatePlan` still prices the result.

Grid limits:

- Lots per leg: `0, 1, 2, 5, 10, 20, 25, 50`, plus the largest whole quantity that fits budget, depth, and the cap.
- Cap: **100** units on a leg.
- At most **5** candidates in the cartesian product. Extras are dropped after a one-leg CVaR screen.
- One integer quantity per quote. Buyer premium only (`maxAdditionalObligationUsd` is `0`).

A quote is dropped when it is expired, `read_only` or `unsupported`, `not_comparable`, jurisdiction-blocked, or `polymarket_international` for a US company. A weather or climate contract is never bought against a digital uptime exposure, even if the quote says `direct`. A `direct` quote whose risk factor is not on the company is treated as `proxy`.

Proxy legs keep 75% of contractual payoff. The other 25% is basis shortfall and is removed from `payoffByScenarioUsd`. The leg `basisRisk` says so. Direct legs use the full contractual unit payoff when the scenario shock on `instrument.riskFactor` is positive (`binary`: `min(payoutPerUnit, maximumPayout)`; `capped_call`: that amount times the shock, still capped).

Unverified capacity offers are not given a made-up payoff and are not bought.

### Cost convention (do not double count)

- **Selector residual** for scenario `s`: `baselineLoss_s − Σ net payoff_s`. Premium is **not** inside this residual. It is only the budget constraint `Σ all-in premium ≤ monthlyHedgeBudgetUsd`. Fees and modeled slippage already sit inside `estimatedAllInBuyCostUsd` and are not added again.
- **Published `before` / `after`**: the seeded fixture convention from `tests/validate_starter.py`. Unhedged loss is baseline. Hedged loss is `baseline + estimatedTotalCostUsd − Σ payoff`. Premium is inside the reported loss **once**, which is why `after` can be compared with that script. It is not added a second time on top of the selector residual.
- `min_cvar` minimizes selector residual CVaR among plans whose **published** CVaR is strictly better than no hedge, then lower published CVaR, then lower premium.
- `min_cost` is the cheapest of those improving plans.
- `balanced` keeps plans that capture at least half of the best published CVaR reduction, then picks the cheapest.
- If none improve published tail loss inside the budget, the plan has **no legs** and the rationale starts with `NO_ACTION`.
- A negative budget is **400** `INFEASIBLE_BUDGET`, not a fake hedge. A non-positive budget that simply cannot buy a lot is `NO_ACTION`.

`syntheticDemo` is true when a chosen quote is `synthetic` or `sandbox`, or its capability is `sandbox`. A no-trade plan is also marked when every quote in the search is non-live demo data.

`planHash` is `sha256:` plus the hex SHA-256 of the RFC 8785 canonical JSON of `planId`, `companyId`, `version`, `createdAt`, `expiresAt`, `budgetUsd`, `estimatedTotalCostUsd`, `before`, `after`, `legs`, `rationale`, `warnings`, `syntheticDemo`. `status` and `planHash` are not hashed. The same request body yields the same hash (`createdAt` is the market `retrievedAt`).
