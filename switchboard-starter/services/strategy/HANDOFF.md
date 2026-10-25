# Agent A handoff

## Owned directories changed

- `switchboard-starter/services/strategy/**`
- `switchboard-starter/apps/web/**`

No frozen files were edited (`contracts/openapi.yaml`, `packages/contracts/**`, `fixtures/**`, docs, markets, execution, infra).

## Run commands

From `switchboard-starter`:

```bash
pnpm install
pnpm --filter @switchboard/strategy test
pnpm --filter @switchboard/strategy typecheck
pnpm --filter @switchboard/strategy dev
pnpm --filter @switchboard/web test
pnpm --filter @switchboard/web typecheck
pnpm --filter @switchboard/web dev
python3 -m venv .venv && .venv/bin/pip install -r tests/requirements-dev.txt
.venv/bin/python tests/validate_starter.py
```

Strategy listens on `PORT` (default 4101). Web listens on 3000. Auth token is `SWITCHBOARD_DEV_BEARER`, default `switchboard-dev-platform-token`. That value is a local dev token only.

`tsx` runs the strategy service (`dev` and `start`). There is no separate compile step. Persistence is in memory. `DATABASE_URL` is documented and unused.

## API endpoints implemented

Strategy service:

- `GET /healthz` → `{status, service: "strategy", version}` with no auth
- `POST /v1/companies/analyze`
- `GET /v1/companies/{companyId}`
- `POST /v1/strategies/generate`
- `GET /v1/strategies/{planId}`

POST requires `Authorization: Bearer` and `Idempotency-Key`. Missing or wrong bearer is **401**. Missing idempotency key is **400**. Same key and same body replays the stored response. Same key and different body is **409**. `X-Request-ID` is echoed or generated. `X-Correlation-ID` is accepted.

Web routes: `/`, `/onboard`, `/risk`, `/strategies`, `/markets`, `/exchange`, `/operations`, `/activity`.

Browser calls only Next route handlers. Those handlers attach the dev bearer and an idempotency key on upstream POSTs. The browser does not receive venue keys, AP4M keys, or an execution private key.

## Optimizer notes

Lot search is `gridLotSolver` (replaceable by a MILP solver with the same quantity-vector result). Grid: `0, 1, 2, 5, 10, 20, 25, 50`, plus the largest whole lot inside budget, depth, and a cap of 100. At most 5 candidates are enumerated.

Selector residual is `baseline − net payoff`. Premium is only a budget constraint. Published `before` / `after` follow `tests/validate_starter.py`: hedged loss = baseline + `estimatedTotalCostUsd` − payoff. Premium is inside that published loss once, not also inside the selector residual.

Proxy quotes drop 25% of contractual payoff as basis shortfall and say so in `basisRisk`. A weather or climate contract is not bought against a digital uptime book, even if the quote says `direct`. `polymarket_international` is never a bought leg for a US jurisdiction. Expired, `read_only`, `unsupported`, and `not_comparable` quotes are excluded. Unverified capacity offers are not given a made-up payoff.

`min_cvar`, `min_cost`, and `balanced` all stay inside budget. No improving eligible quote yields an empty-leg plan whose rationale starts with `NO_ACTION`. A negative budget is **400** `INFEASIBLE_BUDGET`.

`planHash` is `sha256:` plus lowercase hex SHA-256 of RFC 8785 canonical JSON of `planId`, `companyId`, `version`, `createdAt`, `expiresAt`, `budgetUsd`, `estimatedTotalCostUsd`, `before`, `after`, `legs`, `rationale`, `warnings`, `syntheticDemo`. `status` and `planHash` are excluded. The fixture placeholder digest is not reused.

Analyze always stores `confirmedByUser: false`. The OpenAPI analyze body has no confirm field. A later generate whose company has `confirmedByUser: true` overwrites the stored profile. The web desk keeps the confirmed copy and sends it on generate.

## External capabilities actually verified

None of the following were called or proven: live Kalshi, live Polymarket US or International, Ledger, Mastercard AP4M, XRPL EVM, RLUSD settlement, or a real order book.

Markets and execution are reached only if those processes are already running. If markets is down, the web shows checked-in fixture quotes labeled fixture/sandbox. If execution is down, approval stays an error and is not marked approved. Operations shows the fixture monitor and labels receipts mock vs confirmed. The checked-in execution fixture is `PENDING` / unconfirmed and is not treated as success.

## Fixture tests passed

- `tests/validate_starter.py`: pass (schema checks, cross-ids, budget, seeded CVaR).
- `@switchboard/strategy` vitest: 15 passed. Includes fixture CVaR and percentile equality, published CVaR improvement on the seeded company plus market quotes, NO_ACTION for expired-only quotes, expired quote exclusion, negative budget, US block of `polymarket_international`, proxy settlement-mismatch text, weather-vs-digital refusal, stable `planHash`, idempotency replay and conflict, auth rejection.
- `@switchboard/strategy` typecheck: pass.
- `@switchboard/web` vitest: 4 passed. Proxy sends bearer plus idempotency key. Approval UI stays unapproved without an execution `APPROVED` body. Markets fallback is labeled fixture.
- `@switchboard/web` typecheck: pass.

No browser end-to-end runner was used.

## Known blockers

- OpenAPI does not document **401**, but missing or wrong bearer returns 401 as required by the agent brief.
- There is no analyze field or PATCH to confirm a profile. Confirmation is stored when generate receives `confirmedByUser: true`.
- Capacity offers have no scenario payoff schedule, so they are not bought. A MILP solver is not wired in; only the `LotSolver` boundary.
- The 25% proxy shortfall means a newly generated plan will not reproduce the fixture plan's exact `after` dollar amounts. The fixture plan still counts full contractual payoff. The unit test checks that fixture math separately, then checks that a generated min-CVaR plan has lower published CVaR than no hedge under the same loss-plus-cost-minus-payoff formula.
- `DATABASE_URL` is not implemented.
- Agent B and Agent C are not in this worktree, so a live three-service approval was not executed.

## Concrete artifacts

- No chain addresses, transaction hashes, or venue fills.
- Plan ids and hashes are deterministic SHA-256 digests of the canonical plan body, not the fixture placeholder `sha256:demo_only_untrusted_digest_replace_in_production`.
- Local dev bearer default: `switchboard-dev-platform-token`.
