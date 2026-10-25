# Switchboard demo: theme and UI principles

The public page (`demo/page.ts`) uses one theme. Change the tokens below in `:root`, not in individual rules.

## Theme

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#000000` | Page background |
| `--raised` | `#0a0a0a` | The hedge slip, the composer, an open market row |
| `--raised-2` | `#121212` | Chips and controls inside a raised surface |
| `--line` | `#1f1f1f` | Row dividers and section rules |
| `--line-2` | `#2e2e2e` | Borders on controls and the slip |
| `--text` | `#ededed` | Primary text |
| `--muted` | `#a1a1a1` | Secondary text, labels |
| `--faint` | `#6e6e6e` | Table headers, footnotes |
| `--yellow` | `#facc15` | The single accent |
| `--green` / `--red` | `#3fcf8e` / `#f2555a` | Order book bids and asks only |

Type is Geist for text and Geist Mono for figures: prices, chances, premiums, and loss amounts. Both load from Google Fonts and fall back to system fonts.

## Principles

1. **Black first, yellow on purpose.** Yellow marks what you act on or what is yours: the primary button, focus rings, the budget meter, coverage, and the market in your hedge. If everything is yellow, nothing is.
2. **One raised surface per screen.** The composer before pricing, the hedge slip after. Everything else sits on the page and is separated by space and 1px rules, not boxes.
3. **Figures line up.** Every number is in Geist Mono with tabular digits, right-aligned in tables.
4. **Color means data.** Green and red only appear in the order book. Status text is plain unless it is an exception, like "Reference only in the US".
5. **Say what is real.** Sandbox, synthetic, and in-app approval labels stay visible. No fake price history, no buttons that do nothing, no live-trade language.
6. **Progressive detail.** Rows show name, chance, ask, and bid. The order book, rules, basis risk, and fees open under the row.
7. **Quality floor.** Visible focus, keyboard reachable controls, reduced motion respected, and a single column below 640px.
