# Ledger: fallback now, device path if one arrives

## Where it stands

- Plan approval is in-app (`app_manual`). The hedge slip says "In-app approval, not a Ledger signature."
- The page shows plain-language previews of XRPL transactions before any signature (footer, "XRPL transactions, previewed before any signature").
- The Ledger card says no device is connected. `ledger_agent_intent` is unsupported on XRPL EVM chain 1449000, and the page says so.
- The execution service has a `ledger_dmk_verified` approval method behind `LEDGER_DMK_VERIFIED=true`. It currently trusts the `deviceProofId` it is given and does not verify a signature, so it must not be switched on until the verification below exists.

## Fallback (default, no device)

Nothing to build. Demo the in-app approval as it is, and use this line:

> "Approval is in-app today, and the page says so. The previews at the bottom are the plain-language view a hardware signer would show. Ledger's Agent Intent does not support XRPL EVM yet, so we did not fake it."

Do not set `LEDGER_DMK_VERIFIED`. Do not describe the in-app checkbox as a Ledger signature anywhere.

## Device path (only with a physical Ledger in hand)

Go/no-go: start only if someone has a Ledger Nano S Plus, Nano X, Stax, or Flex, with the **XRP** app installed, and there are at least about four hours before the demo freeze. This is an estimate, not a measured figure. If either is missing, stay on the fallback.

What we would sign: an XRPL **testnet** `AccountSet` or 1-drop `Payment` from the device account, with a memo holding the plan hash. It moves no meaningful value and binds the device signature to the exact plan the human reviewed.

1. **Browser signer.** Add `@ledgerhq/device-management-kit` and `@ledgerhq/device-signer-kit-xrp` (0.3.0 at the time of writing). Bundle a small `demo/ledger.ts` with esbuild into a script the gateway serves. It connects over WebHID (Chrome or Edge only), reads the XRP address, and signs the memo transaction.
2. **Slip option.** When `LEDGER_APPROVAL=true` and the browser supports WebHID, the slip shows "Approve on Ledger" next to the in-app approval. Without either, the slip stays exactly as it is now. That is the fallback, and it is automatic.
3. **Server verification (required).** `/demo/execute` takes the signed transaction blob, checks that the signature verifies for the device public key, that the memo equals the plan hash, and that the account matches the address read from the device. Only then does it confirm with `method: ledger_dmk_verified` and `deviceProofId` set to the signed transaction hash. Otherwise it refuses and nothing is ordered.
4. **Tighten the execution path.** Change `ledger_dmk_verified` so it no longer accepts an unverified `deviceProofId`, and add tests for a bad signature, a wrong memo, and a mismatched account.
5. **Page status.** The Ledger card shows "Device signed" with the signed transaction hash only after a verified signature, never before.

Before the demo: sign once on the real device, confirm the device screen shows the memo, and keep the transaction hash for the slide.

If no device arrives but there is spare time, Ledger's Speculos emulator can exercise steps 1 to 4. It is not evidence for the Ledger bounty; only a physical device is.
