# v0 design brief — give this prompt to v0

Build a polished desktop-first institutional fintech web dashboard called **Switchboard**: the financial operating system for any business exposure, with its own derivatives exchange. Design should feel like a modern risk terminal, *not* an insurance landing page or generic crypto dashboard. Use Next.js App Router, TypeScript, Tailwind, shadcn/ui, responsive dark/light themes, accessible forms and skeleton states.

Create these actual routes:
1. `/onboard` — company description textarea; structured editable exposures (business model, dependencies, scenario losses, horizon, max annual loss, max premium budget, jurisdiction); confidence badges and 'Confirm assumptions'.
2. `/risk` — risk-factor graph, scenario table, CVaR 95% before/after, downside distribution, exposure concentration and all-in hedge spend; state when losses are not hedgeable.
3. `/strategies` — three strategies, e.g. minimum-cost, max-downside reduction, balanced (ALL obey budget and eligibility); each has ranked financial and capacity legs; basis risk explanation; immutable review-and-approve modal; no autoplay trading.
4. `/markets` — search across Kalshi, Polymarket US, Switchboard Exchange, eligible capacity suppliers; side-by-side depth, matched payout rules, all-in fees, quote age, market eligibility; visually distinguish direct hedge vs proxy vs not comparable; `reference only` for international Polymarket in US mode.
5. `/exchange` — central limit order book terminal (instrument picker, maturity, strike, contract terms, order ladder, recent trades, collateral), plus RFQ composer and quote negotiation pane. Mark testnet/sandbox prominently.
6. `/operations` — active service dependency monitor, failure probe timeline, fallback candidate health/compatibility, AP4M HTTP 402 → voucher → redeemed → RLUSD settlement receipt; policy limits and halt switch.
7. `/activity` — audit ledger with proposal, approval, execution, fills, payments, service changes and verifiable tx references.

Global navigation: Overview / Risk / Strategies / Markets / Exchange / Operations / Activity. Header: organization, jurisdiction, mode banner, account/connected signer status. User should be able to do **one main action**: describe business → review recommendations → approve → observe executions.

Use chart skeletons or fixture data with a persistent 'Illustrative / Sandbox' marker. Do not imply real trades, verified risk reductions, or real provider guarantees. Avoid abstract AI agent cartoons. Use concise professional product copy. Make React components reusable and break at sensible page boundaries. Ship frontend as a clean v0-exportable Next.js project that can call a typed REST API from server-side route handlers. **Do not implement a backend in the frontend; no real money integrations in React.**

## Agent A integration instructions when UI arrives
- Place v0 export in `apps/web/` and preserve its visual design and component hierarchy.
- Replace fabricated source arrays with typed data from `packages/contracts/src/index.ts` API clients for A/B/C services.
- Keep mock mode via `NEXT_PUBLIC_DEMO_MODE=true`; label every synthetic value.
- Backend APIs remain backend-owned. UI must not infer real quote capability or action success.
- Add UI states: loading / stale quotes / no eligible hedge / unsupported venue / awaiting approval / partial fill / service failover pending / settlement pending.
- Never place venue trade credentials or AP4M wallet private key in browser code or environment variables with `NEXT_PUBLIC_`.
