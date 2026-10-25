# Ledger approval

Built and tested on Speculos, Ledger's official device emulator running the real XRP app 2.8.1. The hackathon organizers accept Speculos in place of a physical device. Setup and run commands: [`ledger/speculos/README.md`](../ledger/speculos/README.md).

## How it works

1. The person reviews a hedge in the slip and clicks **Approve on Ledger**.
2. The server re-quotes. If the contracts changed or the premium rose, it stops and nothing is signed.
3. The emulated Ledger Stax shows an XRPL testnet `AccountSet` whose memo is the reviewed plan hash. The person checks the hash and holds to sign. The device screen is shown inside the slip.
4. `demo/ledger.ts` checks the signed transaction: it must be an `AccountSet` from the device account, signed by the device key, with exactly this plan hash, and the signature must verify. Anything else and nothing is ordered.
5. The transaction is submitted to XRPL testnet (`tesSUCCESS` required). Its hash becomes the approval proof: execution records `ledger_dmk_verified` with that hash as `deviceProofId`, then runs the sandbox orders.

Rejecting on the device, or not signing within 3 minutes, stops the run before any approval is opened. A review left on screen by an abandoned request is rejected automatically before the next one, on touch models.

## What it is not

- Not a physical device. Always say "Ledger emulator".
- Not Ledger Agent Intent, which does not support XRPL EVM chain 1449000. We sign a native XRPL testnet transaction instead.
- Not on the public Vercel page. The emulator runs on the presenting laptop, so `LEDGER_SPECULOS_URL` is unset on Vercel and the page uses in-app approval (`app_manual`), labeled as not a Ledger signature.

## Safety notes

- Execution accepts `ledger_dmk_verified` only when `LEDGER_DMK_VERIFIED=true`. The demo gateway sets it for its in-process execution service only when the emulator is configured, and only after it has verified the signature itself. Do not set `LEDGER_DMK_VERIFIED` anywhere else: the execution service on its own does not verify signatures.
- The emulator seed is random per checkout (`ledger/speculos/.seed`, gitignored). Never use the seed of a wallet that holds real funds.

## Tests

- `services/execution/test/ledger-verify.test.ts`: accepts the right signature; rejects another plan's hash, another account, a tampered signature, a memo changed after signing, a different transaction type, and garbage.
- `services/execution/test/demo-app.test.ts`: without the emulator, the Ledger routes are closed and a Ledger approval request orders nothing.
- End to end against Speculos and XRPL testnet, run by hand: approve, reject, and recovery from an abandoned review.

## With a physical Ledger

Swap the Speculos transport for `@ledgerhq/device-transport-kit-web-hid` (browser) or `-node-hid` (server) in `demo/ledger.ts`. The signing, verification, and submission code stays the same. The screen proxy and abandoned-review recovery are Speculos-only.
