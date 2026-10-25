# Switchboard repo instructions for all coding agents

Read `README.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/INTEGRATION_HANDSHAKE.md`, `contracts/openapi.yaml` FIRST.

Three independently writable workstreams:
1. Agent A owns `apps/web/**`, `services/strategy/**`; hand it the externally generated v0 UI export. See `agents/AGENT_A_STRATEGY_UI.md`.
2. Agent B owns `services/markets/**`, `contracts/solidity/**`, `contracts/abi/**`. See `agents/AGENT_B_MARKETS_EXCHANGE.md`.
3. Agent C owns `services/execution/**`, `infra/**`; handles Mastercard AP4M and Ledger. See `agents/AGENT_C_EXECUTION_SETTLEMENT.md`.

FROZEN shared: `contracts/openapi.yaml`, `packages/contracts/**`, `fixtures/**`. Propose schema changes to integrator instead of editing. Services access other services ONLY through documented HTTP contracts, NOT shared DB tables. Mock external capabilities honestly; never claim live US trades, real venue quotes, Ledger XRPL EVM Agent Intent support, confirmed RLUSD settlement, or fully guaranteed replacement capacity unless directly verified.

Money strings use exact decimals. Each mutating API requires idempotency key. External order routing also requires cryptographically scoped `X-Execution-Authorization` issued by C. Human explicitly approves plan; AP4M can act autonomously only within approved prefunded spending policy.

**AP4M NOTE:** Official Mastercard hackathon kit includes its own AGENTS.md, SDK and setup details. Agent C must retrieve it from the authenticated hackathon portal and retain official payment security rules in its `services/execution` directory rather than replacing these repository-wide collaboration rules or guessing APIs.

Run `python tests/validate_starter.py` before integration PR. Publish a concise handoff with endpoints, run commands, tests, and proven-vs-mocked capabilities.
