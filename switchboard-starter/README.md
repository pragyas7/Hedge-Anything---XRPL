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

## Judge demo

Public one-shot proof: [https://switchboard-hackathon.vercel.app](https://switchboard-hackathon.vercel.app). The button runs analysis, a sandbox quote, `app_manual` approval, simulated orders, and a mock failover in one process. Orders stay `SIMULATED`. Failover stops at `VOUCHER_SIGNED` until AP4M credentials exist. The page reads Kalshi's public market API unless `KALSHI_ENABLED=false`. A `source: live` row is that public price, read-only, and it is not ordered. If Kalshi does not answer, the labeled synthetic weather example stays. The chain line is the public XRPL EVM testnet RPC unless `QUICKNODE_RPC_URL` is set. `ledger_agent_intent` stays unsupported on chain id 1449000.

Local one-process page: `pnpm demo`, then [http://127.0.0.1:4110](http://127.0.0.1:4110). The gateway lives in `demo/app.ts` and the page in `demo/page.ts`; `server.ts` only starts it. Before another Vercel deploy, run `pnpm bundle:demo` so `api/index.mjs` matches the source. The judge walkthrough is [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

AP4M go-live steps are in [`docs/AP4M_CHECKLIST.md`](docs/AP4M_CHECKLIST.md). `pnpm ap4m:check [--env-file path]` is a read-only preflight: it checks the variables, the key format, the AP4M API, the HTTP 402 resource, and the chain id, and never signs or spends.

## Sponsor progress

Updated 2026-10-25. Team name for the AP4M portal is **Penn**. No agent key, QuickNode URL, or Ledger device is configured. The rows below are code paths. They are not payments, QuickNode usage, or a device signature.

| Sponsor | In the repo now | Still waiting | Paste later |
| --- | --- | --- | --- |
| Mastercard AP4M | Sign-in, voucher redeem, record-redemption, and settle live in `services/execution/src/ap4m-live.ts`. `settled` is true only when settle returns a 32-byte `payout_tx`. The sandbox proof still uses the mock failover and stops at `VOUCHER_SIGNED`. | Portal activation, agent key, funded testnet budget, merchant address that is not the agent wallet, channel id or cap, and a real HTTP 402 resource. | `AP4M_AGENT_PRIVATE_KEY`, `AP4M_MODE=live`, `AP4M_RESOURCE_URL`, and `AP4M_CHANNEL_ID` or `AP4M_CHANNEL_CAP`. Optional `AP4M_MERCHANT_ID`. |
| QuickNode | Chain head and PaymentLedger `VoucherRedeemed` logs. The topic is the keccak256 of the event signature. The URL path is never returned. | An endpoint. Until then the label says the public XRPL EVM testnet RPC was used. | `QUICKNODE_RPC_URL` |
| Ledger | Clear-sign preview format `switchboard.xrpl-clear-sign.v1` for TrustSet, OfferCreate, AMMDeposit, EscrowCreate, and Payment. Device status stays `deviceSeen: false` and `signed: false`. | A device and a verified XRPL EVM signing path. `ledger_agent_intent` stays unsupported on chain id 1449000. Chain id 1440000 is not used. | Nothing to paste yet. Fallback and device path: [`docs/LEDGER_PLAN.md`](docs/LEDGER_PLAN.md). |

Public routes on the demo: `GET /demo/sponsors` and `POST /demo/proof`. The page itself walks through three steps: `POST /demo/analyze` reads the company description and limits, `POST /demo/quote` returns market quotes, sandbox order books, and a hedge plan without ordering anything, and `POST /demo/execute` (needs `confirm: true` and the reviewed plan) re-quotes, refuses if the legs changed or the premium rose, then approves with `app_manual`, places simulated orders, and runs the mock failover. The page markup lives in `demo/page.ts`. The execution service route `POST /v1/execution/ap4m/pay` (bearer plus `Idempotency-Key`) is the local pay entry. It returns the missing-variable list until the AP4M values above are set.

**AWS AgentCore is parked.** We are not entering the AWS track. The local AgentCore stand-in stays in `services/execution/src/aws-agentcore.ts` with its tests, but `GET /ping`, `POST /invocations`, and the AWS status card are off. Set `AWS_AGENTCORE_ENABLED=true` to turn them back on. When on, the invocation route refuses to use an agent key until `AP4M_ALLOW_PUBLIC_PAY=true`, and it accepts only `https` resource URLs.

The names to paste are listed in [`.env.example`](.env.example). Do not commit a filled `.env`.

## Local stack
Node 20 and pnpm 9. From this directory:

```bash
pnpm install
pnpm --filter @switchboard/markets start      # :4102
pnpm --filter @switchboard/execution start    # :4103
pnpm --filter @switchboard/strategy start     # :4101
pnpm --filter @switchboard/web dev            # :3000
```

Dev bearer: `switchboard-dev-platform-token`. Sandbox Ed25519 keys under each of `services/markets/dev-keys` and `services/execution/dev-keys` are the same committed development seed. They control no funds. Do not use them outside this sandbox.

`pnpm test` runs the four package test suites. The execution suite also covers the demo routes (`services/execution/test/demo-app.test.ts`) and the AP4M preflight. `pnpm test:contracts` checks the frozen fixtures. Foundry: `forge test` in `contracts/solidity`.

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
