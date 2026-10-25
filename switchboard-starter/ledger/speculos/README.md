# Ledger emulator for plan approvals

Speculos is Ledger's device emulator. It runs the real XRP app, shows the real screens, and makes real signatures. The hackathon organizers accept it in place of a physical Ledger.

```bash
cd switchboard-starter
pnpm ledger:emulator            # Ledger Stax. Or: pnpm ledger:emulator nanosp
LEDGER_SPECULOS_URL=http://127.0.0.1:5001 pnpm demo
```

Needs Docker running. The first `docker pull ghcr.io/ledgerhq/speculos:latest` takes a minute.

Open http://127.0.0.1:4110, price a hedge, and pick **Ledger** in the hedge slip. The device screen appears in the slip: click to tap, and keep the mouse down on **Hold to sign**. Check that the memo on the device ends in the same characters as the plan hash shown in the slip.

What happens on approve:

1. The demo re-quotes and refuses if the contracts changed or the premium rose.
2. The device signs an XRPL testnet `AccountSet` whose memo is the reviewed plan hash.
3. The server checks the signature, the account, the key, and the memo. Anything off and nothing is ordered.
4. The transaction is submitted to XRPL testnet. Its hash is the approval proof (`ledger_dmk_verified`), linked in the receipt.

The first approval funds the emulator's testnet account from the XRPL faucet. Rejecting on the device stops the run before any approval is opened.

On Vercel `LEDGER_SPECULOS_URL` is unset, so the public page keeps the in-app approval.

## Files

`apps/stax/app.elf` and `apps/nanosp/app.elf` are builds of [LedgerHQ/app-xrp](https://github.com/LedgerHQ/app-xrp) 2.8.1, copied from [LedgerHQ/device-management-kit-ts-workshop](https://github.com/LedgerHQ/device-management-kit-ts-workshop) (`xrpl-hackathon/speculos`, commit `4b85faa`). Apache-2.0, see `LICENSE`.
