# Judge demo — coherent end-to-end Switchboard story

**0:00–0:30 / Business exposure.** Company states 'We operate an AI customer-support service with 1M inference calls/day; provider A costs $0.002/request, fallback B costs $0.006; outages threaten our SLA. We can spend $800/month hedging tail risk.' System extracts dependencies and asks user to confirm assumptions.

**0:30–1:00 / Hedge optimization.** Show scenario distribution, 95% tail loss, budget, eligible hedge alternatives. Search relevant Kalshi and Polymarket US contracts (when live listed, else clearly state 'no relevant direct contract'); Switchboard Exchange offers a **sandbox availability contract** and a firm **sandbox standby-capacity RFQ**. Compare all-in cost, depth and basis risk; demonstrate 'no trade' as valid.

**1:00–1:25 / Approval.** User reviews versioned portfolio and authorizes specified risk limits. If device supports the chosen chain/action, demonstrate actual Ledger hardware signer on supported action; otherwise demonstrate an actual separate supported signer action and clearly label XRPL EVM alternative approval mechanism. No claim of unsupported compatibility.

**1:25–2:35 / Live fault injection and AP4M.** Turn off primary service. Independent probes trigger verified failover; agent requests backup `/infer` endpoint, encounters HTTP 402, autonomously signs AP4M voucher, obtains response, merchant redeems voucher, observe `VoucherRedeemed` in XRPL EVM Testnet explorer and actual RLUSD payout; traffic recovers. Present retry and spend-limit controls.

**2:35–3:00 / Proof.** Show transaction receipt, ledger audit, remaining premium/collateral budget, original tail risk vs modeled residual. Short tagline: 'Prediction markets tell you what might happen. Switchboard creates and executes the financial and operational plan for when it does.'

## Honest provenance
- Company details and initial spot prices are **illustrative** unless supplied by a real user and independently verified.
- Switchboard Exchange quote and bespoke RFQ are **sandbox** until licensed.
- A real existing external event market is only referenced if discovered by API, eligible and resolves an appropriate risk. Otherwise demonstrate the comparison logic with labeled fixtures.
- Real AP4M transaction and RLUSD receipt are the non-negotiable live blockchain segment.
