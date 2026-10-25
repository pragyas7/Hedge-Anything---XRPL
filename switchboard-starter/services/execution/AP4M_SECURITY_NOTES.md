# AP4M notes retained from public docs

Fetched 2026-10-24 from https://hackathon.ap4m.build/integration-guide (public).

These pages returned **Authentication required**. Their rules were not copied and their request bodies were not invented:

- https://hackathon.ap4m.build/docs/x402.md
- https://hackathon.ap4m.build/docs/api-reference.md
- https://hackathon.ap4m.build/AGENTS.md

## Rules printed on the public guide

- The SDK and guide are for the Mastercard XRPL Hackathon only. They are not production libraries.
- Network named on the guide: XRPL EVM Testnet, chain id **1449000**.
- The agent private key stays on the machine. The AP4M service does not receive it. Do not share private keys.
- Agent wallet and merchant payout address are separate. The payout address receives RLUSD and must differ from the agent wallet.
- `requestChannel()` opens a funded channel whose spending limit is chosen inside the team budget.
- Direct-payment steps named on the guide:
  1. EIP-712 voucher signature (local).
  2. `redeemVoucher()` — the agent pays XRP gas and calls the contract.
  3. `POST /record-redemption` with the tx hash.
  4. `recordSettlement` releases RLUSD to the merchant payout address (service).
  5. Optional `closeChannel` (service). The agent is described as doing steps 1–3 only.
- A strong demo requires an observed `VoucherRedeemed` event and an observed RLUSD balance change. This repository does not claim either.

## What this service does with that

`AP4M_MODE=mock` (the default) stops at failover state `VOUCHER_SIGNED`, spend `"0"`, `confirmed: false`, and `transactionHash` `synthetic_not_a_transaction`. It does not call `requestChannel`, `redeemVoucher`, `POST /record-redemption`, `recordSettlement`, or `closeChannel`.

`AP4M_MODE=live` without `AP4M_AGENT_PRIVATE_KEY` or `XRPL_EVM_RPC_URL` returns `UNVERIFIED` and does not create a voucher. If both are present, the client may compute a local HMAC-SHA256. That HMAC is **not** an EIP-712 AP4M voucher, is not broadcast, and the run stays `UNVERIFIED`. `rlusd_settlement` is confirmed only when `stateFromSettlementEvidence` sees mode `live`, `chainObserved`, `confirmed`, and a 32-byte `0x` hash. The HTTP path never sets `chainObserved`.

No live payment was executed in this session.
