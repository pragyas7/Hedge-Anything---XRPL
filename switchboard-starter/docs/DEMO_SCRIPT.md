# Judge demo script

About three minutes. Present from the laptop so the Ledger step works. Before you start, in `switchboard-starter`:

```bash
pnpm ledger:emulator                                   # Docker must be running
LEDGER_SPECULOS_URL=http://127.0.0.1:5001 pnpm demo    # then open http://127.0.0.1:4110 in Chrome
```

Click **Run sample** once to warm it up, then reload. The public page, https://switchboard-hackathon.vercel.app, is the backup: same flow, with in-app approval instead of the Ledger.

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
- Click **All**. If Kalshi answered, one row says **Live public price**: a real NYC temperature contract, read-only, and not in the hedge. "We show a live price, and we show why it does not hedge an API." If Kalshi did not answer, that row is the labeled synthetic weather example instead. Polymarket International stays reference only in the US.

Scroll to **What your hedge pays**:

> "In the correlated outage, the hedge pays $10,000 against a $25,000 loss."

## 1:45 to 2:20. The hedge and the approval

On the right, the hedge slip shows the contract, the premium (about $183 of the $800 budget), and the monthly loss before and after: worst scenario about $25,000 to $15,183, and the average of the worst 5% about $9,000 to $5,183.

Click **Lowest cost** in the top bar to show it re-price in place, then click **Worst case** again.

In the slip, **Ledger** is selected. Point at the hash ending under the button, then click **Approve on Ledger**. The Ledger Stax screen appears in the slip. Click the arrow through the four pages; on page 3, the memo ends in the same characters as the slip. Keep the mouse down on **Hold to sign**.

> "The plan hash is signed on a Ledger running the real XRP app. Our server verifies the signature, the account, and the hash, then puts the approval on XRPL testnet. Only then does anything get ordered. And it re-quotes first: if the price rose or the contracts changed, it stops."

This is Speculos, Ledger's official emulator, which the organizers accept in place of a device. Say "Ledger emulator", never "our Ledger device". Ledger's Agent Intent does not support XRPL EVM, so we sign a native XRPL transaction instead.

If the emulator is not running, the slip shows only the in-app approval: tick the box and click **Approve hedge**. Same flow, labeled as not a Ledger signature.

## 2:20 to 2:50. Execution and the agent payment

The slip becomes a receipt: the sandbox fill, the primary API going down, the XRPL EVM testnet block it read, and, after a Ledger approval, a link to the approval transaction on the XRPL testnet explorer. Open that link. The run trace is behind **Run trace**.

Choose the version that matches the day.

**Portal still down:**

> "The orders are simulated sandbox fills. In the outage drill, the agent decides to pay for backup capacity inside the $10 budget the human approved, and signs a mock voucher. The live Mastercard Agent Pay code is built, but the portal is down, so this is not a redeemed voucher or an RLUSD payout, and the page says so."

**Portal back and the live payment ran** (see `AP4M_CHECKLIST.md`, step 4, done before the demo):

> "Here is the real one." Open the `txHash` and `payoutTx` from the pay run in the XRPL EVM testnet explorer. "The agent read an HTTP 402, paid with a voucher inside its approved budget, and the merchant was paid in RLUSD. No human approved that payment. The human approved the budget."

## 2:50 to 3:00. Close

Open **Integrations** at the bottom to show the status of each sponsor. Ledger reads **Emulator connected** with its testnet account.

> "Prediction markets tell you what might happen. Switchboard turns that into a hedge you can approve, and an agent that pays for the backup when it does."

## If something goes wrong

- **A step fails or hangs:** click **Run sample** in the top bar. It runs the whole flow in one request and fills every panel.
- **The market moved:** if the slip says to review again after you approve, that is the re-quote guard working. Approve once more.

## Honest provenance

- Company details and scenario numbers are illustrative templates until a real user supplies them. The default company on screen is Northline Support.
- Switchboard exchange prices and order books are sandbox. A Kalshi row marked Live public price is a real public quote and is not buyable. If that row is missing, the weather example is synthetic. Polymarket International stays a synthetic reference.
- Orders are `SIMULATED`. Nothing reaches a live US derivatives venue.
- Ledger approval runs on Speculos, Ledger's emulator with the real XRP app, not a physical device. It signs a native XRPL testnet AccountSet; Ledger Agent Intent is unsupported on XRPL EVM chain 1449000. Without the emulator, approval is in-app (`app_manual`) and labeled as not a Ledger signature.
- An RLUSD payout is claimed only with a real payout transaction from the AP4M settle call.
