# Hackathon bounty & demo evidence map (verify final portal card details)

**Main-track thesis:** Agentic Finance — financial autonomous risk discovery + portfolio construction and actual machine purchasing; Protocol Innovation if the novel collateralized derivatives venue is strongest. Choose one main track under the organizer's final rules; side-bounty eligibility must be independently verified.

| Sponsor | Functional contribution | Evidence judge can inspect | Responsible |
|---|---|---|---|
| Mastercard AP4M | Contingent fallback service triggers real autonomous purchase via HTTP 402, signed voucher, RLUSD settlement on XRPL EVM Testnet | 402 logs; voucher signing trace; VoucherRedeemed tx hash; merchant RLUSD received; service resumed; no per-payment approval | C |
| Ledger | Operator controls large plan risk: review exact max spend/collateral and authorize eligible onchain action via supported hardware signing. Or use officially supported Agent Intent intent on supported chain, never falsely claim XRPL EVM is supported | Physical signer confirmation / verified supported intent and signature; approved spend policy and rejected out-of-policy action | C (A surfaces workflow) |
| QuickNode | Where service supports selected chain, stream events/read transaction logs for collateral/hedge and AP4M settlement; verify chain support before claim | Named RPC chain, subscriptions, live event → dashboard update and explorer link | C, B for contract events |
| AWS | **Not pursued.** Parked on 2026-10-25: no time to stand up a real AgentCore runtime, and the prize is AWS credits. Code is kept behind `AWS_AGENTCORE_ENABLED=true`. | n/a | n/a |
| XRPL / EVM protocol | Native sandbox fully collateralized availability/cost contracts and auditable settlement | Verified deployment/contract ABI and testnet transaction, bounded liability test | B + C |

**Important:** AP4M official guide is hackathon-only. It demands autonomous 402 read and payment, VoucherRedeemed, **actual** RLUSD merchant payout, live demo; direct pre-signed transaction without 402 is weaker. Ledger Agent Intent beta at the date of this spec explicitly lists ETH/SOL actions, not XRPL EVM, so investigate DMK signing rather than claiming cross-chain support. Exact QuickNode/AWS sponsor criteria and eligible main tracks could not be fully verified from JS-only prize portal; do not promise prize eligibility from this architecture alone.

**What not to do:** force AP4M into unrelated cash-settled derivatives as a decorative microcharge. The paid fallback endpoint is the truly necessary agentic service transaction. Never require human approval *at the moment of AP4M voucher signing*: the human preauthorizes the budget and policy instead.
