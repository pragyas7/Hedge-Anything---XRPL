# Switchboard — Product Requirements & Engineering Specification
**Version:** 1.0 • **Date:** 2026-10-24 • **Status:** handoff-ready, strategic decisions locked; venue access and legal structure pending

## 0. Executive summary
**One-liner:** Switchboard turns a business's real-world exposure into the lowest-tail-risk portfolio of financial contracts, service substitutions, and standby capacity that fits its budget, then helps execute and operate that portfolio.

**Product identity:** (1) company risk operating system; (2) cross-venue discovery and execution platform; (3) eventually a **standalone derivatives exchange** with order books and bespoke RFQs. Not an insurance comparison website or a prediction-market front end. Insurance-like outcomes are one possible contract type.

**Non-negotiable user decisions**
- Audience: all businesses with hedgeable exposures, not just AI companies.
- Ontology: support arbitrary exposure domains on day one; prioritize concrete adapters for cloud/AI/API services.
- Execution: recommend → human approves precise strategy/capital terms → system executes; approved contingent failover can proceed autonomously within preauthorized limits.
- Exchange: native limit order book **and** bespoke RFQ market.
- Geography: US-first, explicit compliance/venue gates.
- Objective: minimize severe downside risk within a specified budget, not maximize predicted profit.
- Physical operations: actual workload failover, not solely financial settlement.
- Destination: standalone, deep derivatives venue after appropriate licensing/partnership.

## 1. User stories
1. As a business operator, I describe my company in natural language, then review structured exposures, dependency criticality, maximum tolerated loss/downtime, scenarios, risk horizon, and monthly hedge premium budget.
2. As a CFO/risk manager, I see an estimated unhedged 95% tail loss, projected tail loss after hedging, total premium and execution cost, impact by risk, and residual basis risk.
3. As a buyer, I compare equivalent or *partially* overlapping contracts across Kalshi, Polymarket US, eligible other providers, Switchboard order books, Switchboard RFQs, and actual service reservations. Each quote shows executable depth, payout conditions, fees, and an eligibility flag.
4. As a business operator, I approve a **specific, versioned** hedge plan with maximum notional, spend caps, whitelisted venues, expiries, and automation policy; the system refuses substitutions that invalidate approval.
5. As a digital-service business, I receive replacement service on a trigger if preauthorized; show the HTTP 402 request, autonomous purchasing decision, AP4M voucher and confirmed RLUSD merchant settlement.
6. As a market maker, I publish fully collateralized quotes in the Switchboard sandbox order book or answer RFQs; I receive executed fills and settlement evidence.
7. As an auditor, I can reconstruct who approved what, which price/depth was used, realized vs modeled payout, what oracle determined a trigger, and every on-chain receipt.

## 2. Core differentiator
Not 'create a market for any question.' The product makes risk *actionable*:
`Company description → structured risk factors → scenario loss distribution → candidate hedges & substitutes → basis-risk-aware optimization → approval → execution → trigger monitoring → financially/operationally effective recovery`.

The competitive moat combines (a) exposure-to-contract mapping, (b) settlement-rules-aware normalization across venues, (c) risk/basis-aware portfolio construction, (d) verified substitutability and execution capacity, and (e) liquidity from own exchange.

## 3. Scope: generic domain, concrete demonstration
**Universal risk schema:** Exposure has category (operational, commodity, climate, regulation, logistics, finance, digital, other), normalized risk factors, P&L function, horizon, currency, and testable loss scenarios. A plugin can provide domain-specific templates. The platform must accept a retail storm exposure or a compute outage via the *same* interfaces.

**First full demonstration:** A company using inference Provider A with Provider B as a qualified substitute. Inference cost can rise, A may fail, B may have too little capacity. Present Kalshi/Polymarket US event-market *candidates* only if specific relevant instruments exist; never invent listings. The own exchange can list synthetic sandbox availability/cost caps with explicit labeled synthetic quotes. Real AP4M purchases a fallback inference/API endpoint.

**Other examples for modeling/UX:** Importer exposed to shipping delays, retailer exposed to extreme weather, venue exposed to event cancellation, AI startup exposed to cloud token prices. Some will have no valid hedge; recommending 'no trade' is correct.

**Not v1 production promises:** universal data connectivity, institutional regulatory registration, live external trades without credentials and permissions, guaranteed risk elimination, magical API/model equivalence, undifferentiated oracle judgment.

## 4. Domain entities
- `CompanyProfile`: description, jurisdiction, business model, industry, base currency, constraints, contact/owner, risk-policy version.
- `ServiceDependency`: provider, region, API, task and quality benchmark, traffic, priority, substitute candidates.
- `RiskExposure`: quantifiable loss function over risk factors (not simply probability), horizon, scenarios, severity, observability, evidence confidence.
- `Scenario`: vector of risk-factor shocks, estimated business losses, provenance, shock correlation group, empirical/synthetic tag.
- `Instrument`: venue-qualified payoff contract, resolution source/rules, settlement window, contract unit, collateral, expiry, jurisdictions.
- `VenueQuote`: best executable side, depth curve, quote timestamp/TTL, fee breakdown, pricing currency, account/jurisdiction capability.
- `CapacityOffer`: alternative provider, quality requirements, reservation size, SLO, price, provisionability, proof of capacity, trigger.
- `HedgeCandidate`: financial leg or capacity leg; payoff function over scenarios; residual basis risk; availability/eligibility.
- `HedgePlan`: immutable, versioned strategy of legs, before/after loss distribution, premium+fees, max spend and guardrails, approval digest.
- `Approval`: signer, approved plan hash, expiry, max notional, allowed instruments, device-signing evidence, policy and status.
- `ExecutionRun`: independently idempotent per-leg actions, status, trade/funding/receipt references.
- `EventProof`: signed observation, independently verifiable resolution rule, timestamps, oracle policy, challenge state.
- `Position`: ownership/collateral, mark, maturity, settlement status, provenance.

## 5. Product experience
**Home / Risk workspace:** describe business; optional structured financial upload; explicit sensitive-data permission; a parsed summary **requiring user confirmation**. Risk waterfall: exposures, scenarios, downside, data reliability, allowed premium, worst-case limits.

**Strategy studio:** sliders for budget, CVaR confidence, tolerated loss, duration; scenario distribution; before/after severe loss; recommended legs with rationale, settlement rules, estimated execution all-in cost, residual exposures. Warnings for thin markets and correlated insurers.

**Markets terminal:** search risk factor; venue tabs; contract facts and payoff graph; comparable-group indicator; cross-venue fee/depth comparison; own exchange order book and RFQ ticket; links to original venue contract rules. 'Same subject' is not equivalent payout. US eligibility must be displayed.

**Exchange:** standard contract market (initial digital services), CLOB bid/ask, order matching with price-time priority, maker/taker fee accounting, full collateral lock for maximum possible net obligation; RFQ accept/decline, firm quote expiry, private bilateral negotiation; trade confirms only after collateral and settlement validation. Sandbox initially; no live US derivatives venue operation without approvals.

**Execution center:** explicit human plan approval; per-leg progress; ability to cancel unfilled orders (not settled positions); live external trade disabled until eligible, credentials present, and approval valid; Ledger signer prompt for permitted supported actions; dedicated agent spending budget funded in advance for AP4M, separate from discretionary hedge portfolio.

**Operations view:** monitor primary health, measured quality, fallback compatibility, reserved capacity; trigger timeline; rerouting attempt; response quality and settlement receipt; backtest actual vs predicted downside reduction.

## 6. Market normalization and comparison
`VenueAdapter` has `discover`, `getOrderBook`, `feeQuote`, `eligibility`, `placeOrder?`, `getOrder`, `cancelOrder`. Mark each method `live|sandbox|mock|unsupported`. Read-only venues are never labeled tradable.

Only group contracts as 'directly comparable' when **underlying event, resolution criteria/source, observation window, payout denomination, side direction and unit payout** substantially match. Otherwise group as `proxy_hedge` and quantify basis risk. Never present price differences between loosely similar instruments as arbitrage.

**Price at requested size** = sum of orderbook levels filled * respective prices + maker/taker/venue fee schedule + network fees + conversion/withdrawal fees + modeled slippage on unfilled size; report orderbook timestamp and max fillable size. For bespoke RFQ, use firm all-in quote after collateral charges. Time-to-settlement/counterparty risk must also appear.

**Current venues:** Kalshi official REST markets/orders; Polymarket US read-only data and, if authorized and authenticated, its separate trade API; Polymarket International displayed only as non-executable reference for US users; Switchboard own sandbox; verified service providers for capacity instruments. Do not reuse international Polymarket's fee formula as a US fee model. Fee tables are venue- and market-category-specific, versioned, and refreshed from current terms.

## 7. Risk engine: objective and math
Scenario index `s`; baseline monetary loss `L_s`; available leg `j` has scenario hedge payoff `H_{j,s}(q_j)` net of claims limitations; cost `C_j(q_j)` inclusive of premium, exchange fees, slippage, collateral opportunity cost when applicable; quantity `q_j` subject to capacity, lot size, account eligibility, and liquidity constraints.

`ResidualLoss_s(q) = L_s - Σ_j H_{j,s}(q_j) + Σ_j execution_or_basis_shortfall_{j,s}(q_j)`.

Minimize CVaR at confidence α (default 0.95) subject to `Σ C_j(q_j) ≤ hedge_budget`, user max per-venue concentration, position/notional limits, eligible instruments only, liquidity, expiry alignment, cash collateral, compliance, and executable offers. Implement sample-average CVaR via auxiliary `η` and `u_s ≥ 0` with `u_s ≥ ResidualLoss_s(q) - η`; objective `η + (1/((1-α)N)) Σ u_s` for equal-weight scenarios. For nonuniform weights use weighted form. **Costs included in residual economic loss and in the budget constraint must be shown consistently; do not double count.**

Use baseline no-hedge and simple cheapest-quote benchmarks. Candidate generation must include `NO_ACTION`. Report expected loss, p95, CVaR95, worst modeled loss, total premium, capital locked, coverage ratio, and sensitivity to false positives / correlation. For small prototypes use deterministic enumerative/grid-search optimizer then replace with MILP or stochastic optimizer. Invalid/unobservable oracle candidates excluded, not assigned arbitrary favorable payoffs.

**Basis risk** explicitly models mismatch between user's loss event and contract settlement event. Example: hurricane makes data center fail, but storm event market may settle with no outage or vice versa; stress both directions. Contract `resolutionRule` is the source of truth, not LLM inference.

## 8. First three Switchboard Exchange instruments
### E1. `SERVICE_OUTAGE_BINARY`
Underlying: independently probed service S, region R, interval T, specified failure threshold (e.g. ≥N minutes failed from M of K distributed probe quorum). Payoff: fixed RLUSD amount per unit if verified trigger. Source: signed multi-region probe observations and dispute rules. Fully collateralized maximum payout. Guard against manipulation by provider/buyer, correlated probe outages, endpoint ambiguities.

### E2. `SERVICE_COST_CAP`
Underlying: benchmark service-basket price in USD / million output tokens or normalized workload. Payout = `notional_units * max(benchmark_price - strike, 0)` capped by fully collateralized maximum payable amount; defined benchmark window and sampling cadence. Margin-free model only if full max loss collateral is posted. Cap notional and settle with bounded payout.

### E3. `CONTINGENT_CAPACITY_OPTION`
Underlying: capacity commitment (qualified model, throughput, latency, data residency) from seller. On objective trigger or buyer exercise within terms, buyer may consume Q capacity for fixed service price. Seller supplies API capability + refundable/forfeitable performance bond; exercise is distinct from verifying seller capacity. Provide fallback compensation if capacity is unavailable, with explicit cap. **No claim of actual guaranteed capacity without live load-test and reservation evidence.**

Own-market orders reference standardized `instrumentId`, side, size, limit price, expiry, nonce, account/eligibility. Matching engine uses price-time FIFO. Settlement operator consumes signed fill intents after checking funding and idempotency. RFQs reference a preagreed bounded payout formula and oracle. No discretionary general oracle without dispute mechanism.

## 9. Approval, execution, service failover
1. `DRAFT` plan generated and signed/hash-stamped by strategy service; quotes have TTL.
2. Client displays plan, venues, unit prices, max spend, and worst-case obligations; user presses Approve. Hardware-specific approval occurs only where supported and verified. For other routes, manual app approval plus wallet/venue authentication is explicitly labeled, **not called Ledger-hardware approved**.
3. Execution service verifies plan version/approval TTL and current quote/depth. If material difference, return `REAPPROVAL_REQUIRED`.
4. For each financial leg, use venue-specific eligibility and signer; record created/pending/partially filled/filled/rejected. Never call mocked trade a live fill.
5. For contingency-capacity legs, approval reserves a specific amount/whitelist and maximum per-trigger AP4M spend. Exercise can happen without new human approval **only within already-approved limits**.
6. When a primary fails, independent observations meet the rule; check alternate quality + availability; use HTTP 402 merchant; autonomously decide to pay; sign AP4M voucher using *separate funded agent wallet*; verify resource unlock; wait for VoucherRedeemed and merchant RLUSD settlement receipt; route request; log outcome.
7. Circuit breaker: disable retries/stop paying if proof missing, budget exceeded, suspicious cost inflation, provider quality drops, or receipt fails. Don't mark settled until on-chain confirmation and merchant balance receipt.

## 10. Security, privacy, legal
- US derivatives: a standalone exchange offering swaps/event contracts requires extensive review for CFTC/DCM/SEF/clearing/intermediary applicability; until licensed or under qualified partner, keep own matching in **non-financial testnet/sandbox**. Not cured by putting order book on chain. See CFTC guidance.
- KYC/AML, sanctions, business KYB, customer eligibility, jurisdiction, trading permissions as mandatory capabilities, default deny; international market cannot be traded from US via circumvention.
- Noncustodial where feasible; separate human-controlled trading funds, execution service keys, and agent AP4M spend wallet; secrets in KMS/Key Ring if appropriate; no secrets into LLM prompts/browser.
- Ledger Agent Intent beta currently supports Ethereum/Solana sends and certain swaps, **not XRPL EVM chain**. The adapter must capability-check and not claim unsupported hardware flows. For XRPL EVM, investigate direct Ledger Ethereum-signing via DMK with demonstrable chain-ID/clear-signing support. Safe fallback is explicit user wallet approval with clear disclosure.
- Use signed structured transaction intents, exact deterministic digest, timestamps, nonce, replay protection, expiry, target allowlist, immutable audit log, least privilege. Fail closed on unverified quote or stale signer evidence.
- Service credentials issued as short-lived scoped access; isolate workloads, sensitive company data encrypted at rest/in transit; no third-party market account credentials in browser.
- Oracle source selection, commitments, external audit, challenge window and administrative recovery; demonstrate clear settlement criteria.
- Observability: trace IDs, quote timestamps, duplicate detection, wallet balances, run state transitions, rate limits, and audit tamper evidence.

## 11. Engineering implementation target
TypeScript Node.js (Fastify or NestJS), Next.js v0 UI, Postgres, Redis, and a job queue (BullMQ or equivalent). `viem` for XRPL EVM; Solidity + Foundry for exchange contracts; typed API via OpenAPI/TS. Scenario optimizer may be Python if needed but expose stable REST contract (Agent A owns). AWS deployment optionally ECS/Fargate + RDS + ElastiCache + CloudWatch; QuickNode optional RPC/event data if supported on requested chain, fallback native RPC with transparent provider naming. Every external connector has `mock/read_only/live` capability flags, configurable by environment.

## 12. Acceptance criteria
**Onboarding:** 2 companies in different industries map to same `RiskExposure` schema. User reviews derived assumptions. If confidence insufficient, show missing data.
**Pricing:** Every displayed comparison shows timestamp, contract rules, executable volume, all-in cost, fees and 'direct/proxy/not comparable' label. Stale quotes excluded from execution.
**Optimization:** Worst-tail loss improves on a seeded scenario fixture within budget; a case with no useful eligible hedge returns NO_ACTION; infeasible constraints return informative error.
**Exchange:** Order book correct price-time priority; no overfill, no negative balances, idempotent fills; RFQ can expire; testnet fully collateralized capped payout can settle after objective proof.
**Approvals:** Unapproved/stale/materially changed plan cannot execute; per-venue eligibility enforced; duplicate submit does not create duplicate trades.
**AP4M:** Live HTTP 402 → autonomous voucher → VoucherRedeemed event → actual merchant RLUSD balance increase → working fallback response, with receipt hash.
**Failover:** Inject provider failure, verify trigger, allocate substitute throughput, stay within spend cap, and gracefully fail shut if fallback fails.
**Observability:** A single correlation ID threads strategy recommendation, approval, market orders, fallback payment, and receipts across services.

## 13. Roadmap (scope is ambitious, not constrained by hackathon coding time)
**Phase 0 Contract freeze:** types, sample payloads, API docs, feature flags, schema integration tests.
**Phase 1 Platform:** ingestion, profile extraction, scenario CVaR optimizer, read-only cross-venue explorer, sandbox exchange (CLOB + RFQ), plan approval, simulated execution.
**Phase 2 On-chain functional proof:** collateral/settlement EVM contracts, actual AP4M fallback purchase, merchant RLUSD settlement, supported Ledger authorization demonstration, live proof traces.
**Phase 3 Market-grade:** live venue integrations where permitted, ongoing position accounting, compliance controls, signed oracles/dispute system, independent market makers, capacity proof/reservations.
**Phase 4 Regulated standalone exchange:** legal-entity/venue structure, market surveillance, clearing/custody arrangements, approved listings, institutional liquidity, cross-asset risk products.

## 14. Non-goals / truth in demo
No promise of price arbitrage solely from different market prices, 'zero risk' via generic prediction markets, universal service interchangeability, automatic lawful derivatives venue operation, arbitrary cross-chain atomicity, or 'Ledger integration' achieved via a generic software wallet. Synthetic quote data MUST be labeled as fixture or sandbox at every UI touchpoint.
