# @switchboard/web

Switchboard desk. Next.js App Router on port **3000**. The browser talks only to same-origin route handlers. Those handlers call strategy (`4101`), markets (`4102`), and execution (`4103`).

Venue keys, AP4M keys, and the execution signing key are not in this app. `SWITCHBOARD_DEV_BEARER` is server-only. The default token is a local dev token, not production auth.

`NEXT_PUBLIC_DEMO_MODE` defaults to true and shows the Illustrative / Sandbox lamp. It is not a secret.

## Run

From `switchboard-starter`:

```bash
pnpm install
pnpm --filter @switchboard/strategy dev
pnpm --filter @switchboard/web dev
```

```bash
pnpm --filter @switchboard/web test
pnpm --filter @switchboard/web typecheck
```

Copy `apps/web/.env.example` if you need different base URLs.

If markets or execution is down, search and the operations monitor can show **fixture/sandbox** samples. Those rows are labeled and are not live Kalshi, Polymarket, Ledger, or AP4M. A plan is not marked approved unless execution returns status `APPROVED`.

Routes: `/` (Overview), `/onboard`, `/risk`, `/strategies`, `/markets`, `/exchange`, `/operations`, `/activity`.
