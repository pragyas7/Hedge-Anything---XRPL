# @switchboard/markets

In-memory sandbox for market search, a price-time CLOB, and RFQs. Default port `4102`. Storage is process memory, so tests do not need Docker.

These keys and balances are sandbox paper state. They move no funds.

## Run

From `switchboard-starter` (Node 20.19.1, pnpm 9.15.0):

```shell
pnpm --filter @switchboard/markets test
pnpm --filter @switchboard/markets typecheck
pnpm --filter @switchboard/markets dev
pnpm --filter @switchboard/markets start
```

Copy `services/markets/.env.example` to `.env` only for local overrides. Do not put production credentials in it.

## Platform auth

`Authorization: Bearer` must equal `SWITCHBOARD_DEV_BEARER` (default `switchboard-dev-platform-token`). Anything else is `401`. `GET /healthz` is open and returns `{ status, service: "markets", version }`.

Mutating `POST`s require `Idempotency-Key`. A missing key is `400`. The same key and body returns the stored result and does not fill again. The same key and a different body is `409`. `X-Request-ID` is echoed.

## Execution authorization

`POST /v1/markets/orders` and `POST /v1/exchange/rfqs/{rfqId}/accept` require `X-Execution-Authorization`, a compact EdDSA JWT checked with `jose` against the committed public key.

Required claims: `iss=switchboard-execution`, `aud=markets`, `sub` (approval id), `planHash`, `quoteId`, `instrumentId`, `venue`, `side`, `maxQuantity`, `maxPriceUsd`, `maxSpendUsd`, `jti`, `iat`, `exp`, `mode` (`sandbox` or `live`). `exp` must be in the future and `exp - iat` must be at most 120 seconds. A replayed `jti` is rejected. The order must fit those claims. An approval id without a valid token stores nothing.

`mode=sandbox` cannot authorize a quote whose capability is `live`. `mode=live` is rejected unless `EXECUTION_ALLOW_LIVE=true`. This process has no live venue, so live orders stay rejected.

RFQ accept also requires claim `canonicalTermsHash` equal to the hash frozen on the firm quote, and `firmUntil` must still be in the future.

Maker CLOB orders (`POST /v1/exchange/orders`) and RFQ quotes use `X-Sandbox-Maker-Key` equal to `SANDBOX_MAKER_KEY` (default `sandbox-maker-dev`). They do not use the execution JWT. Optional `X-Sandbox-Maker-Id` separates paper accounts. `POST /v1/exchange/orders/cancel` with `{ clientOrderId }` is a sandbox extension and is not in the frozen OpenAPI.

## Sandbox dev keys — not production

`dev-keys/execution-auth-public.pem` and `dev-keys/execution-auth-private.pem` are sandbox development keys. They control no funds and are not production keys. The private key is committed so Agent C and this service verify the same key on a laptop.

The seed is the 32 UTF-8 bytes of `switchboard-sandbox-auth-seed-v1`. `jose` 5.9.6 (and jose 6.1) does not export `generateKeyPairFromSeed`, so the PEMs are the standard Ed25519 PKCS#8 and SPKI forms of that seed: PKCS#8 prefix `302e020100300506032b657004220420` plus the seed. Agent C, using that same seed as the Ed25519 private-key seed, matches this public key.

Public JWK:

```json
{"crv":"Ed25519","x":"B2BwjhWC39PXHGVm7zdNbWBHdmlL2xt_HSg4jDDYnJs","kty":"OKP"}
```

## What a quote and an order mean

Sandbox instruments are `SERVICE_OUTAGE_BINARY`, `SERVICE_COST_CAP`, and `CONTINGENT_CAPACITY_OPTION`, plus an unverified capacity offer (`verifiedCapacity: false`). Prices walk the in-memory book and add the sandbox fee schedule (`switchboard-sandbox-fee-v1`). Depth short of the requested quantity is not executable.

A sandbox book fill is returned as `SIMULATED` with `syntheticDemo: true`. This service does not return `FILLED` with `syntheticDemo: false`. Kalshi and Polymarket US order attempts return `403`. A US jurisdiction cannot execute Polymarket International; those rows are reference only and are not described as arbitrage. A weather contract is not a direct hedge for a cloud outage.

`companyId=co_demo_ai` plus header `X-Demo-Fixture: market-search` returns `fixtures/market-search.json` unchanged.

Kalshi, when `KALSHI_ENABLED` is not `false`, may attach a public read-only row. That row is not an order path. Polymarket books are not invented. Setting `POLYMARKET_US_API_KEY` does not create a live book.
