# AGENT B — Cross-Venue Market Intelligence + Standalone Derivatives Exchange

## Your mission
Build the independent market aggregation and trading venue service: market discovery, rule-level comparability, executable fee/depth normalization, venue eligibility, a sandbox price-time central-limit-order-book, a bespoke RFQ workflow, and collateralized XRPL EVM smart contracts for bounded-payout digital service derivatives.

## Read first
`README.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `contracts/openapi.yaml`, `fixtures/market-search.json`, `agents/AGENT_C_EXECUTION_SETTLEMENT.md`. Treat contract ABI as deliverable to C.

## Exclusive writable directories
`services/markets/**`, `contracts/solidity/**`, `contracts/abi/**`. You must not alter `services/strategy` or `services/execution` or shared contracts unless approved. Default market server port 4102.

## API you own
- `POST /v1/markets/search`: accept exposure/risk-factor constraints; return quote list, instruments, service/capacity offers, timestamp, fee/depth, venue capability and comparison label.
- `POST /v1/markets/orders`: submit a **previously C-approved** order to a supported route only; verify authorization envelope, venue eligibility, quote freshness; status may be `SIMULATED` for sandbox or `SUBMITTED` live.
- `POST /v1/exchange/rfqs`, `POST /v1/exchange/rfqs/{rfqId}/quotes`, `POST /v1/exchange/rfqs/{rfqId}/accept` — bespoke quote lifecycle and expiry.
- `POST /v1/exchange/orders`, `GET /v1/exchange/orderbook/{instrumentId}` — sandbox limit order book/matching.
- `GET /healthz`.

## Venue adapters
- Kalshi official market data and user-permitted order capabilities; use official documented endpoints and fee schedule.
- Polymarket US read-only market-data API and authenticated US trading only **when authorized**; keep distinct from Polymarket International. For US, International must be `read_only/reference_only` with no submit method.
- Current fees are category and venue specific, not one global formula. Store fee version and quote timestamp, walk L2 levels to requested size, model fees, and refuse to call a quote executable when depth is inadequate.
- Candidate contracts with related titles but nonidentical resolution/event windows must be proxies, **not arbitrage**.
- Add `synthetic_switchboard` sandbox adapter and example `ServiceCapacityProvider` signed offer.

## Exchange mechanics
- Standard instruments: fully collateralized capped payout binary service outage, bounded price cap, contingent capacity option. Contract's strike, reference method, oracle quorum, dates, denomination, notional limits and max payout immutable after listing.
- CLOB matching: price-time priority, partial fills, cancellation, self-trade protections, negative collateral impossible; typed normalized order book API.
- RFQ: makers quote pricing and cap collateral, firm quote expiry, acceptance token, idempotency, settlement intent; match custom negotiated terms only when exact same canonical digest.
- Solidity Foundry: escrow, collateral reserve, signed orders/nonces (EIP-712 if suitable), oracle results with challenge period, claim settlement; roles and pause controls. No unbounded payoff without margin system. Write fuzz/invariant tests for solvency, idempotency and replay.
- Publish ABI JSON and deployed chain ID/address (if deployed). Agent C owns chain transaction submission and monitoring; do not inject EVM tx writes inside another service.

## Test cases
- Market comparison direct vs proxy vs not comparable; fee+depth sizes; staleness and unsupported venue access.
- Orderbook price/time, partial fills, cancel, self-trade, replay, insufficient balance, stale signed terms, RFQ expiry.
- Contracts: payoff bounds, full collateral, double claims, invalid oracle, proper events, predictable code deploy script.

## Acceptance handoff to C
`market instrument fixture`, `trade intent`, `order status schema`, `ABI`, `verified testnet address`, `contract deployment tx`. For nonexistent external trade credentials, stub sandbox and explicitly label—not pretend live Kalshi/Polymarket execution.

## Authorization security clarification
`approvalId` and `planHash` fields are insufficient alone. Validate Agent C's `X-Execution-Authorization` signed short-lived token and compare claims to the submitted quote/order terms and jurisdiction; nonce replay protection required. Keep sandbox maker-role credentials separate from user hedge portfolio approvals.
