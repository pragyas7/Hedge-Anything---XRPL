# Switchboard — Engineering Handoff (v1.0)

**Thesis:** The financial operating system for hedging any business exposure, and ultimately a standalone derivatives exchange for digital service risk.

**Decision log (locked):** All businesses as customers; any hedgeable exposure; recommend → explicit approval → execute; both central limit order book and RFQ; US-first compliance; optimize severe downside within a budget; real service failover; long-term standalone exchange.

## Start here (three parallel agents)
1. All agents first read [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`contracts/openapi.yaml`](contracts/openapi.yaml), and [`docs/INTEGRATION_HANDSHAKE.md`](docs/INTEGRATION_HANDSHAKE.md).
2. Give **Agent A** [`agents/AGENT_A_STRATEGY_UI.md`](agents/AGENT_A_STRATEGY_UI.md). Hand your **v0 UI export to Agent A** when ready. A owns strategy + the frontend integration.
3. Give **Agent B** [`agents/AGENT_B_MARKETS_EXCHANGE.md`](agents/AGENT_B_MARKETS_EXCHANGE.md). B owns market connectors and the native exchange, including its contracts.
4. Give **Agent C** [`agents/AGENT_C_EXECUTION_SETTLEMENT.md`](agents/AGENT_C_EXECUTION_SETTLEMENT.md). C owns approval, execution orchestration, XRPL EVM/AP4M, and failover.
5. Do **not** change shared contracts independently. Schema changes go through an API-contract PR reviewed by all three agents.

## Suggested workspace
- `apps/web/` — v0-exported Next.js frontend, Agent A.
- `services/strategy/` — company profiling, scenarios, hedge optimization, Agent A.
- `services/markets/` — quote aggregation, venue normalization, RFQ/order book, Agent B.
- `services/execution/` — approvals, order routing, payment receipts, failover, Agent C.
- `packages/contracts/` — frozen language-level contracts; architecture owner/repo integrator only.
- `contracts/openapi.yaml` — normative REST API.
- `fixtures/` — illustrative synthetic payloads for contract tests, **not live venue quotes**.

## Integration convention
All services expose REST `/v1/*` per OpenAPI; network calls between services use JSON DTOs in `packages/contracts/src/index.ts`. Services communicate via their public interfaces, not direct database writes. Use `X-Request-ID` and `Idempotency-Key` for mutating requests. The strategy service calls market discovery; the execution orchestrator calls marketplace order placement; the UI calls all three through a frontend API gateway / server-side proxy.

## Demo path
Describe a company → confirm exposures and risk budget → aggregate comparable markets/capacity alternatives → scenario-tail-risk hedge optimization → show recommended portfolio with **unhedgeable residual** → approve → place sandbox positions → induce primary inference failure → auto-buy paid replacement through HTTP 402/AP4M → show RLUSD settlement receipt and strategy audit trail.

## Safety and regulatory posture
**No live US derivatives exchange, live unregistered derivatives matching, or automatic real-money trading is authorized by this repo.** Exchange order book and RFQ are testnet/paper modes until regulatory counsel and a licensed venue/clearing structure authorize deployment. Connectors enforce geographic/account/market eligibility. Polymarket International is read-only for US users. Ledger Agent Intent beta lacks XRPL EVM transaction support; treat Ledger hardware-signing integration as a separate, verified capability instead of inventing compatibility.

## Command to validate the starter
```bash
python tests/validate_starter.py
```

## Primary documents
- [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md): product requirements, financial definitions, instrument types, acceptance criteria.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): technical architecture, events, state machines and system boundaries.
- [`docs/INTEGRATION_HANDSHAKE.md`](docs/INTEGRATION_HANDSHAKE.md): ownership rules, merge order and contract tests.
- [`docs/BOUNTY_MAPPING.md`](docs/BOUNTY_MAPPING.md): sponsor integration plan and verification gaps.
- [`docs/V0_UI_HANDOFF.md`](docs/V0_UI_HANDOFF.md): copy-paste v0 prompt and frontend API binding.
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md): end-to-end judge presentation.
- [`docs/SOURCES.md`](docs/SOURCES.md): official technical references and dates.
