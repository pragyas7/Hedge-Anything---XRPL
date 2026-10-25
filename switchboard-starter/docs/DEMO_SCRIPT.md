# Judge demo script

Live page: https://switchboard-hackathon.vercel.app. About three minutes. Open it on a laptop before you start; the first request after a cold start can take a few seconds.

Figures below are what the sandbox returns for the default inputs. The sandbox order book is shared, so premiums can move slightly after several runs. Read the numbers off the screen, not this page.

## 0:00 to 0:30. The problem

On the start screen, read the headline: "Hedge what can break your business."

> "An AI support company runs on one model API. When that API goes down, the product goes down. Prediction markets can price that risk, but nobody turns them into a hedge a business can actually buy and approve. Switchboard does."

The composer already holds the AI support desk description, with limits of $800 a month, $8,000 max loss, and Worst case. Point at the limits, then click **Analyze**.

Lead with this example. Do not open with Coastal retailer: it ends in a no-trade plan, which is correct but reads as a failure on stage.

## 0:30 to 1:00. The risk, in the company's own numbers

The analyzer returns four scenarios: normal operations, a price spike, a primary outage, and a correlated provider outage, with chances and losses.

> "These are template numbers. A real customer edits them. Nothing moves until a human confirms them."

Optionally change one loss to show it is editable. Click **Find markets**.

## 1:00 to 1:45. The market

The markets table lists contracts that pay out when the risk happens.

- The top row, **API unavailable ≥15 minutes (3 of 5 regions)**, has a yellow rail and "10 in your hedge". Its chance is the ask divided by the payout, about 1.8%.
- Click the row to open its **order book** and the exact rule it resolves on.
- Click **All** to show reference markets: a synthetic Kalshi listing and Polymarket International, which is reference only in the US. "We show what we can't buy, and why."

Scroll to **What your hedge pays**:

> "In the correlated outage, the hedge pays $10,000 against a $25,000 loss."

## 1:45 to 2:20. The hedge and the approval

On the right, the hedge slip shows the contract, the premium (about $183 of the $800 budget), and the monthly loss before and after: worst scenario about $25,000 to $15,183, and the average of the worst 5% about $9,000 to $5,183.

Click **Lowest cost** in the top bar to show it re-price in place, then click **Worst case** again.

Tick the approval box and click **Approve hedge**.

> "This is an in-app approval of this exact plan, not a hardware signature. On approve, Switchboard re-quotes. If the price rose or the contracts changed, it stops and asks again."

If asked about Ledger (no device): "Approval is in-app today, and the page says so. The previews at the bottom are the plain-language view a hardware signer would show. Ledger's Agent Intent does not support XRPL EVM yet, so we did not fake it." If the device path in `LEDGER_PLAN.md` was built in time, approve on the Ledger instead and show the memo with the plan hash on the device screen.

## 2:20 to 2:50. Execution and the agent payment

The slip becomes a receipt: approval, sandbox orders, failover armed, outage drill run, and the XRPL EVM testnet block it read.

Choose the version that matches the day.

**Portal still down:**

> "The orders are simulated sandbox fills. In the outage drill, the agent decides to pay for backup capacity inside the $25 budget the human approved, and signs a mock voucher. The live Mastercard Agent Pay code is built, but the portal is down, so this is not a redeemed voucher or an RLUSD payout, and the page says so."

**Portal back and the live payment ran** (see `AP4M_CHECKLIST.md`, step 4, done before the demo):

> "Here is the real one." Open the `txHash` and `payoutTx` from the pay run in the XRPL EVM testnet explorer. "The agent read an HTTP 402, paid with a voucher inside its approved budget, and the merchant was paid in RLUSD. No human approved that payment. The human approved the budget."

## 2:50 to 3:00. Close

Open **Integrations on this deploy** at the bottom to show the honest status of each sponsor.

> "Prediction markets tell you what might happen. Switchboard turns that into a hedge you can approve, and an agent that pays for the backup when it does."

## If something goes wrong

- **A step fails or hangs:** click **Run sample** in the top bar. It runs the whole flow in one request and fills every panel.
- **The market moved:** if the slip says to review again after you approve, that is the re-quote guard working. Approve once more.

## Honest provenance

- Company details and scenario numbers are illustrative templates until a real user supplies them.
- Switchboard exchange prices and order books are sandbox. Kalshi and Polymarket rows are synthetic examples, not live listings.
- Orders are `SIMULATED`. Nothing reaches a live US derivatives venue.
- Approval is in-app (`app_manual`), not a Ledger signature. Ledger Agent Intent is unsupported on XRPL EVM chain 1449000, and the page says no device is connected.
- An RLUSD payout is claimed only with a real payout transaction from the AP4M settle call.
