# AGENT A — Company Risk Brain, Portfolio Optimizer, v0 UI Integration

## Your mission
Build the user-facing risk-management application and the strategy engine that converts any business into typed exposures, discovers candidate hedges from Agent B, and recommends a coherent budget-constrained tail-risk-minimizing portfolio. Integrate a separately generated **v0 UI export** when provided. Do not write an exchange or transaction signing code.

## Read first
`README.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/INTEGRATION_HANDSHAKE.md`, `contracts/openapi.yaml`, `fixtures/company-analysis.json`, `fixtures/hedge-plan.json`, `docs/V0_UI_HANDOFF.md`.

## Exclusive writable directories
`apps/web/**`, `services/strategy/**`. Do not change `packages/contracts`, OpenAPI or fixtures unilaterally; request coordinator patch if schema change is necessary. Use `ports: 3000, 4101`.

## API you own
- `POST /v1/companies/analyze`: parse natural language to **editable** company/risk factors. Implement template engines for digital, climate, supply-chain; generalized free-form factors. Assumptions require user confirmation and provenance.
- `POST /v1/strategies/generate`: ingest a structured company profile + list of Agent B candidate instruments/capacity offers; generate weighted scenarios and optimized hedge plan with per-leg quantities, all-in costs, residual downside, warnings and immutable hash.
- `GET /healthz`.

## Optimization specification
Implement a deterministic scenario CVaR95 optimizer with premium and capital constraints and size/depth limits. No-action competitor is mandatory. For scenario s: residual = baseline business loss - valid candidate payout + shortfall + effective cost; mathematically ensure no double counted premium. Report EV loss, p95, CVaR95 and worst case before/after, plus fees, basis risk and sensitivity. Start with deterministic exhaustive search on small discrete lot grids (document limits); add solver interface for MILP / stochastic optimization. Exclude market candidates that are unavailable, non-US executable or quote expired. Distinguish direct hedge from proxy.

## UI workload (v0 handoff)
- Begin with routing/typed API client and mock fixture integration even before v0 arrives.
- Once the user supplies the v0 export, **preserve v0 layout/components** in `apps/web/`; hook pages to stable B and C endpoints via server-side API gateway. Do not overwrite v0 styling with an autonomous redesign.
- Expose /onboard, /risk, /strategies, /markets, /exchange, /operations, /activity. Use v0 brief in `docs/V0_UI_HANDOFF.md`.
- Display all scenarios, estimates, provenance, stale quotes, side-specific fees, normalized payout and risk warnings. Mark sandbox and synthetic data.
- Approval CTA calls C. It must not turn green until C confirms valid scope; prompt Ledger/device when C returns required action.

## Engineering outcomes
- Mock fixture demo for **two unrelated businesses** using identical schema.
- One hedge recommendation reduces CVaR within budget; another returns NO_ACTION; approval request contains exact plan hash.
- Unit tests for CVaR calculation and quote cost normalization assumptions, constraint binding, infeasible budget, risk factor correlation, stochastic stress.
- UI integration tests with canned B/C API responses; clean `README` plus documented run command.

## Hard boundaries
Never label a weather-market contract a direct hedge on a firm's cloud uptime; settlement-mismatch warnings mandatory. Never claim guaranteed risk reduction or fake a live trade. Avoid calling AP4M payments yourself—C handles that.

## Agent A completion report
Run commands; endpoints and routes; optimization benchmarks on fixtures; v0 components wired; tests; any changes requested to shared API; external API placeholders vs verified live data.
