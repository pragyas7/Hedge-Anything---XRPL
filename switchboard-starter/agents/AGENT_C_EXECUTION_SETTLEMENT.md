# AGENT C — Approvals, Hedging Execution, Service Resilience, AP4M + Ledger

## Your mission
Own the last mile: approval policies and authorization evidence, safe order-routing orchestration to Agent B, on-chain settlement and monitoring on XRPL EVM Testnet, service health probing/real failover, and Mastercard AP4M paid fallback via HTTP 402. Own deployment and QuickNode/AWS integrations if supported.

## Read first
`README.md`, `docs/PRODUCT_SPEC.md` §9–12, `docs/ARCHITECTURE.md`, `docs/BOUNTY_MAPPING.md`, `contracts/openapi.yaml`, `fixtures/hedge-plan.json`, `fixtures/execution-run.json`, official AP4M guide https://hackathon.ap4m.build/integration-guide and Ledger Agent Intent docs https://developers.ledger.com/docs/ai-tools/agent-intent .

## Exclusive writable directories
`services/execution/**`, `infra/**`. Consume Agent B's ABI in read-only mode. API port 4103. Do not modify A/B modules or shared schemas except formal review.

## APIs you own
- `POST /v1/execution/approvals` — create exact scoped, versioned human approval request. Include hash, expiry, notional/premium caps, venue whitelist, authorized AP4M agent allowance.
- `POST /v1/execution/approvals/{approvalId}/confirm` — validate actual authorization method and signer evidence; no boolean shortcut in live mode.
- `POST /v1/execution/runs` — verify approval, quote freshness, venue account eligibility, capital, plan hash, and submit each leg to Agent B; record statuses and idempotent receipts.
- `GET /v1/execution/runs/{runId}`, `POST /v1/failover/simulate`, `GET /healthz`.

## Mastercard AP4M REQUIRED full flow
1. Use portal team enrollment, a funded AP4M budget and agent wallet; merchant payout address must differ.
2. Use official hackathon SDK **only for the event** on EVM testnet chain ID `1449000`.
3. Build qualifying paid replacement inference/real resource merchant and a buyer agent. Merchant returns HTTP 402; agent parses it, chooses to spend based on quality/budget, cryptographically signs voucher and submits autonomously (NO fresh human tap).
4. Record AP4M channel, message, voucher signature metadata (never keys), merchant redemption, `VoucherRedeemed` explorer hash, observed RLUSD transfer to merchant payout wallet, successful unlocked service response.
5. Separate `VOUCHER_REDEEMED` from `RLUSD_SETTLED` and fail closed on timeout or payout mismatch.
6. Demonstrate fallback stays under human-preapproved AP4M budget, with daily and per-event caps and kill switch.

## Ledger integration truthfulness
- Ledger Agent Intent beta docs list Ethereum/Solana send and some swaps; **do not claim its XRPL EVM support**. Implement a capability-registry `ledger_agent_intent` route only for official supported operations and accounts.
- For XRPL EVM signatures, explore Ledger Device Management Kit Ethereum signer and direct EVM tx signing after **verifying support, chain ID, signing prompt and device screen**; if unsupported, fall back to explicit wallet approval and label method accurately.
- Place a meaningful device-backed boundary around capital approvals or preauthorized budget top-ups on officially supported network; do not request an approval per AP4M micro-payment.
- Never handle seed phrases or export Ledger keys to the agent.

## Failover engine
- Configure primary provider, fallback equivalence/performance benchmark, independent multi-location probes, trigger quorum and cooldown.
- State: healthy → suspect → verified failure → quote backup → check preauthorized budget → HTTP 402 → voucher → settlement → fallback activated; log each transition with correlation ID.
- Canaries, quality gate, hard spend cap, stop switch, anti-loop rechecks; no unapproved increase in financial risk, no uncontrolled retry loops.
- Fallback response must be a legitimately usable API result; prove status/latency/quality.

## Execution & infra
- Account, venue eligibility and approval policy checked both before first order and before each retry; deterministic idempotency for fills/payments; partial fills and cancellation.
- Operate async saga for non-atomic external venue orders and XRPL EVM actions; reapprove material price/terms changes.
- Streaming/log polling to index AP4M events and B exchange Solidity events; QuickNode only if it actually supports required network. AWS deployment/observability if available with trace screenshots and reproducible infra.

## Required tests
- Rejected/unapproved/stale/over-budget plan has ZERO submitted orders.
- Duplicate run creation and voucher submission produce at most one external execution.
- Hardware unsupported route never labeled approved by Ledger.
- Simulate primary outage with failing backup, 402 invalid, no balance, and correct successful RLUSD path.
- Test invalid settlement evidence cannot set success status.

## Completion artifacts
On-chain explorer tx; voucher redemption and RLUSD payout receipts; local one-command demo; exact chain/network settings; logs showing autonomous 402 decision; hardware signer proof only if supported and physically performed; test results; secure `.env.example`.

## Signed execution authorizations
After approval, issue an audience-bound, short-lived order-specific `X-Execution-Authorization` token to B with hashed plan, permitted quote/instrument, venue, side, max size/price, expiry and nonce. B validates this; do not route merely by providing an approvalId. Implement revocation and hard fail on expired tokens. See `docs/INTEGRATION_HANDSHAKE.md`.

## Persistent operations endpoints
Also implement `POST /v1/failover/arm`, `POST /v1/failover/disable`, and `GET /v1/failover/runs/{failoverId}` per updated OpenAPI; `/simulate` is only the fault injector, not the production monitoring interface. An armed policy cannot increase limits without reapproval.
