# AP4M go-live checklist

The live payment code is already in `services/execution/src/ap4m-live.ts`. Going live is a matter of getting values from the Mastercard hackathon portal, putting them in Vercel, and checking them before the demo. Team name is **Penn1**.

## 1. Get these from the portal

| What | Variable | Notes |
| --- | --- | --- |
| Agent private key | `AP4M_AGENT_PRIVATE_KEY` | 64 hex characters. The agent wallet that signs vouchers. Never commit it. |
| A real HTTP 402 resource | `AP4M_RESOURCE_URL` | Must be `https` and answer `GET` with HTTP 402 and a decimal price (`amount`, `amountUsd`, `maxAmountRequired`, `value`, or `price`). |
| Channel | `AP4M_CHANNEL_ID` or `AP4M_CHANNEL_CAP` | Either an existing channel id, or a cap in RLUSD for a new channel. |
| Merchant (optional) | `AP4M_MERCHANT_ID` | Must not be the agent wallet. |
| Funded testnet budget | (none) | Fund the agent wallet with testnet RLUSD in the portal. |

Also set `AP4M_MODE=live` and `AP4M_TEAM_NAME=Penn1`. The public demo fills in the team name itself, but the check and the pay route below read it from the environment.

Leave these alone unless the portal says otherwise: `AP4M_BASE_URL` (defaults to `https://hackathon.ap4m.build`) and `AP4M_PAYMENT_LEDGER` (defaults to the hackathon PaymentLedger).

## 2. Put them in Vercel, not in the repo

Project `switchboard-hackathon`, Settings, Environment Variables, Production. Or from `switchboard-starter`:

```bash
npx vercel env add AP4M_AGENT_PRIVATE_KEY production
npx vercel env add AP4M_MODE production          # value: live
npx vercel env add AP4M_TEAM_NAME production     # value: Penn1
npx vercel env add AP4M_RESOURCE_URL production
npx vercel env add AP4M_CHANNEL_CAP production   # or AP4M_CHANNEL_ID
```

## 3. Check before you demo

This check is read-only. It never signs in, signs a voucher, opens a channel, or moves funds.

```bash
cd switchboard-starter
npx vercel env pull .env.ap4m --environment=production
pnpm ap4m:check --env-file .env.ap4m
```

Every line should say `PASS`:

- **Variables**: all required names are set.
- **Agent key format**: 64 hex characters.
- **AP4M API**: the portal host answers. A `FAIL` here usually means the portal is down again.
- **HTTP 402 resource**: the resource returns 402 with a price.
- **XRPL EVM RPC**: chain id 1449000. Uses QuickNode when `QUICKNODE_RPC_URL` is set.

## 4. Run one live payment

This step spends testnet RLUSD from the agent wallet. The pay route is on the execution service, which you run locally. It is not exposed on the public Vercel demo.

```bash
cd switchboard-starter/services/execution
npx tsx --env-file=../../.env.ap4m src/index.ts      # listens on :4103
```

In another terminal:

```bash
curl -s -X POST http://127.0.0.1:4103/v1/execution/ap4m/pay \
  -H "authorization: Bearer switchboard-dev-platform-token" \
  -H "idempotency-key: $(uuidgen)"
```

The response has `stepsRun`, `txHash`, `payoutTx`, and `settled`. `settled` is `true` only when the portal's settle call returns a real 32-byte payout transaction. Use `txHash` and `payoutTx` in the XRPL EVM testnet explorer for the demo.

When you are done, delete the pulled file. It holds the private key, and `.env*` files are gitignored but should not linger:

```bash
rm ../../.env.ap4m
```

## If the portal is still down at demo time

Run the demo as it is. The outage drill stops at `VOUCHER_SIGNED`, and the page says plainly that this is not a VoucherRedeemed event or an RLUSD payout. See the "portal down" version in `DEMO_SCRIPT.md`.
