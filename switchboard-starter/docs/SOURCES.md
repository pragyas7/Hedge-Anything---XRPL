# Technical references checked 2026-10-24

1. Mastercard AP4M Hackathon Developer Guide — https://hackathon.ap4m.build/integration-guide (EVM testnet chain 1449000, x402 workflow, judging, voucher redeemed and merchant RLUSD settlement; hackathon-only SDK).
2. XRPL EVM Networks — https://docs.xrplevm.org/pages/operators/resources/networks and https://docs.xrplevm.org/pages/developers/interacting-with-evm/interact-with-the-smart-contract (network IDs and RPC).
3. Kalshi API overview — https://help.kalshi.com/en/articles/13823854-kalshi-api ; fee rules — https://help.kalshi.com/en/articles/13823805-fees . Different market fees possible; refresh dynamically.
4. Polymarket US read-only API — https://docs.polymarket.us/data-guide/overview ; US authenticated API entry — https://polymarket.us/developer . Separate from international API and account.
5. Polymarket US versus International — https://help.polymarket.com/en/articles/15458828-website-vs-app-what-s-the-difference ; geographical restrictions — https://help.polymarket.com/en/articles/13364163-geographic-restrictions . US international trading restricted.
6. Polymarket International fee schedules — https://help.polymarket.com/en/articles/13364478-trading-fees ; **do not reuse these as Polymarket US fee schedule**. US exchange fee filing: https://www.polymarketexchange.com/files/notices/Exchange%20Fees%20Update%20%282026.03.27%29.pdf (verify currently effective schedule before use).
7. Ledger Agent Intent — https://developers.ledger.com/docs/ai-tools/agent-intent (beta, current supported ETH/SOL transactions, signer budget patterns); Ledger DMK Ethereum Signer — https://developers.ledger.com/docs/device-interaction/dmk-ts/references/signers/eth .
8. CFTC prediction market education and exchange/intermediary requirements — https://www.cftc.gov/LearnandProtect/PredictionMarkets .
9. XRPL Commons hackathon prize portal — https://hackathons.xrpl-commons.org/hackathons/ai-fintech-xrp-ledger-hackathon-f78ed817?tab=prizes ; individual cards rendered dynamically and must be reconfirmed manually.

No market prices, actual instruments, or active customer eligibility were established by these references. Illustrative quotes in `fixtures/` are explicitly synthetic.
