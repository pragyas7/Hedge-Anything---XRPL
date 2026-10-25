# Parallel-agent integration contract

## Golden rule
**Agents must not share ownership of implementation directories.** They can implement concurrently from the frozen `contracts/openapi.yaml` and the `fixtures/` payloads. The repo integrator owns schema review and merge. Do not hardcode any other service's database internals or expected UI state.

| Area | Agent A — Strategy/UI | Agent B — Markets/Exchange | Agent C — Execution/Resilience |
|---|---|---|---|
| Owns | `apps/web`, `services/strategy` | `services/markets`, `contracts/solidity`, `contracts/abi` | `services/execution`, `infra` |
| Inbound API | `/v1/companies/*`, `/v1/strategies/*` | `/v1/markets/*`, `/v1/exchange/*` | `/v1/execution/*`, `/v1/failover/*` |
| Dependencies | reads B market candidates, reads C execution status | no runtime dependency on A; returns data to A; receives execution requests from C | consumes immutable A plan; sends market orders to B; calls EVM/AP4M |
| Guaranteed mock | seeded exposures/scenarios/plan | seeded quotes and sandbox market | seeded approval, execution and failure event |
| Agent must not edit | B/C dirs or shared contract | A/C dirs or shared contract | A/B dirs or shared contract |

## Freeze order and handshake
**T0 — integrator:** Commit README, spec, OpenAPI, TS types and fixture JSON. Give all agents the same commit SHA.

**T1 — independent builds:** Each agent returns running service, `GET /healthz`, `.env.example`, test script, and an API contract test. A can use fixture mocks until B/C exist. B can use deterministic synthetic quotes. C can use a fake merchant and mock signatures until sandbox keys supplied.

**T2 — smoke integration:** A `POST /v1/markets/search` against B using fixture business; A generates plan; C hashes same JSON canonicalization as A; C accepts approval for that plan, then sends B an approved order.

**T3 — real sandbox proof:** C completes AP4M workflow and onchain `VoucherRedeemed`, verifies RLUSD payout. B deploys one fully collateralized testnet EVM contract and publishes ABI/address. C consumes ABI, signs and tracks settlement. A displays all receipts.

**T4 — quality gate:** One browser journey works; no mocked or synthetic data misrepresented as live; three agent services pass contract tests; approvals and US eligibility enforced end-to-end.

## Interface contract rules
- Identifiers are opaque strings (ULID or UUID); don't derive them from UI labels.
- Monetary fields in API fixtures are **decimal strings**, not floating binary. In TS use `string` for money and decimals, Decimal.js / bigint in internals.
- Timestamps UTC ISO-8601; chain quantities raw integer strings with token decimals explicit.
- Enum changes require coordinated schema version; additive fields optional by default; unknown enum values treated unsupported.
- Never compare binary event contracts only by market title. Required: exact resolution and payoff normalization, matching period, unit and direction.
- B exposes candid `capability: live | sandbox | read_only | unsupported`; only `live` and properly scoped sandbox can enter real execution.
- C rejects execution without explicit `approvalId`, `planHash`, and plan/version match. A renders status, never assumes `APPROVED` based on frontend click alone.
- Each agent writes unit tests and one consumer-driven contract test for its public API.

## Local environment assumptions
- Node 22+, TypeScript strict, pnpm, Docker (Postgres + Redis), Foundry for Solidity. Ports: web 3000, A 4101, B 4102, C 4103.
- Environment variables `MARKETS_BASE_URL`, `STRATEGY_BASE_URL`, `EXECUTION_BASE_URL`, `DATABASE_URL`, `REDIS_URL`; API keys via secret manager, never `.env` committed.
- UI credentials stay server-side. Run demo in sandbox with seeded fixtures if live markets have no permissions.

## Agent completion report template
`Owned directories changed` / `Run commands` / `API endpoints implemented` / `External capabilities actually verified` / `Fixture tests passed` / `Known blockers` / `Concrete artifacts: deployed addresses, hashes, recorded test traces`.

## Authorization trust boundary (mandatory for external side effects)
Agent C issues a short-lived signed **execution authorization token** after verifying a human-approved plan. All C → B order placements carry this in the `X-Execution-Authorization` header. Claims include `iss`, `aud=markets`, `sub=approvalId`, `planHash`, `quoteId` or instrument/venue, `side`, maximum size/price/spend, `jti` nonce and `exp`. B verifies signature using C's pinned public key/JWKS, rejects replay, and independently checks venue eligibility; `approvalId` alone is NOT proof of authorization. Distinct authenticated maker-account permissions govern standalone exchange maker orders. Sandbox tokens cannot authorize live trades. C revokes unused tokens when plan revoked.

## Canonical plan digest
The `planHash` is `sha256:` plus lowercase hexadecimal SHA-256 of the **RFC 8785 (JCS) canonical JSON** representation of the immutable plan body with fields `planId`, `companyId`, `version`, `createdAt`, `expiresAt`, `budgetUsd`, `estimatedTotalCostUsd`, `before`, `after`, `legs`, `rationale`, `warnings`, `syntheticDemo`. Exclude `planHash` itself and mutable `status`. All three agents use the same serialization and amount-string representation; never hash a frontend rendering or unnormalized floating point JSON. Production plans are immutable after quoting; material modifications create a new version and require reapproval.
