# @switchboard/execution

Approvals, sandbox order orchestration, and the AP4M failover fault injector. Port **4103**. In-memory store. No Docker, network, or private key is required for `pnpm test`.

```bash
export PATH="$HOME/.nvm/versions/node/v20.19.1/bin:$PATH"
cd switchboard-starter
pnpm install
pnpm --filter @switchboard/execution typecheck
pnpm --filter @switchboard/execution test
pnpm --filter @switchboard/execution dev
```

Copy `services/execution/.env.example` to `.env` in this directory when running the process. Defaults match that file: bearer `switchboard-dev-platform-token`, markets `http://localhost:4102`, `AP4M_MODE=mock`, `LEDGER_MODE=unsupported_until_verified`, `EXECUTION_ALLOW_LIVE=false`.

## Auth

`Authorization: Bearer <SWITCHBOARD_DEV_BEARER>` on every route except `GET /healthz` and `GET /.well-known/execution-jwks.json`. Missing or wrong bearer is **401**.

Mutating POSTs require header `Idempotency-Key`. Missing is **400** `IDEMPOTENCY_KEY_REQUIRED`. The same key and the same body replay the stored response. The same key and a different body is **409** `IDEMPOTENCY_CONFLICT`. A replayed execution run does not submit a second markets order.

`POST /v1/execution/runs` uses the header as the idempotency key. If the body also has `idempotencyKey`, the two values must match or the response is **400** `IDEMPOTENCY_KEY_MISMATCH` and the key is not stored.

## Plan hash

`planHash` is `sha256:` plus the hex SHA-256 of RFC 8785 canonical JSON (`canonicalize`) of exactly: `planId`, `companyId`, `version`, `createdAt`, `expiresAt`, `budgetUsd`, `estimatedTotalCostUsd`, `before`, `after`, `legs`, `rationale`, `warnings`, `syntheticDemo`. `planHash` and `status` are excluded.

Approvals and runs recompute that digest. A mismatch, including the fixture placeholder `sha256:demo_only_untrusted_digest_replace_in_production`, is **409** `PLAN_HASH_MISMATCH` and submits zero orders.

`POST /v1/execution/approvals` requires the OpenAPI `ApprovalRequest` fields **and** a `plan` snapshot. The OpenAPI schema does not list `plan` (`additionalProperties: false`). The response is the OpenAPI `Approval` and omits the snapshot. The snapshot is what was hashed and is what later runs are compared against (hash and version).

## Approvals

Create stores status `PENDING`, method `app_manual` (the initial label is not evidence of a signature), and the caps `maxTotalSpendUsd`, `maxCollateralUsd`, `allowedVenues`, `ap4mFallbackBudgetUsd`.

Confirm is not a boolean.

| method | result |
| --- | --- |
| `app_manual` | `signedIntent` must equal `app_manual:` + planHash. Otherwise **400** and status stays `PENDING`. Success is `APPROVED` with `approvedAt`. This is not Ledger. |
| `ledger_agent_intent` | Always `UNSUPPORTED`. Never `APPROVED`. Ledger Agent Intent beta documents Ethereum and Solana sends and some Ethereum swaps, not XRPL EVM chain id 1449000. HTTP 200 with header `X-Switchboard-Warning`. See `src/capability-registry.ts` and https://developers.ledger.com/docs/ai-tools/agent-intent. |
| `ledger_dmk_verified` | `UNSUPPORTED` unless `LEDGER_DMK_VERIFIED=true` and `deviceProofId` is present and `signedIntent` starts with `dmk:`. Even then the method label is `ledger_dmk_verified` only. The default env is unset, so the method is `UNSUPPORTED`. This process does not observe a physical device. |
| `external_wallet` | `signedIntent` must equal `external_wallet:` + planHash. Label is `external_wallet`. Not Ledger. |

An expired approval cannot be confirmed (**409** `APPROVAL_EXPIRED`). `now` comes from header `X-Switchboard-Now` (ISO-8601) or the process clock. The body schema does not allow a `now` field.

## Execution runs

`POST /v1/markets/orders` is not called when the approval is missing, not `APPROVED`, or expired; the plan hash or version differs from the approved snapshot; `estimatedTotalCostUsd` exceeds `maxTotalSpendUsd`; summed `maxAdditionalObligationUsd` exceeds `maxCollateralUsd`; a leg venue is outside `allowedVenues` (including `polymarket_international`); a quote is expired against `plan.expiresAt` or `X-Switchboard-Now`; or the quote revalidation client sets a material price change. Those checks use `QuoteRevalidationClient`, which is separate from `MarketsClient.placeOrder`.

On success, each **financial** leg is posted to `MARKETS_BASE_URL/v1/markets/orders` with the bearer, `Idempotency-Key`, and `X-Execution-Authorization`. Capacity legs are not market orders. `clientOrderId` is `${runId}:${legId}` and is also the markets idempotency key, so a retry is stable.

`limitPriceUsd` and JWT `maxPriceUsd` are the leg's optional `askUsd` when that field is a decimal string. The hedge-plan fixture has no ask, so the bound is `estimatedAllInCostUsd / quantity` (`allInUnitPrice` in `src/money.ts`). For the fixture financial leg that is `204 / 10 = 20.4`. `maxSpendUsd` is `estimatedAllInCostUsd`.

JWT (`jose`, `alg` EdDSA): `iss=switchboard-execution`, `aud=markets`, `sub=approvalId`, `planHash`, `quoteId`, `instrumentId`, `venue`, `side=BUY`, `maxQuantity`, `maxPriceUsd`, `maxSpendUsd`, `jti`, `iat`, `exp=iat+60`, `mode`. `mode` is `sandbox` unless `EXECUTION_ALLOW_LIVE=true`. Default is false, including when `plan.syntheticDemo` is false.

The public JWK set is `GET /.well-known/execution-jwks.json`. The sandbox key is Ed25519 from the 32-byte seed `switchboard-sandbox-auth-seed-v1`, written as PKCS#8 / SPKI under `dev-keys/`. `jose` does not export `generateKeyPairFromSeed`; the seed is wrapped in the RFC 8410 PKCS#8 prefix and imported. Public JWK `x` is `B2BwjhWC39PXHGVm7zdNbWBHdmlL2xt_HSg4jDDYnJs`. If the PEM files are missing at startup, the same seed is written again. It is not a random key.

A markets status of `SIMULATED` is stored as `SIMULATED` and the order stays `syntheticDemo`. It is not relabeled `FILLED`. A run whose financial orders are all `SIMULATED` or `FILLED` is `ACTIVE`. `ACTIVE` plus `SIMULATED` means the sandbox saga finished, not a live fill. If markets is unreachable, the leg is `REJECTED` with `venueOrderId` `not_submitted` (the order enum has no `FAILED`) and the run is `FAILED`. No chain-looking venue id is invented. A stale or price-moved markets response persists the run as `REAPPROVAL_REQUIRED`.

Revoked `jti` values live in process memory (`GET /v1/execution/revocations`, bearer, not in the OpenAPI document). They are dropped on restart. Outstanding jtis are revoked when an approval expires or is marked unsupported, and when a run is `FAILED`, `PARTIAL`, or `REAPPROVAL_REQUIRED`. A later run mints a new `jti`.

## Settlement

`ExchangeSettlementClient` loads JSON ABI from `EXECUTION_EXCHANGE_ABI_PATH` when that file exists. Otherwise it is a sandbox simulator. Both return `kind: exchange_settlement`, `confirmed: false`, and `transactionHash: synthetic_not_a_transaction`. Neither reports a real `0x` plus 64 hex-digit hash.

## Failover

State machine: `HEALTHY → SUSPECT → VERIFIED_FAILURE → SEARCHING_FALLBACK → QUOTED_402 → VOUCHER_SIGNED → VOUCHER_REDEEMED → RLUSD_SETTLED → FALLBACK_ACTIVE`, or `BUDGET_BLOCKED`, `UNAVAILABLE`, `UNVERIFIED`, `FAIL_CLOSED`.

`POST /v1/failover/arm` requires an `APPROVED` approval whose `ap4mFallbackBudgetUsd` is at least `maxPerTriggerUsd` and at least `maxDailySpendUsd`. Arming cannot raise that budget. A raise returns `FailoverArmResponse` status `REJECTED` and does not arm. The policy digest is `sha256:` of the canonical arm fields.

`POST /v1/failover/disable` halts the monitor. A disabled policy does not pay (`FAIL_CLOSED`, spend 0).

`POST /v1/failover/simulate` is the fault injector. It is not a production monitor and it does not probe the network. The OpenAPI body is only `planId`, `primaryService`, `fallbackService`, `failureMode` (`timeout`, `http_500`, `latency_spike`, `provider_down`). It has no `approvalId`. The injector matches the latest armed policy for that plan and primary service. Scenario and quote are headers because the schema forbids extra body fields:

- `X-Failover-Scenario`: `success` (default), `failing_backup`, `invalid_voucher`, `no_balance`, `budget_exceeded`, `receipt_failed`, `proof_missing`
- `X-Failover-Quote-Usd`: decimal string

Idempotency hashes the body together with those headers, so two scenarios cannot share a key. The same key cannot create two vouchers.

Circuit breaker stops on missing proof, budget exceeded, or a failed receipt. Mock success stops at `VOUCHER_SIGNED` with `confirmed: false`. It does not report `RLUSD_SETTLED` or `FALLBACK_ACTIVE`. See `AP4M_SECURITY_NOTES.md`.

## External capabilities

Not verified in this package: live AP4M payment, RLUSD balance, Ledger device signature, QuickNode, AWS. Ledger Agent Intent is unsupported for chain 1449000.
