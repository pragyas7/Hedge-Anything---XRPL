# Agent C handoff

Branch `agent-c-execution` from base `60502ea`. Package `@switchboard/execution`.

## Owned directories changed

- `switchboard-starter/services/execution/**` (service, tests, Dockerfile, `.env.example`, deterministic `dev-keys/`, this handoff)
- `switchboard-starter/infra/docker-compose.yml` (added the `execution` service; postgres and redis unchanged)
- `switchboard-starter/infra/README.md`

Not edited: OpenAPI, `@switchboard/contracts`, fixtures, apps, strategy, markets, root `package.json`, `pnpm-workspace.yaml`, docs, `tests/validate_starter.py`, `contracts/abi`, `contracts/solidity`. `pnpm-lock.yaml` is not committed.

## Run commands

```bash
export PATH="$HOME/.nvm/versions/node/v20.19.1/bin:$PATH"
cd switchboard-starter
pnpm --filter @switchboard/execution typecheck
pnpm --filter @switchboard/execution test
/opt/homebrew/bin/python3.13 -m venv .venv
.venv/bin/pip install -r tests/requirements-dev.txt
.venv/bin/python tests/validate_starter.py
```

System `python3` (3.14) could not create a venv (`ensurepip` failed) and did not have PyYAML. The 3.13 venv above was used. Do not commit `.venv`.

Results on 2026-10-24:

- `tsc --noEmit`: pass
- vitest: 5 files, 25 tests, pass (no Docker, no network, no private keys)
- `tests/validate_starter.py`: pass (fixture schemas, cross-service checks, 23 routes, 36 components)

## API endpoints implemented

Bearer `SWITCHBOARD_DEV_BEARER` (default `switchboard-dev-platform-token`), except the two public GETs. Mutating POSTs require `Idempotency-Key`.

- `POST /v1/execution/approvals`
- `POST /v1/execution/approvals/{approvalId}/confirm`
- `POST /v1/execution/runs`
- `GET /v1/execution/runs/{runId}`
- `POST /v1/failover/simulate`
- `POST /v1/failover/arm`
- `POST /v1/failover/disable`
- `GET /v1/failover/runs/{failoverId}`
- `GET /healthz` → `{status, service:"execution", version}`
- `GET /.well-known/execution-jwks.json`
- `GET /v1/execution/revocations` (in-memory jti list; not in OpenAPI)

Approval create accepts an extra `plan` snapshot so the hash and version can be stored. The response is the OpenAPI `Approval`. Confirm warnings that the schema cannot carry are returned as `X-Switchboard-Warning`. `X-Switchboard-Now`, `X-Failover-Scenario`, and `X-Failover-Quote-Usd` carry fields the schemas forbid in the body.

## External capabilities actually verified

- Public page fetched: https://hackathon.ap4m.build/integration-guide. Names retained in `AP4M_SECURITY_NOTES.md`: `requestChannel`, EIP-712 voucher signature, `redeemVoucher`, `POST /record-redemption`, `recordSettlement`, `closeChannel`. Chain id 1449000. Private key stays on the machine.
- Authentication required (not retrieved, no SDK method bodies invented): https://hackathon.ap4m.build/docs/x402.md, https://hackathon.ap4m.build/docs/api-reference.md, https://hackathon.ap4m.build/AGENTS.md.
- Public page fetched: https://developers.ledger.com/docs/ai-tools/agent-intent. Beta. Sends of ETH/SOL and some Ethereum swaps. XRPL EVM is not listed. `ledger_agent_intent` is always `UNSUPPORTED` and never `APPROVED`.
- Live AP4M payment: **not verified**.
- RLUSD balance observation: **not verified**.
- Ledger device / DMK session: **not verified**.
- QuickNode subscription: **not verified**.
- AWS deploy: **not verified**.

`jose` 5.10.0 does not export `generateKeyPairFromSeed` (also absent in 6.2.13). The committed key is the same 32-byte seed `switchboard-sandbox-auth-seed-v1` (`TextEncoder` length 32) inside an RFC 8410 Ed25519 PKCS#8 prefix, then `jose` `exportPKCS8` / `exportSPKI` / `exportJWK`. Algorithm remains Ed25519 / EdDSA. Public JWK `x`: `B2BwjhWC39PXHGVm7zdNbWBHdmlL2xt_HSg4jDDYnJs`. No `d` is published.

`maxPriceUsd` and markets `limitPriceUsd` are optional leg `askUsd` when present, otherwise `estimatedAllInCostUsd / quantity`.

## Fixture tests passed

`validate_starter.py` schema-checked `hedge-plan.json`, `approval.json`, `execution-run.json`, and `failover-run.json` without editing them. Unit tests recompute the real plan hash from `fixtures/hedge-plan.json` and reject the placeholder `sha256:demo_only_untrusted_digest_replace_in_production`. Covered in vitest: approval auth and idempotency, every confirm method including Ledger unsupported labeling, execution rejections with zero `placeOrder` calls, JWT `iss` / `aud` / `mode` / `exp`, replay does not submit a second order, unreachable markets does not invent a tx id, failover failing backup, invalid voucher, budget block, mock stop at `VOUCHER_SIGNED`, live-without-key `UNVERIFIED`, and one voucher per idempotency key.

## Known blockers

- No AP4M team credentials, agent key, or XRPL EVM RPC in this environment, so no channel, voucher redemption, or RLUSD receipt can be observed. Mock and live-without-key paths refuse those states.
- Official x402 and API reference bodies are behind the hackathon login. The live client does not call them.
- Ledger Agent Intent cannot approve an XRPL EVM (1449000) plan. DMK is unsupported unless an operator sets `LEDGER_DMK_VERIFIED=true`, and even then no device was observed.
- `@switchboard/contracts` does not export `FailoverSimulateRequest`. The execution service defines that body type locally.
- Markets service was not running. Unit tests inject a fake client. A local process marks an unreachable leg `REJECTED` / `not_submitted`.
- Settlement ABI from Agent B was not in the base commit. The client reads `EXECUTION_EXCHANGE_ABI_PATH` when a file is present and otherwise simulates without a real tx hash.

## Concrete artifacts

- `services/execution/src/` Fastify app, plan hash, capability registry, EdDSA tokens, markets client, settlement interface, AP4M fault injector
- `services/execution/dev-keys/execution-auth-private.pem`
- `services/execution/dev-keys/execution-auth-public.pem`
- `services/execution/test/` vitest
- `services/execution/Dockerfile`
- `services/execution/.env.example`
- `services/execution/README.md`
- `services/execution/AP4M_SECURITY_NOTES.md`
- `infra/docker-compose.yml` `execution` service
- `infra/README.md`
