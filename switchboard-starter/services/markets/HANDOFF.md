# Agent B handoff

## Owned directories changed

- `switchboard-starter/services/markets/**` — `@switchboard/markets` (Fastify 5, in-memory CLOB and RFQ, search adapters, execution-auth verification, vitest).
- `switchboard-starter/contracts/solidity/**` — Foundry project for `SwitchboardEscrow` (solc 0.8.24). Includes `lib/forge-std`. `script/Deploy.s.sol` does not broadcast.
- `switchboard-starter/contracts/abi/**` — exported ABI for `SwitchboardEscrow`.

No OpenAPI, `@switchboard/contracts`, fixtures, apps, strategy, execution, infra, root package, or docs edits.

## Run commands

From `switchboard-starter`:

```shell
pnpm --filter @switchboard/markets test
pnpm --filter @switchboard/markets typecheck
pnpm --filter @switchboard/markets dev
```

From `switchboard-starter/contracts/solidity`:

```shell
forge test
```

`forge` 1.0.0-stable, solc 0.8.24. Do not pass `--broadcast`. No deployment address or transaction hash exists.

## API endpoints implemented

- `GET /healthz` — no auth. `{ status, service: "markets", version }`.
- `POST /v1/markets/search`
- `POST /v1/markets/orders` — requires `X-Execution-Authorization`.
- `GET /v1/markets/instruments/{instrumentId}`
- `POST /v1/exchange/rfqs`
- `GET /v1/exchange/rfqs/{rfqId}`
- `POST /v1/exchange/rfqs/{rfqId}/quotes` — `X-Sandbox-Maker-Key`.
- `POST /v1/exchange/rfqs/{rfqId}/accept` — execution JWT, `firmUntil`, and `canonicalTermsHash`.
- `POST /v1/exchange/orders` — `X-Sandbox-Maker-Key`, not the execution JWT.
- `POST /v1/exchange/orders/cancel` — sandbox extension, body `{ clientOrderId }`. Not in the frozen OpenAPI.
- `GET /v1/exchange/orderbook/{instrumentId}` — bids descending, asks ascending, mode `sandbox`.
- `GET /v1/exchange/instruments` — three standard instruments with immutable terms.

Platform bearer is `SWITCHBOARD_DEV_BEARER` (default `switchboard-dev-platform-token`). Mutating POSTs require `Idempotency-Key`. `X-Request-ID` is echoed.

## External capabilities actually verified

- Kalshi public read, this session, no credentials: `GET https://external-api.kalshi.com/trade-api/v2/markets?limit=1&status=open&series_ticker=KXHIGHNY` returned `KXHIGHNY-26OCT25-T71` (NYC maximum temperature, The Weather Company, `yes_ask_dollars` `0.0100`). The adapter can attach that kind of row as `source: live`, `capability: read_only`. It is a weather reference, not a direct service-outage hedge. Fees on that row are zero because the category fee schedule was not applied.
- Kalshi order placement was not verified as live. This service returns `403` and does not invent a fill.
- Polymarket US and Polymarket International were not called and were not verified as live. No live book is invented. US jurisdiction rows for international are reference only.
- XRPL EVM testnet deploy was not verified as live. `Deploy.s.sol` was not broadcast. No contract address and no transaction hash were produced.

Sandbox market orders that rest against the in-memory book return `SIMULATED` with `syntheticDemo: true`. This service does not return `FILLED` with `syntheticDemo: false`.

## Fixture tests passed

- `pnpm --filter @switchboard/markets test` — 5 files, 12 tests, including direct vs proxy vs not comparable, all-in cost and insufficient depth, stale quotes, US Polymarket International rejection, missing JWT, replayed `jti`, claim mismatch, sandbox JWT vs live capability, price-time / partial fill / cancel / self-trade / collateral / idempotent client order, RFQ expiry and terms-hash mismatch, idempotency keys, demo fixture body equality, and a sandbox order signed with `dev-keys/execution-auth-private.pem`.
- `pnpm --filter @switchboard/markets typecheck`.
- `forge test` — solvency, fuzz solvency, idempotent claim, replayed signature, invalid oracle, pause, events, and an invariant that collateral covers outstanding max payout (20 runs, depth 15).
- `tests/validate_starter.py` passed: 7 fixture schemas, cross-service foreign keys, and 23 API routes / 36 schema components. System `python3` (3.14) has no PyYAML, so this used `switchboard-starter/.venv` created from `tests/requirements-dev.txt` with Python 3.13. `.venv` is not committed. Vitest does not call Kalshi; search tests pass `kalshiEnabled: false`.

## Known blockers

- No live venue credentials. `EXECUTION_ALLOW_LIVE` defaults to false. Even if it is set, Kalshi and Polymarket US orders stay `403` (`NO_LIVE_VENUE` / `VENUE_NOT_EXECUTABLE`). There is nothing to fill on a live book.
- `jose` does not export `generateKeyPairFromSeed`. The committed PEMs are the PKCS#8/SPKI encoding of the 32-byte seed `switchboard-sandbox-auth-seed-v1`. Public JWK `x` is `B2BwjhWC39PXHGVm7zdNbWBHdmlL2xt_HSg4jDDYnJs`. They are sandbox dev keys with no funds, not production keys. The private key is committed so local C/B verification matches.
- `RfqAcceptRequest` has no terms-hash field. The hash is the JWT claim `canonicalTermsHash`.
- Frozen OpenAPI lists `X-Execution-Authorization` on maker order and RFQ quote routes. Those routes authenticate with `X-Sandbox-Maker-Key`, per the Agent B task.
- Escrow is unit-tested against `MockERC20` only. It has not been deployed.

## Concrete artifacts

- `services/markets/src/**`, `services/markets/test/**`, `services/markets/package.json`, `services/markets/.env.example`, `services/markets/README.md`
- `services/markets/dev-keys/execution-auth-public.pem`
- `services/markets/dev-keys/execution-auth-private.pem` (sandbox only, no funds)
- `contracts/solidity/src/SwitchboardEscrow.sol`
- `contracts/solidity/test/SwitchboardEscrow.t.sol`
- `contracts/solidity/test/MockERC20.sol`
- `contracts/solidity/script/Deploy.s.sol` (simulation only)
- `contracts/abi/SwitchboardEscrow.json` — contract `SwitchboardEscrow`, solc `0.8.24+commit.e11b9ed9`, optimizer 200
