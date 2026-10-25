import type { ClearSignPreview } from "../services/execution/src/clear-sign.js";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

/**
 * The public demo page. Client script below is plain ES2020 with no template literals or
 * backslashes, because it lives inside this TypeScript template string.
 */
export function renderPage(previews: ClearSignPreview[]): string {
  const cards = previews.map((preview) => `
          <article class="preview">
            <h4>${escapeHtml(preview.transactionType)}</h4>
            <p>${escapeHtml(preview.summary.replace(/\s*Nothing was signed\.?/g, ""))}</p>
          </article>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Switchboard: hedge what can break your business</title>
  <meta name="theme-color" content="#000000" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #000000;
      --raised: #0a0a0a;
      --raised-2: #121212;
      --hover: rgba(255, 255, 255, 0.04);
      --line: #1f1f1f;
      --line-2: #2e2e2e;
      --text: #ededed;
      --muted: #a1a1a1;
      --faint: #6e6e6e;
      --yellow: #facc15;
      --yellow-hover: #fde047;
      --yellow-dim: rgba(250, 204, 21, 0.14);
      --green: #3fcf8e;
      --red: #f2555a;
      --amber: #facc15;
      --mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0; background: var(--bg); color: var(--text); overflow-x: hidden;
      font: 400 14px/1.55 "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; letter-spacing: -0.005em;
    }
    h1, h2, h3, h4, p { margin: 0; }
    h1, h2, h3, h4 { font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; }
    button, input, select, textarea { font: inherit; color: inherit; letter-spacing: inherit; }
    button { cursor: pointer; }
    :focus-visible { outline: 2px solid var(--yellow); outline-offset: 2px; }
    ::selection { background: var(--yellow); color: #000; }
    [hidden] { display: none !important; }
    .muted { color: var(--muted); }
    .faint { color: var(--faint); }
    .up { color: var(--yellow); }
    .down { color: var(--red); }

    /* Buttons */
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; height: 34px; padding: 0 0.9rem; border-radius: 8px; border: 1px solid transparent; font-weight: 500; font-size: 13.5px; white-space: nowrap; transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease; }
    .btn-primary { background: var(--yellow); color: #000; font-weight: 600; }
    .btn-primary:hover { background: var(--yellow-hover); }
    .btn-primary:disabled { background: #1c1c1c; color: #8a8a8a; box-shadow: inset 0 0 0 1px #2e2e2e; opacity: 1; }
    .btn-ghost { background: var(--raised); border-color: var(--line-2); color: var(--text); }
    .btn-ghost:hover { background: #1a1a1a; border-color: #3a3a3a; }
    .btn-lg { height: 42px; font-size: 14.5px; border-radius: 10px; width: 100%; }
    .btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .link { background: none; border: 0; padding: 0; color: var(--muted); font-size: 13px; }
    .link:hover { color: var(--yellow); }

    /* Top bar */
    .topbar { position: sticky; top: 0; z-index: 20; height: 56px; display: flex; align-items: center; gap: 1rem; padding: 0 1.5rem; background: rgba(0, 0, 0, 0.75); backdrop-filter: saturate(160%) blur(12px); border-bottom: 1px solid var(--line); }
    .brand { display: flex; align-items: center; gap: 0.55rem; font-weight: 600; font-size: 15px; letter-spacing: -0.02em; }
    .mark { width: 20px; height: 20px; border-radius: 6px; background: var(--yellow); position: relative; }
    .mark::after { content: ""; position: absolute; left: 5px; right: 5px; top: 9px; height: 2px; border-radius: 1px; background: #000; box-shadow: 0 -4px 0 #000, 0 4px 0 #000; }
    .top-right { margin-left: auto; display: flex; align-items: center; gap: 1rem; }
    .sandbox { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 13px; color: var(--muted); }
    .sandbox i { width: 6px; height: 6px; border-radius: 50%; background: var(--yellow); box-shadow: 0 0 0 3px var(--yellow-dim); }

    /* Intro (before markets are priced) */
    .intro { position: relative; max-width: 800px; margin: 0 auto; padding: 5.5rem 1.5rem 4rem; }
    .backdrop { position: absolute; top: 0; left: 50%; width: 100vw; transform: translateX(-50%); height: 640px; z-index: -1; pointer-events: none; overflow: hidden; }
    .backdrop::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(to right, rgba(255, 255, 255, 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.045) 1px, transparent 1px); background-size: 56px 56px; -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%); mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%); }
    .backdrop::after { content: ""; position: absolute; left: 50%; top: -220px; width: 760px; height: 440px; transform: translateX(-50%); background: radial-gradient(closest-side, rgba(250, 204, 21, 0.16), transparent); filter: blur(10px); }
    .pill { display: inline-flex; align-items: center; gap: 0.5rem; height: 28px; padding: 0 0.75rem; border-radius: 999px; border: 1px solid var(--line-2); background: rgba(10, 10, 10, 0.8); font-size: 12.5px; color: var(--muted); margin-bottom: 1.5rem; }
    .pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--yellow); box-shadow: 0 0 0 3px var(--yellow-dim); }
    .pill b { color: var(--text); font-weight: 500; }
    .intro.compact { padding-top: 3rem; }
    .hero h1 { font-size: clamp(2.1rem, 5vw, 3.1rem); letter-spacing: -0.04em; line-height: 1.05; font-weight: 600; }
    .hero p { color: var(--muted); font-size: 16px; margin-top: 0.9rem; max-width: 54ch; line-height: 1.6; }
    .composer { margin-top: 2.25rem; background: rgba(10, 10, 10, 0.92); box-shadow: 0 16px 50px rgba(0, 0, 0, 0.6); border: 1px solid var(--line-2); border-radius: 16px; padding: 0.9rem 0.9rem 0.75rem 1rem; transition: border-color 150ms ease, box-shadow 150ms ease; }
    .composer:focus-within { border-color: rgba(250, 204, 21, 0.55); box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.08); }
    .composer textarea { display: block; width: 100%; min-height: 3.4rem; max-height: 12rem; resize: none; border: 0; outline: none; background: transparent; font-size: 15.5px; line-height: 1.55; padding: 0.15rem 0 0.6rem; }
    .composer textarea::placeholder { color: var(--faint); }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; }
    .chip { display: inline-flex; align-items: center; gap: 0.2rem; height: 32px; padding: 0 0.55rem; border-radius: 8px; background: var(--raised-2); border: 1px solid var(--line); font-size: 13px; color: var(--muted); }
    .chip:focus-within { border-color: var(--line-2); color: var(--text); }
    .chip input { width: 3.6ch; field-sizing: content; min-width: 1ch; border: 0; outline: none; background: transparent; color: var(--text); padding: 0 0.15rem 0 0.05rem; }
    .chip input.wide { width: 4.6ch; }
    .chip input[aria-invalid="true"] { color: var(--red); }
    .chip select { border: 0; outline: none; background: transparent; color: var(--text); padding: 0 0.1rem; appearance: none; -webkit-appearance: none; cursor: pointer; }
    .chip select option { background: var(--raised); }
    .chip .caret { width: 6px; height: 6px; border-right: 1.5px solid var(--faint); border-bottom: 1.5px solid var(--faint); transform: translateY(-2px) rotate(45deg); margin-left: 0.45rem; pointer-events: none; flex: none; }
    .toolbar .submit { margin-left: auto; display: flex; align-items: center; gap: 0.6rem; }
    .kbd { font-family: var(--mono); font-size: 11.5px; color: var(--faint); border: 1px solid var(--line-2); border-radius: 5px; padding: 0.05rem 0.35rem; }
    .examples { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 1.1rem; margin-top: 1rem; padding-left: 0.2rem; font-size: 13px; color: var(--faint); }
    .examples button { background: none; border: 0; padding: 0; color: var(--muted); font-size: 13px; }
    .examples button:hover { color: var(--yellow); }
    .intro-msg:empty { display: none; }

    /* Scenarios */
    .scenarios { margin-top: 2.5rem; }
    .scenarios-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; margin-bottom: 0.9rem; }
    .scenarios-head h2 { font-size: 15px; }
    .scenarios-head p { color: var(--muted); font-size: 13px; margin-top: 0.2rem; }
    .scenario-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .scenario { padding: 1rem 1rem 1rem 0; }
    .scenario + .scenario { padding-left: 1rem; border-left: 1px solid var(--line); }
    .scenario-label { font-size: 13px; color: var(--muted); min-height: 2.6em; line-height: 1.35; }
    .scenario-values { display: grid; gap: 0.2rem; margin-top: 0.4rem; }
    .inline { display: flex; align-items: baseline; gap: 0.2rem; border-radius: 6px; padding: 0.15rem 0.35rem; margin-left: -0.35rem; transition: background 120ms ease; }
    .inline:hover, .inline:focus-within { background: var(--hover); }
    .inline input { width: 4ch; field-sizing: content; min-width: 1ch; border: 0; outline: none; background: transparent; padding: 0; }
    .inline.big input { width: 6ch; }
    .inline.big input { font-family: var(--mono); font-size: 19px; font-weight: 500; letter-spacing: -0.03em; }
    .inline span { color: var(--faint); font-size: 13px; }
    .inline input[aria-invalid="true"] { color: var(--red); }
    .scenarios-foot { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.1rem; flex-wrap: wrap; }
    .scenarios-foot .btn { min-width: 150px; }
    .notes { margin-top: 1rem; font-size: 12.5px; color: var(--faint); }
    .notes summary { cursor: pointer; color: var(--muted); width: max-content; }
    .notes ul { margin: 0.5rem 0 0; padding-left: 1rem; display: grid; gap: 0.25rem; }

    /* Messages */
    .msg { font-size: 13px; margin-top: 0.75rem; display: flex; gap: 0.5rem; align-items: flex-start; }
    .msg::before { content: ""; width: 6px; height: 6px; border-radius: 50%; margin-top: 0.5em; flex: none; background: var(--muted); }
    .msg.warn { color: #fde68a; }
    .msg.warn::before { background: var(--amber); }
    .msg.bad { color: #ff8a8e; }
    .msg.bad::before { background: var(--red); }
    .msg.ok { color: var(--text); }
    .msg.ok::before { background: var(--yellow); }
    .msg.info { color: var(--muted); }
    .spinner { width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid rgba(255, 255, 255, 0.15); border-top-color: currentColor; animation: spin 0.7s linear infinite; flex: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .working { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--muted); font-size: 13px; }

    /* Desk (after pricing) */
    .desk { max-width: 1240px; margin: 0 auto; padding: 0 1.5rem 4rem; }
    .summary { display: flex; align-items: center; gap: 1.25rem; padding: 1.1rem 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
    .summary-name { font-weight: 600; font-size: 15px; letter-spacing: -0.015em; }
    .summary-facts { display: flex; gap: 1rem; color: var(--muted); font-size: 13px; flex-wrap: wrap; }
    .summary-right { margin-left: auto; display: flex; align-items: center; gap: 0.75rem; }
    .segmented { display: inline-flex; padding: 2px; border-radius: 9px; background: var(--raised); border: 1px solid var(--line); }
    .segmented button { border: 0; background: transparent; color: var(--muted); height: 28px; padding: 0 0.75rem; border-radius: 7px; font-size: 12.5px; font-weight: 500; }
    .segmented button[aria-pressed="true"] { background: #1c1c1c; color: var(--text); box-shadow: inset 0 0 0 1px var(--line-2); }
    .segmented button:hover:not([aria-pressed="true"]) { color: var(--text); }
    .columns { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 3rem; padding-top: 2rem; align-items: start; }

    /* Markets table */
    .markets-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .markets-head h2 { font-size: 15px; }
    .tabs { display: flex; gap: 0.25rem; }
    .tab { border: 0; background: none; color: var(--faint); font-size: 13px; padding: 0.25rem 0.5rem; border-radius: 6px; }
    .tab[aria-pressed="true"] { color: var(--text); background: #161616; box-shadow: inset 0 0 0 1px var(--line); }
    .tab:hover { color: var(--text); }
    .thead, .row { display: grid; grid-template-columns: minmax(0, 1fr) 6.5rem 5.5rem 5.5rem 1.25rem; gap: 1rem; align-items: center; padding: 0 0.75rem; }
    .thead { height: 34px; font-size: 12px; color: var(--faint); border-bottom: 1px solid var(--line); }
    .thead span:not(:first-child), .cell-num { text-align: right; }
    .market { border-bottom: 1px solid var(--line); }
    .row { width: 100%; min-height: 64px; padding-top: 0.75rem; padding-bottom: 0.75rem; background: none; border: 0; text-align: left; border-radius: 10px; transition: background 120ms ease; }
    .row:hover { background: var(--hover); }
    .market.open { border-bottom-color: transparent; }
    .market.held .row { box-shadow: inset 2px 0 0 var(--yellow); }
    .market.open .row { background: var(--raised); border-radius: 12px 12px 0 0; }
    .row-title { font-size: 14.5px; font-weight: 500; line-height: 1.4; }
    .row-meta { display: flex; flex-wrap: wrap; gap: 0.15rem 0.75rem; margin-top: 0.2rem; font-size: 12.5px; color: var(--faint); }
    .row-meta .held { color: var(--yellow); font-weight: 500; }
    .row-meta .flag { color: var(--muted); }
    .chance { font-family: var(--mono); font-size: 16px; font-weight: 500; letter-spacing: -0.02em; }
    .market.held .chance { color: var(--yellow); }
    .cell-num { font-family: var(--mono); font-size: 13.5px; }
    .cell-num small { font-family: "Geist", ui-sans-serif, system-ui, sans-serif; }
    .cell-num small { display: block; font-size: 11.5px; color: var(--faint); }
    .chev { justify-self: end; color: var(--faint); transition: transform 150ms ease; font-size: 15px; line-height: 1; }
    .market.open .chev { transform: rotate(90deg); color: var(--text); }
    .detail { background: var(--raised); border-radius: 0 0 12px 12px; padding: 0.5rem 0.75rem 1.25rem; margin-bottom: 0.5rem; }
    .detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 2rem; align-items: start; padding-top: 0.75rem; border-top: 1px solid var(--line); }
    .book { width: 100%; border-collapse: collapse; font-size: 12.5px; font-family: var(--mono); }
    .book th { font-family: "Geist", ui-sans-serif, system-ui, sans-serif; }
    .book th { font-weight: 400; font-size: 12px; color: var(--faint); text-align: left; padding: 0 0.5rem 0.4rem; }
    .book th:last-child, .book td:last-child { text-align: right; }
    .book td { position: relative; padding: 0.28rem 0.5rem; }
    .book td span { position: relative; }
    .book .depth { position: absolute; right: 0; top: 4px; bottom: 4px; border-radius: 3px; }
    .book .ask .px { color: var(--red); }
    .book .bid .px { color: var(--green); }
    .book .ask .depth { background: rgba(242, 85, 90, 0.1); }
    .book .bid .depth { background: rgba(63, 207, 142, 0.1); }
    .book .spread td { text-align: center; color: var(--faint); font-size: 12px; padding: 0.45rem; }
    dl.facts { margin: 0; }
    dl.facts div { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr); gap: 1rem; padding: 0.45rem 0; font-size: 13px; }
    dl.facts dt { color: var(--faint); }
    dl.facts dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
    .more { margin-top: 0.4rem; }
    .more summary { cursor: pointer; font-size: 12.5px; color: var(--muted); padding: 0.3rem 0; width: max-content; }
    .more summary:hover { color: var(--text); }
    .note-line { font-size: 13px; color: var(--muted); line-height: 1.6; }

    /* Coverage */
    .coverage { margin-top: 3rem; }
    .coverage h2 { font-size: 15px; }
    .coverage > p { color: var(--muted); font-size: 13px; margin-top: 0.2rem; }
    .cov-rows { margin-top: 1rem; border-top: 1px solid var(--line); }
    .cov-row { padding: 0.85rem 0; border-bottom: 1px solid var(--line); }
    .cov-top { display: flex; justify-content: space-between; gap: 1rem; font-size: 13.5px; }
    .cov-top small { color: var(--faint); font-size: 12.5px; margin-left: 0.5rem; }
    .cov-top span:last-child { color: var(--muted); white-space: nowrap; }
    .cov-top b { color: var(--text); font-weight: 500; }
    .cov-bar { position: relative; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.06); margin-top: 0.6rem; overflow: hidden; }
    .cov-bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; }
    .cov-bar .loss { background: rgba(255, 255, 255, 0.18); }
    .cov-bar .covered { background: var(--yellow); }

    /* Slip */
    .slip-col { position: sticky; top: 80px; }
    .slip { position: relative; background: var(--raised); border: 1px solid var(--line-2); border-radius: 16px; overflow: hidden; }
    .slip::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--yellow), transparent); opacity: 0.8; }
    .slip-head { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.15rem; border-bottom: 1px solid var(--line); }
    .slip-head h2 { font-size: 14px; }
    .slip-head span { font-size: 12px; color: var(--faint); }
    .slip-sec { padding: 1rem 1.15rem; border-bottom: 1px solid var(--line); }
    .slip-sec:last-child { border-bottom: 0; }
    .leg { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.15rem 1rem; }
    .leg + .leg { margin-top: 0.85rem; }
    .leg-name { font-size: 13.5px; font-weight: 500; line-height: 1.4; }
    .leg-cost { font-family: var(--mono); font-size: 13px; text-align: right; }
    .leg-sub { grid-column: 1 / -1; font-size: 12.5px; color: var(--faint); }
    .line-item { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; font-size: 13px; color: var(--muted); }
    .line-item + .line-item { margin-top: 0.55rem; }
    .line-item b { color: var(--text); font-weight: 500; }
    .line-item > span:last-child { font-family: var(--mono); font-size: 12.5px; }
    .total { display: flex; justify-content: space-between; align-items: baseline; }
    .total span { font-size: 13px; color: var(--muted); }
    .total strong { font-family: var(--mono); font-size: 26px; font-weight: 500; letter-spacing: -0.04em; }
    .meter { height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.07); margin: 0.7rem 0 0.4rem; overflow: hidden; }
    .meter i { display: block; height: 100%; border-radius: 2px; background: var(--yellow); box-shadow: 0 0 12px rgba(250, 204, 21, 0.45); }
    .meter-label { font-size: 12px; color: var(--faint); }
    .arrow { color: var(--faint); margin: 0 0.35rem; }
    .consent { display: flex; gap: 0.6rem; align-items: flex-start; font-size: 12.5px; color: var(--muted); cursor: pointer; line-height: 1.5; }
    .consent input { margin: 0.15rem 0 0; width: 15px; height: 15px; accent-color: var(--yellow); flex: none; }
    .slip-cta { margin-top: 0.9rem; }
    .slip-foot { font-size: 11.5px; color: var(--faint); margin-top: 0.6rem; text-align: center; }
    .skeleton { display: grid; gap: 0.6rem; }
    .skeleton i { display: block; height: 10px; border-radius: 5px; background: linear-gradient(90deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04)); background-size: 200% 100%; animation: shimmer 1.4s ease infinite; }
    @keyframes shimmer { to { background-position: -200% 0; } }
    .receipt-head { display: flex; gap: 0.7rem; align-items: center; }
    .tick { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 14px; font-weight: 700; flex: none; }
    .tick.ok { background: var(--yellow-dim); color: var(--yellow); }
    .tick.bad { background: rgba(242, 85, 90, 0.14); color: var(--red); }
    .receipt-head strong { display: block; font-size: 14px; font-weight: 600; }
    .receipt-head span { font-size: 12.5px; color: var(--faint); }
    .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
    .steps li { display: flex; gap: 0.6rem; align-items: baseline; font-size: 13px; }
    .steps li::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--yellow); flex: none; transform: translateY(-1px); }
    .steps li.bad::before { background: var(--red); }
    .steps small { display: block; color: var(--faint); font-size: 12px; overflow-wrap: anywhere; }

    /* Footer */
    .footer { max-width: 1240px; margin: 0 auto; padding: 1rem 1.5rem 4rem; }
    .footer details { border-top: 1px solid var(--line); }
    .footer details:last-child { border-bottom: 1px solid var(--line); }
    .footer summary { list-style: none; cursor: pointer; padding: 1rem 0; font-size: 13px; color: var(--muted); display: flex; justify-content: space-between; }
    .footer summary::-webkit-details-marker { display: none; }
    .footer summary::after { content: "+"; color: var(--faint); }
    .footer details[open] summary::after { content: "−"; }
    .footer summary:hover, .footer details[open] summary { color: var(--text); }
    .footer .inner { padding: 0 0 1.5rem; font-size: 13px; color: var(--muted); }
    .sponsors { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem; }
    .sponsor h4 { font-size: 13.5px; font-weight: 500; color: var(--text); }
    .sponsor .state { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 12.5px; margin: 0.3rem 0 0.4rem; }
    .sponsor .state i { width: 6px; height: 6px; border-radius: 50%; }
    .sponsor p { font-size: 12.5px; color: var(--faint); line-height: 1.55; }
    .previews { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem; margin-top: 1rem; }
    .preview h4 { font-size: 13.5px; font-weight: 500; color: var(--text); }
    .preview p { font-size: 12.5px; color: var(--faint); margin-top: 0.3rem; line-height: 1.55; }
    .claims { margin: 0; padding-left: 1rem; display: grid; gap: 0.5rem; line-height: 1.55; }
    .claims strong { color: var(--text); font-weight: 500; }
    code { font-size: 0.9em; background: var(--raised-2); padding: 0.05rem 0.3rem; border-radius: 4px; }

    @media (max-width: 1020px) {
      .columns { grid-template-columns: 1fr; gap: 2.5rem; }
      .slip-col { position: static; }
    }
    @media (max-width: 640px) {
      .topbar { padding: 0 1rem; }
      .sandbox span { display: none; }
      .intro { padding: 3rem 1rem 3rem; }
      .toolbar .submit { width: 100%; margin-left: 0; margin-top: 0.25rem; }
      .toolbar .submit .btn { flex: 1; }
      .kbd { display: none; }
      .scenario-grid { grid-template-columns: 1fr 1fr; }
      .scenario { padding: 0.9rem 0.75rem 0.9rem 0; }
      .scenario + .scenario { padding-left: 0; border-left: 0; }
      .scenario:nth-child(even) { padding-left: 0.75rem; border-left: 1px solid var(--line); }
      .scenario:nth-child(n+3) { border-top: 1px solid var(--line); }
      .desk { padding: 0 1rem 3rem; }
      .summary-right { margin-left: 0; width: 100%; justify-content: space-between; }
      .thead, .row { grid-template-columns: minmax(0, 1fr) 4.5rem 4.5rem; padding: 0 0.5rem; }
      .row { padding-top: 0.75rem; padding-bottom: 0.75rem; }
      .thead .col-bid, .row .col-bid, .thead .col-chev, .row .chev { display: none; }
      .detail { padding: 0.5rem 0.5rem 1rem; }
      .detail-grid { grid-template-columns: 1fr; gap: 1.25rem; }
      .cov-top small { display: block; margin: 0.1rem 0 0; }
      .footer { padding: 1rem 1rem 3rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      * { transition: none !important; animation: none !important; }
    }
  </style>
</head>
<body>
<header class="topbar">
  <div class="brand"><span class="mark" aria-hidden="true"></span>Switchboard</div>
  <div class="top-right">
    <span class="sandbox"><i aria-hidden="true"></i><span>XRPL EVM testnet</span></span>
    <button class="btn btn-ghost" type="button" id="sample">Run sample</button>
  </div>
</header>

<section class="intro" id="intro">
  <div class="backdrop" id="backdrop" aria-hidden="true"></div>
  <div class="hero" id="hero">
    <span class="pill"><i aria-hidden="true"></i><b>Built on</b> XRPL EVM</span>
    <h1>Hedge what can break your business.</h1>
    <p>Describe what you depend on. Switchboard finds contracts that pay out when it fails and builds a hedge inside your budget.</p>
  </div>
  <form class="composer" id="intake" novalidate>
    <textarea id="desc" rows="2" placeholder="What does your business depend on, and what happens when it fails?" aria-label="What does your business depend on, and what happens when it fails?">AI customer-support service that depends on a primary model API</textarea>
    <div class="toolbar">
      <label class="chip" title="Where you operate">
        <select id="jurisdiction" aria-label="Where you operate">
          <option value="US">United States</option>
          <option value="EU">European Union</option>
          <option value="UK">United Kingdom</option>
          <option value="SG">Singapore</option>
        </select><span class="caret" aria-hidden="true"></span>
      </label>
      <label class="chip" title="Monthly hedge budget">$<input id="budget" type="text" inputmode="decimal" value="800" aria-label="Monthly hedge budget in USD" autocomplete="off" /><span>/mo</span></label>
      <label class="chip" title="Largest monthly loss you can absorb">$<input id="tail" class="wide" type="text" inputmode="decimal" value="8000" aria-label="Largest monthly loss you can absorb, USD" autocomplete="off" /><span>max loss</span></label>
      <label class="chip" title="What the optimizer favors"><span>Optimize</span>
        <select id="mode-select" aria-label="Optimize for">
          <option value="min_cvar">Worst case</option>
          <option value="balanced">Balanced</option>
          <option value="min_cost">Lowest cost</option>
        </select><span class="caret" aria-hidden="true"></span>
      </label>
      <span class="submit"><span class="kbd" aria-hidden="true">⌘ ↵</span><button class="btn btn-primary" type="submit" id="analyze">Analyze</button></span>
    </div>
  </form>
  <div class="examples" id="examples">
    <span>Try</span>
    <button type="button" data-example="0">AI support desk</button>
    <button type="button" data-example="1">Voice agent on a GPU cloud</button>
    <button type="button" data-example="2">Coastal retailer</button>
  </div>
  <div class="intro-msg" id="intro-msg"></div>
  <div id="scenarios"></div>
</section>

<section class="desk" id="desk" hidden>
  <div class="summary" id="summary"></div>
  <div class="columns">
    <main id="markets"></main>
    <aside class="slip-col"><section class="slip" id="slip" aria-live="polite" aria-label="Your hedge"></section></aside>
  </div>
</section>

<footer class="footer">
  <details>
    <summary>Integrations</summary>
    <div class="inner"><div class="sponsors" id="sponsors">Loading integrations…</div></div>
  </details>
  <details>
    <summary>XRPL transaction previews</summary>
    <div class="inner">
      <div class="previews">${cards}
      </div>
    </div>
  </details>
</footer>

<script>
(function () {
  var EXAMPLES = [
    'AI customer-support service that depends on a primary model API',
    'Voice agent startup running LLM inference on one GPU cloud provider, where an outage or token price spike hurts margins',
    'Retail operator with coastal stores and storm-related delivery delays'
  ];
  var MODES = [['min_cvar', 'Worst case'], ['balanced', 'Balanced'], ['min_cost', 'Lowest cost']];
  var VENUE = {
    switchboard: 'Switchboard',
    kalshi: 'Kalshi',
    polymarket_us: 'Polymarket US',
    polymarket_international: 'Polymarket Intl',
    capacity_provider: 'Capacity provider'
  };
  var SETTLEMENT = {
    binary: 'Fixed payout if it happens',
    capped_call: 'Pays above a threshold, capped',
    capacity_option: 'Right to reserved capacity'
  };
  var STEP = {
    analyze: 'Read your company',
    search: 'Re-quoted the market',
    plan: 'Rebuilt the hedge',
    orders: 'Checked for trades',
    approval: 'Opened approval',
    confirm: 'Approved in app',
    run: 'Placed orders',
    arm: 'Armed failover',
    failover: 'Ran outage drill'
  };
  var MONEY = /^[0-9]+([.][0-9]+)?$/;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    phase: 'idle',
    analysis: null,
    confirmed: false,
    quoted: null,
    selected: null,
    filter: 'buyable',
    mode: 'min_cvar',
    result: null,
    notice: null,
    error: null,
    busy: false
  };

  function $(id) { return document.getElementById(id); }

  function el(tag, props, kids) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'style') node.setAttribute('style', value);
        else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(value));
      });
    }
    (kids || []).forEach(function (kid) {
      if (kid === null || kid === undefined || kid === false) return;
      node.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function num(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  // Display only. Request bodies keep the exact decimal strings from the services.
  function usd(value) {
    if (value === null || value === undefined || value === '') return 'n/a';
    var parsed = Number(value);
    if (!isFinite(parsed)) return String(value);
    var whole = Math.abs(parsed) >= 100 || parsed % 1 === 0;
    return parsed.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  }

  function pct(fraction) { return Math.round(fraction * 10000) / 100; }

  function chanceText(fraction) {
    if (!(fraction > 0)) return '—';
    var value = fraction * 100;
    if (value < 1) return '<1%';
    return (value < 10 ? value.toFixed(1) : String(Math.round(value))) + '%';
  }

  function width(part, whole) {
    if (!(whole > 0)) return '0%';
    return Math.max(0, Math.min(100, (part / whole) * 100)).toFixed(2) + '%';
  }

  function isUs(value) {
    var j = String(value || '').trim().toLowerCase();
    return j === 'us' || j === 'usa' || j === 'united states' || j.indexOf('us-') === 0 || j.indexOf('us ') === 0;
  }

  function cleanName(name) {
    var text = String(name || 'Unnamed contract');
    if (text.indexOf('Synthetic ') === 0 && text.indexOf(': ') > 0) text = text.slice(text.indexOf(': ') + 2);
    if (text.indexOf('SYNTHETIC ') === 0) text = text.slice(10);
    if (text.indexOf('EXAMPLE ') === 0) text = text.slice(8);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function cleanLabel(text) {
    return String(text || '').replace(/\s*[(](fictional|synthetic)[)]/gi, '');
  }

  function companyName(name) {
    return cleanLabel(name).replace(/^Demo /, '');
  }

  function shortHash(hash) {
    var text = String(hash || '');
    return text.length > 16 ? text.slice(0, 8) + '…' + text.slice(-6) : text;
  }

  function message(tone, text) { return el('p', { class: 'msg ' + tone, role: tone === 'bad' ? 'alert' : 'status', text: text }); }
  function working(text) { return el('span', { class: 'working' }, [el('span', { class: 'spinner', 'aria-hidden': 'true' }), text]); }

  async function post(path, body) {
    try {
      var response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      var parsed = {};
      try { parsed = await response.json(); } catch (error) { parsed = {}; }
      return { status: response.status, ok: response.ok, body: parsed || {} };
    } catch (error) {
      return { status: 0, ok: false, body: { message: 'The server did not answer. Check your connection and try again.' } };
    }
  }

  function messageOf(body, fallback) {
    if (body && typeof body.message === 'string' && body.message.trim()) return body.message;
    return fallback;
  }

  function toTop() { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); }

  /* Views */

  function render() {
    var desk = state.phase === 'pricing' || state.phase === 'priced' || state.phase === 'error';
    $('intro').hidden = desk;
    $('desk').hidden = !desk;
    $('hero').hidden = state.phase !== 'idle';
    $('backdrop').hidden = state.phase !== 'idle';
    $('examples').hidden = state.phase !== 'idle';
    $('intro').classList.toggle('compact', state.phase !== 'idle');
    $('analyze').textContent = state.phase === 'review' ? 'Re-analyze' : 'Analyze';
    if (desk) {
      renderSummary();
      renderMarkets();
      renderSlip();
    } else {
      renderScenarios();
    }
  }

  /* Intake */

  function autoGrow() {
    var area = $('desc');
    area.style.height = 'auto';
    area.style.height = Math.min(area.scrollHeight, 192) + 'px';
  }
  $('desc').addEventListener('input', autoGrow);

  function inputsChanged() {
    clear($('intro-msg'));
    if (!state.analysis) return;
    state.analysis = null;
    state.confirmed = false;
    state.phase = 'draft';
    clear($('scenarios'));
    $('intro-msg').appendChild(message('info', 'Your description or limits changed. Analyze again to update the scenarios.'));
    render();
  }
  ['desc', 'budget', 'tail', 'jurisdiction'].forEach(function (id) { $(id).addEventListener('input', inputsChanged); });

  $('mode-select').addEventListener('change', function () { state.mode = $('mode-select').value; });

  $('desc').addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) $('intake').requestSubmit();
  });

  document.querySelectorAll('[data-example]').forEach(function (button) {
    button.addEventListener('click', function () {
      $('desc').value = EXAMPLES[Number(button.getAttribute('data-example'))];
      autoGrow();
      $('intake').requestSubmit();
    });
  });

  $('intake').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (state.busy) return;
    var description = $('desc').value.trim();
    var budget = $('budget').value.trim();
    var tail = $('tail').value.trim();
    $('budget').setAttribute('aria-invalid', String(!MONEY.test(budget)));
    $('tail').setAttribute('aria-invalid', String(!MONEY.test(tail)));
    clear($('intro-msg'));
    if (!description) {
      $('intro-msg').appendChild(message('bad', 'Describe the business first: what it depends on and what a bad month looks like.'));
      $('desc').focus();
      return;
    }
    if (!MONEY.test(budget) || !MONEY.test(tail)) {
      $('intro-msg').appendChild(message('bad', 'Enter the budget and max loss as plain numbers, like 800 or 8000.'));
      return;
    }
    state.busy = true;
    var button = $('analyze');
    button.disabled = true;
    clear(button);
    button.appendChild(el('span', { class: 'spinner', 'aria-hidden': 'true' }));
    button.appendChild(document.createTextNode('Analyzing'));
    var result = await post('/demo/analyze', {
      description: description,
      jurisdiction: $('jurisdiction').value,
      monthlyHedgeBudgetUsd: budget,
      maxTolerableTailLossUsd: tail
    });
    state.busy = false;
    button.disabled = false;
    if (!result.ok || !result.body.company) {
      render();
      $('intro-msg').appendChild(message('bad', messageOf(result.body, 'The analyzer could not read that. Say what the business depends on and what a failure costs.')));
      return;
    }
    state.analysis = result.body;
    state.confirmed = false;
    state.quoted = null;
    state.result = null;
    state.phase = 'review';
    render();
  });

  /* Scenarios */

  function scenarioSum(company) {
    return company.scenarios.reduce(function (sum, scenario) { return sum + Number(scenario.probability); }, 0);
  }

  function renderScenarios() {
    var root = $('scenarios');
    clear(root);
    if (state.phase !== 'review' || !state.analysis) return;
    var analysis = state.analysis;
    var company = analysis.company;
    var exposure = company.exposures[0];
    var check = el('div', {});
    var go = el('button', { class: 'btn btn-primary', type: 'button', id: 'confirm', onclick: confirmScenarios }, ['Find markets']);

    function refresh() {
      clear(check);
      var sum = scenarioSum(company);
      var badLoss = company.scenarios.some(function (scenario) { return !MONEY.test(String(scenario.baselineLossUsd)); });
      var badSum = !isFinite(sum) || Math.abs(sum - 1) > 0.001;
      if (badSum) check.appendChild(message('warn', 'Chances add up to ' + pct(sum || 0) + '%. Make them 100%.'));
      if (badLoss) check.appendChild(message('warn', 'Each loss needs to be a plain number, like 5000.'));
      go.disabled = badSum || badLoss;
    }

    var cells = company.scenarios.map(function (scenario) {
      var chance = el('input', { type: 'text', inputmode: 'decimal', value: String(pct(Number(scenario.probability))), 'aria-label': 'Chance of ' + scenario.label + ' in a month, percent' });
      chance.addEventListener('input', function () {
        var value = Number(chance.value);
        scenario.probability = chance.value.trim() === '' || !isFinite(value) ? NaN : Math.round(value * 100) / 10000;
        chance.setAttribute('aria-invalid', String(!isFinite(scenario.probability)));
        refresh();
      });
      var loss = el('input', { type: 'text', inputmode: 'decimal', value: String(scenario.baselineLossUsd), 'aria-label': 'Loss if ' + scenario.label + ' happens, USD' });
      loss.addEventListener('input', function () {
        scenario.baselineLossUsd = loss.value.trim();
        loss.setAttribute('aria-invalid', String(!MONEY.test(scenario.baselineLossUsd)));
        refresh();
      });
      return el('div', { class: 'scenario' }, [
        el('p', { class: 'scenario-label', text: scenario.label }),
        el('div', { class: 'scenario-values' }, [
          el('label', { class: 'inline big' }, [el('span', { text: '$' }), loss]),
          el('label', { class: 'inline' }, [chance, el('span', { text: '% chance a month', style: 'white-space:nowrap' })])
        ])
      ]);
    });

    var notes = (analysis.assumptions || []).concat(analysis.warnings || []).filter(function (note) { return !/fictional|synthetic|sandbox|template/i.test(note); });
    root.appendChild(el('div', { class: 'scenarios' }, [
      el('div', { class: 'scenarios-head' }, [
        el('div', {}, [
          el('h2', { text: companyName(company.name) }),
          el('p', { text: (exposure ? exposure.label + '. ' : '') + 'Estimated from your description. Edit any number to match your business.' })
        ])
      ]),
      el('div', { class: 'scenario-grid' }, cells),
      check,
      el('div', { class: 'scenarios-foot' }, [
        exposure ? el('span', { class: 'faint', style: 'font-size:12.5px', text: 'Analyzer confidence ' + Math.round(exposure.confidence * 100) + '%' }) : el('span', {}),
        go
      ]),
      notes.length ? el('details', { class: 'notes' }, [
        el('summary', { text: 'Analyzer notes' }),
        el('ul', {}, notes.map(function (note) { return el('li', { text: note }); }))
      ]) : null
    ]));
    refresh();
  }

  function confirmScenarios() {
    if (!state.analysis) return;
    state.analysis.company.confirmedByUser = true;
    state.confirmed = true;
    priceHedge();
  }

  function editCompany() {
    if (state.busy) return;
    state.confirmed = false;
    if (state.analysis) state.analysis.company.confirmedByUser = false;
    state.quoted = null;
    state.result = null;
    state.notice = null;
    state.phase = state.analysis ? 'review' : 'idle';
    render();
    toTop();
  }

  /* Pricing */

  async function priceHedge() {
    if (!state.analysis || state.busy) return;
    state.busy = true;
    state.phase = 'pricing';
    state.quoted = null;
    state.result = null;
    state.notice = null;
    render();
    toTop();
    var result = await post('/demo/quote', { company: state.analysis.company, mode: state.mode });
    state.busy = false;
    if (!result.ok || !result.body.plan) {
      state.phase = 'error';
      state.error = messageOf(result.body, 'The market search did not return a plan. Try again, or change your limits.');
      render();
      return;
    }
    acceptQuote(result.body);
  }

  function acceptQuote(body) {
    state.quoted = { search: body.search || null, plan: body.plan, books: body.books || [] };
    state.phase = 'priced';
    var held = marketItems().filter(function (item) { return item.held; })[0];
    state.selected = held ? held.id : null;
    render();
  }

  function setMode(mode) {
    if (state.mode === mode || state.busy) return;
    state.mode = mode;
    $('mode-select').value = mode;
    priceHedge();
  }

  /* Summary bar */

  function renderSummary() {
    var root = $('summary');
    clear(root);
    var company = state.analysis && state.analysis.company;
    if (!company) return;
    var jurisdiction = $('jurisdiction');
    var place = jurisdiction.options[jurisdiction.selectedIndex] ? jurisdiction.options[jurisdiction.selectedIndex].text : company.jurisdiction;
    root.appendChild(el('span', { class: 'summary-name', text: companyName(company.name) }));
    root.appendChild(el('span', { class: 'summary-facts' }, [
      el('span', { text: place }),
      el('span', { text: usd(company.monthlyHedgeBudgetUsd) + ' a month' }),
      el('span', { text: usd(company.maxTolerableTailLossUsd) + ' max loss' })
    ]));
    root.appendChild(el('div', { class: 'summary-right' }, [
      el('div', { class: 'segmented', role: 'group', 'aria-label': 'Optimize for' }, MODES.map(function (mode) {
        return el('button', { type: 'button', 'aria-pressed': String(state.mode === mode[0]), onclick: function () { setMode(mode[0]); } }, [mode[1]]);
      })),
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: editCompany }, ['Edit'])
    ]));
  }

  /* Markets */

  function quoteStatus(quote, jurisdiction) {
    if (isUs(jurisdiction) && quote.venue === 'polymarket_international') return { label: 'Reference only in the US', buyable: false };
    if (quote.capability === 'read_only') return { label: 'Read only', buyable: false };
    if (quote.capability === 'unsupported') return { label: 'Unsupported', buyable: false };
    if (quote.comparison === 'not_comparable') return { label: 'Not comparable to your risk', buyable: false };
    if (Date.parse(quote.expiresAt) <= Date.now()) return { label: 'Quote expired', buyable: false };
    if (quote.capability === 'sandbox') return { label: '', buyable: true };
    return { label: 'Live quote, not traded here', buyable: false };
  }

  function heldQuantity(plan, id) {
    if (!plan) return null;
    for (var i = 0; i < plan.legs.length; i += 1) {
      if (plan.legs[i].quoteId === id || plan.legs[i].capacityOfferId === id) return plan.legs[i].quantity;
    }
    return null;
  }

  function marketItems() {
    var quoted = state.quoted;
    if (!quoted) return [];
    var company = state.analysis && state.analysis.company;
    var jurisdiction = company ? company.jurisdiction : 'US';
    var items = [];
    ((quoted.search && quoted.search.quotes) || []).forEach(function (quote) {
      var instrument = quote.instrument || {};
      var payout = num(instrument.payoutPerUnitUsd);
      items.push({
        id: quote.quoteId,
        quote: quote,
        venue: quote.venue,
        source: quote.source,
        name: cleanName(instrument.name),
        status: quoteStatus(quote, jurisdiction),
        held: heldQuantity(quoted.plan, quote.quoteId),
        chance: payout > 0 ? num(quote.askUsd) / payout : 0,
        book: (quoted.books || []).filter(function (book) { return book.instrumentId === instrument.instrumentId; })[0] || null
      });
    });
    ((quoted.search && quoted.search.capacityOffers) || []).forEach(function (offer) {
      items.push({
        id: offer.offerId,
        offer: offer,
        venue: 'capacity_provider',
        source: offer.capability === 'live' ? 'live' : 'sandbox',
        name: /sandbox|demo/i.test(offer.providerName) ? 'Standby inference capacity' : 'Standby capacity from ' + cleanLabel(offer.providerName),
        status: offer.capability === 'sandbox' ? { label: '', buyable: true } : { label: offer.capability === 'live' ? 'Live offer, not traded here' : 'Not reservable', buyable: false },
        held: heldQuantity(quoted.plan, offer.offerId),
        chance: 0,
        book: null
      });
    });
    items.sort(function (a, b) {
      if (!!a.held !== !!b.held) return a.held ? -1 : 1;
      if (a.status.buyable !== b.status.buyable) return a.status.buyable ? -1 : 1;
      return 0;
    });
    return items;
  }

  function renderMarkets() {
    var root = $('markets');
    clear(root);
    if (state.phase === 'pricing') {
      root.appendChild(el('div', { class: 'markets-head' }, [el('h2', { text: 'Markets' })]));
      root.appendChild(el('p', { style: 'padding:1.5rem 0' }, [working('Searching venues and building your hedge')]));
      return;
    }
    if (state.phase === 'error') {
      root.appendChild(message('bad', state.error));
      root.appendChild(el('button', { class: 'btn btn-ghost', type: 'button', style: 'margin-top:1rem', onclick: priceHedge }, ['Try again']));
      return;
    }
    var items = marketItems();
    var buyable = items.filter(function (item) { return item.status.buyable; });
    var shown = state.filter === 'all' ? items : buyable;
    root.appendChild(el('div', { class: 'markets-head' }, [
      el('h2', { text: 'Markets' }),
      el('div', { class: 'tabs', role: 'group', 'aria-label': 'Filter markets' }, [
        el('button', { class: 'tab', type: 'button', 'aria-pressed': String(state.filter !== 'all'), onclick: function () { state.filter = 'buyable'; renderMarkets(); } }, ['Buyable ' + buyable.length]),
        el('button', { class: 'tab', type: 'button', 'aria-pressed': String(state.filter === 'all'), onclick: function () { state.filter = 'all'; renderMarkets(); } }, ['All ' + items.length])
      ])
    ]));
    root.appendChild(el('div', { class: 'thead', 'aria-hidden': 'true' }, [
      el('span', { text: 'Market' }),
      el('span', { text: 'Chance' }),
      el('span', { text: 'Ask' }),
      el('span', { class: 'col-bid', text: 'Bid' }),
      el('span', { class: 'col-chev' })
    ]));
    if (!shown.length) {
      root.appendChild(el('div', { style: 'padding:1.5rem 0.75rem' }, [
        el('p', { class: 'muted', text: 'Nothing you can buy matches this exposure right now.' }),
        items.length ? el('button', { class: 'link', type: 'button', style: 'margin-top:0.5rem', onclick: function () { state.filter = 'all'; renderMarkets(); } }, ['See reference markets']) : null
      ]));
    } else {
      shown.forEach(function (item) { root.appendChild(renderRow(item)); });
    }
    var plan = state.quoted && state.quoted.plan;
    if (plan && plan.legs.length) root.appendChild(renderCoverage(plan));
  }

  function renderRow(item) {
    var quote = item.quote;
    var offer = item.offer;
    var open = state.selected === item.id;
    var id = 'detail-' + item.id;
    var meta = [el('span', { text: VENUE[item.venue] || item.venue })];
    if (item.held) meta.push(el('span', { class: 'held', text: item.held + ' in your hedge' }));
    if (item.status.label) meta.push(el('span', { class: 'flag', text: item.status.label }));
    var cells = quote
      ? [
        el('span', { class: 'cell-num chance', text: chanceText(item.chance) }),
        el('span', { class: 'cell-num', text: usd(quote.askUsd) }),
        el('span', { class: 'cell-num col-bid', text: usd(quote.bidUsd) })
      ]
      : [
        el('span', { class: 'cell-num chance', text: '—' }),
        el('span', { class: 'cell-num' }, [usd(offer.reservationPremiumUsd), el('small', { text: 'to reserve' })]),
        el('span', { class: 'cell-num col-bid' }, [usd(offer.guaranteedPricePerRequestUsd), el('small', { text: 'per call' })])
      ];
    return el('div', { class: 'market' + (open ? ' open' : '') + (item.held ? ' held' : '') }, [
      el('button', {
        class: 'row', type: 'button', 'aria-expanded': String(open), 'aria-controls': id,
        onclick: function () { state.selected = open ? null : item.id; renderMarkets(); }
      }, [
        el('span', {}, [el('span', { class: 'row-title', text: item.name }), el('span', { class: 'row-meta' }, meta)])
      ].concat(cells).concat([el('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })])),
      open ? renderDetail(item, id) : null
    ]);
  }

  function factList(rows) {
    return el('dl', { class: 'facts' }, rows.map(function (row) { return el('div', {}, [el('dt', { text: row[0] }), el('dd', { text: cleanLabel(row[1]) })]); }));
  }

  function renderBook(book) {
    var bids = (book.bids || []).slice(0, 5);
    var asks = (book.asks || []).slice(0, 5);
    var max = Math.max.apply(null, [1].concat(bids.concat(asks).map(function (level) { return num(level.quantity); })));
    function row(level, side) {
      return el('tr', { class: side }, [
        el('td', { class: 'px' }, [el('span', { text: usd(level.priceUsd) })]),
        el('td', {}, [el('i', { class: 'depth', style: 'width:' + width(num(level.quantity), max) }), el('span', { text: String(level.quantity) })])
      ]);
    }
    var rows = asks.slice().reverse().map(function (level) { return row(level, 'ask'); });
    rows.push(el('tr', { class: 'spread' }, [el('td', { colspan: '2', text: bids.length && asks.length ? 'Spread ' + usd(num(asks[0].priceUsd) - num(bids[0].priceUsd)) : 'One side of the book is empty' })]));
    bids.forEach(function (level) { rows.push(row(level, 'bid')); });
    return el('table', { class: 'book', 'aria-label': 'Order book' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Price' }), el('th', { text: 'Contracts' })])]),
      el('tbody', {}, rows)
    ]);
  }

  function renderDetail(item, id) {
    var quote = item.quote;
    var offer = item.offer;
    var left;
    var facts;
    var more;
    if (quote) {
      var instrument = quote.instrument || {};
      var fees = quote.fees || {};
      var feeTotal = num(fees.tradingFeeUsd) + num(fees.networkFeeUsd) + num(fees.conversionFeeUsd) + num(fees.modeledSlippageUsd) + num(fees.otherFeeUsd);
      left = item.book ? renderBook(item.book) : el('p', { class: 'note-line', text: 'No order book on Switchboard for this venue. The price is a snapshot quote.' });
      facts = [
        ['Pays', usd(instrument.payoutPerUnitUsd) + ' per contract'],
        ['Resolves when', instrument.eventRule || 'n/a'],
        ['Expires', instrument.expiresAt ? new Date(instrument.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'n/a'],
        ['Cost for ' + quote.requestedQuantity, usd(quote.estimatedAllInBuyCostUsd) + ' with fees']
      ];
      more = [
        ['Type', SETTLEMENT[instrument.settlementType] || String(instrument.settlementType || 'n/a')],
        ['Available', quote.availableQuantity + ' contracts'],
        ['Fees', usd(feeTotal)],
        ['Basis risk', quote.basisRiskDescription],
        ['Eligibility', quote.eligibilityReason || 'n/a']
      ];
    } else {
      left = el('p', { class: 'note-line', text: 'If your primary provider fails, the agent can pay for this backup through Mastercard Agent Pay, inside the failover budget you approve.' });
      facts = [
        ['Price', usd(offer.guaranteedPricePerRequestUsd) + ' per request'],
        ['Reservation', usd(offer.reservationPremiumUsd)],
        ['Capacity', offer.throughputPerSecond + ' requests a second'],
        ['Verified', offer.verifiedCapacity ? 'Yes' : 'Pending']
      ];
      more = [['Task', offer.qualifiedTask], ['Region', offer.region], ['Benchmark', offer.qualificationBenchmark]];
    }
    return el('div', { class: 'detail', id: id }, [
      el('div', { class: 'detail-grid' }, [
        left,
        el('div', {}, [factList(facts), el('details', { class: 'more' }, [el('summary', { text: 'More details' }), factList(more)])])
      ])
    ]);
  }

  function renderCoverage(plan) {
    var company = state.analysis && state.analysis.company;
    var scenarios = (company && company.scenarios) || [];
    var maxLoss = Math.max.apply(null, [1].concat(scenarios.map(function (scenario) { return num(scenario.baselineLossUsd); })));
    return el('section', { class: 'coverage', 'aria-label': 'What your hedge pays' }, [
      el('h2', { text: 'What your hedge pays' }),
      el('p', { text: 'Your loss in each scenario, and how much of it the hedge covers.' }),
      el('div', { class: 'cov-rows' }, scenarios.map(function (scenario) {
        var loss = num(scenario.baselineLossUsd);
        var pays = plan.legs.reduce(function (sum, leg) { return sum + num(leg.payoffByScenarioUsd && leg.payoffByScenarioUsd[scenario.scenarioId]); }, 0);
        return el('div', { class: 'cov-row' }, [
          el('div', { class: 'cov-top' }, [
            el('span', {}, [scenario.label, el('small', { text: pct(Number(scenario.probability)) + '% a month' })]),
            el('span', {}, loss > 0 ? ['Pays ', el('b', { text: usd(pays) }), ' against a ' + usd(loss) + ' loss'] : ['No loss'])
          ]),
          el('div', { class: 'cov-bar', 'aria-hidden': 'true' }, [
            el('i', { class: 'loss', style: 'width:' + width(loss, maxLoss) }),
            el('i', { class: 'covered', style: 'width:' + width(Math.min(pays, loss), maxLoss) })
          ])
        ]);
      }))
    ]);
  }

  /* Slip */

  function legName(leg) {
    var items = marketItems();
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].id === leg.quoteId || items[i].id === leg.capacityOfferId) return items[i].name;
    }
    return leg.kind === 'capacity' ? 'Standby capacity' : 'Market contract';
  }

  function renderSlip() {
    var root = $('slip');
    clear(root);
    var plan = state.quoted && state.quoted.plan;
    root.appendChild(el('div', { class: 'slip-head' }, [
      el('h2', { text: state.result ? 'Receipt' : 'Your hedge' }),
      el('span', { text: MODES.filter(function (mode) { return mode[0] === state.mode; })[0][1] })
    ]));
    if (state.result) { renderReceipt(root, state.result); return; }
    if (!plan) {
      root.appendChild(el('div', { class: 'slip-sec' }, [
        state.phase === 'error'
          ? el('p', { class: 'muted', style: 'font-size:13px', text: 'No hedge yet.' })
          : el('div', { class: 'skeleton', 'aria-hidden': 'true' }, [el('i', { style: 'width:70%' }), el('i', { style: 'width:45%' }), el('i', { style: 'width:85%' })])
      ]));
      return;
    }
    if (state.notice) root.appendChild(el('div', { class: 'slip-sec' }, [message('warn', state.notice)]));
    if (!plan.legs.length) {
      root.appendChild(el('div', { class: 'slip-sec' }, [
        el('p', { style: 'font-size:13.5px', text: 'No contract fits inside this budget, so the plan is to hold the risk.' }),
        el('p', { class: 'muted', style: 'font-size:13px;margin-top:0.5rem', text: 'That is a valid answer. Try a bigger budget, another priority, or a business these markets cover.' })
      ]));
      return;
    }
    root.appendChild(el('div', { class: 'slip-sec' }, plan.legs.map(function (leg) {
      var qty = num(leg.quantity);
      var each = qty > 0 ? num(leg.estimatedAllInCostUsd) / qty : 0;
      return el('div', { class: 'leg' }, [
        el('span', { class: 'leg-name', text: legName(leg) }),
        el('span', { class: 'leg-cost', text: usd(leg.estimatedAllInCostUsd) }),
        el('span', { class: 'leg-sub', text: leg.quantity + ' contracts at ' + usd(each) + ' on ' + (VENUE[leg.venue] || leg.venue) })
      ]);
    })));
    var budget = num(plan.budgetUsd);
    var premium = num(plan.estimatedTotalCostUsd);
    root.appendChild(el('div', { class: 'slip-sec' }, [
      el('div', { class: 'total' }, [el('span', { text: 'Premium' }), el('strong', { text: usd(plan.estimatedTotalCostUsd) })]),
      el('div', { class: 'meter', 'aria-hidden': 'true' }, [el('i', { style: 'width:' + width(premium, budget) })]),
      el('p', { class: 'meter-label', text: (budget > 0 ? Math.round((premium / budget) * 100) : 0) + '% of your ' + usd(plan.budgetUsd) + ' monthly budget' })
    ]));
    root.appendChild(el('div', { class: 'slip-sec' }, [
      ['Worst scenario', 'worstScenarioLossUsd'],
      ['Average of worst 5%', 'cvar95LossUsd']
    ].map(function (row) {
      var before = num(plan.before[row[1]]);
      var after = num(plan.after[row[1]]);
      return el('div', { class: 'line-item' }, [
        el('span', { text: row[0] }),
        el('span', { 'aria-label': usd(before) + ' without the hedge, ' + usd(after) + ' with it' }, [usd(before), el('span', { class: 'arrow', text: '→' }), el('b', { class: after < before ? 'up' : '', text: usd(after) })])
      ]);
    }).concat([el('p', { class: 'meter-label', style: 'margin-top:0.6rem', text: 'Monthly loss without and with the hedge, premium included.' })])));

    var check = el('input', { type: 'checkbox', id: 'consent' });
    var go = el('button', { class: 'btn btn-primary btn-lg', type: 'button', id: 'run' }, ['Approve hedge']);
    go.disabled = true;
    check.addEventListener('change', function () { go.disabled = !check.checked || state.busy; });
    go.addEventListener('click', function () { execute(plan); });
    root.appendChild(el('div', { class: 'slip-sec' }, [
      el('label', { class: 'consent', for: 'consent' }, [check, el('span', { text: 'Approve this hedge and a $25 failover budget.' })]),
      el('div', { class: 'slip-cta' }, [go]),
      el('div', { id: 'run-status', role: 'status' }),
      el('p', { class: 'slip-foot', title: plan.planHash, text: 'Prices are re-checked when you approve. Plan ' + shortHash(plan.planHash) })
    ]));
  }

  async function execute(plan) {
    if (state.busy) return;
    state.busy = true;
    var go = $('run');
    go.disabled = true;
    $('consent').disabled = true;
    clear(go);
    go.appendChild(el('span', { class: 'spinner', 'aria-hidden': 'true' }));
    go.appendChild(document.createTextNode('Approving'));
    var result = await post('/demo/execute', { company: state.analysis.company, mode: state.mode, reviewedPlan: plan, confirm: true });
    state.busy = false;
    if (result.status === 409 && result.body.requote && result.body.plan) {
      acceptQuote(result.body);
      state.notice = messageOf(result.body, 'The market moved since you reviewed it. Check the new hedge and approve again.');
      renderSlip();
      return;
    }
    if (!result.body.steps) {
      renderSlip();
      $('run-status').appendChild(message('bad', messageOf(result.body, 'The run did not start. Nothing was ordered.')));
      return;
    }
    state.result = result.body;
    renderSlip();
  }

  function renderReceipt(root, body) {
    var steps = body.steps || [];
    var run = body.run || {};
    var failover = body.failover || {};
    var network = body.network || {};
    var orders = Array.isArray(run.orders) ? run.orders : [];
    var plan = body.plan || (state.quoted && state.quoted.plan) || {};
    var noTrade = !orders.length && steps.some(function (step) { return step.name === 'orders'; });
    root.appendChild(el('div', { class: 'slip-sec' }, [
      el('div', { class: 'receipt-head' }, [
        el('span', { class: 'tick ' + (body.ok ? 'ok' : 'bad'), 'aria-hidden': 'true', text: body.ok ? '✓' : '!' }),
        el('div', {}, [
          el('strong', { text: body.ok ? (noTrade ? 'Nothing to place' : 'Hedge placed') : 'Run stopped' }),
          el('span', { text: orders.length ? orders.length + (orders.length === 1 ? ' order, ' : ' orders, ') + usd(plan.estimatedTotalCostUsd) + ' premium' : 'No order submitted' })
        ])
      ]),
      body.ok ? null : el('p', { class: 'note-line', style: 'margin-top:0.85rem', text: body.note || '' })
    ]));
    root.appendChild(el('div', { class: 'slip-sec' }, [
      el('ol', { class: 'steps' }, steps.map(function (step) {
        var good = step.status >= 200 && step.status < 300;
        return el('li', { class: good ? '' : 'bad' }, [el('span', {}, [STEP[step.name] || step.name, good ? null : el('small', { text: step.detail })])]);
      }))
    ]));
    root.appendChild(el('div', { class: 'slip-sec' }, [
      el('div', { class: 'line-item' }, [el('span', { text: 'Orders' }), el('b', { text: orders.length ? orders.map(function (order) { return order.filledQuantity + ' filled at ' + usd(order.averageFillPriceUsd); }).join(', ') : 'None' })]),
      el('div', { class: 'line-item' }, [el('span', { text: 'Outage drill' }), el('b', { text: failover.state ? failover.state.replace(/_/g, ' ').toLowerCase() : 'Not run' })]),
      el('div', { class: 'line-item' }, [el('span', { text: 'Agent spend' }), el('b', { text: usd(failover.ap4mSpendingUsd || '0') })]),
      el('div', { class: 'line-item' }, [el('span', { text: 'XRPL EVM testnet' }), el('b', { text: network.blockNumber !== null && network.blockNumber !== undefined ? 'Block ' + network.blockNumber : 'Not read' })]),
      el('button', { class: 'btn btn-ghost btn-lg', type: 'button', style: 'margin-top:1rem', onclick: function () { state.result = null; renderSlip(); } }, ['Back to the hedge'])
    ]));
  }

  /* Sample */

  async function runSample() {
    if (state.busy) return;
    var button = $('sample');
    state.busy = true;
    button.disabled = true;
    $('desc').value = EXAMPLES[0];
    $('jurisdiction').value = 'US';
    $('budget').value = '800';
    $('tail').value = '8000';
    $('mode-select').value = 'min_cvar';
    state.mode = 'min_cvar';
    autoGrow();
    clear($('intro-msg'));
    state.phase = 'pricing';
    state.analysis = { company: { name: 'Sample company', jurisdiction: 'US', monthlyHedgeBudgetUsd: '800', maxTolerableTailLossUsd: '8000', exposures: [], scenarios: [] } };
    state.quoted = null;
    state.result = null;
    render();
    toTop();
    var result = await post('/demo/proof', { confirm: true });
    state.busy = false;
    button.disabled = false;
    var body = result.body || {};
    if (!body.company) {
      state.phase = 'error';
      state.error = messageOf(body, body.note || 'The sample run failed before the company was read.');
      render();
      return;
    }
    state.analysis = { company: body.company, assumptions: [], warnings: [] };
    state.confirmed = true;
    if (body.plan) acceptQuote({ search: body.marketSearch, plan: body.plan, books: body.books });
    else { state.phase = 'error'; state.error = body.note || 'The sample run did not return a plan.'; }
    state.result = body;
    render();
  }

  $('sample').addEventListener('click', runSample);

  /* Integrations */

  function sponsor(title, color, label, detail) {
    return el('div', { class: 'sponsor' }, [
      el('h4', { text: title }),
      el('span', { class: 'state', style: 'color:' + color }, [el('i', { style: 'background:' + color }), label]),
      el('p', { text: detail })
    ]);
  }

  fetch('/demo/sponsors').then(function (response) { return response.json(); }).then(function (s) {
    var root = $('sponsors');
    clear(root);
    var ap4m = s.ap4m || {};
    var quicknode = s.quicknode || {};
    var aws = s.aws || {};
    var ledger = s.ledger || {};
    var missing = Array.isArray(ap4m.missing) ? ap4m.missing : [];
    var amber = 'var(--amber)';
    var green = 'var(--green)';
    var grey = 'var(--faint)';
    root.appendChild(sponsor('Mastercard Agent Pay', missing.length ? amber : green, missing.length ? 'Setting up' : 'Connected', 'Pays for backup capacity when your provider goes down, inside the budget you approve.'));
    root.appendChild(sponsor('QuickNode', quicknode.provider === 'quicknode' ? green : amber, quicknode.provider === 'quicknode' ? 'Connected' : 'Setting up', 'Reads XRPL EVM blocks and PaymentLedger events.' + (typeof quicknode.eventCount === 'number' ? ' ' + quicknode.eventCount + ' recent ' + (quicknode.eventCount === 1 ? 'event' : 'events') + '.' : '')));
    if (s.aws) root.appendChild(sponsor('AWS AgentCore', aws.deployed ? green : amber, aws.deployed ? 'Deployed' : 'Setting up', 'Hosts the hedging agent runtime.'));
    root.appendChild(sponsor('Ledger', ledger.signed ? green : grey, ledger.signed ? 'Signed' : 'Connect a device', 'Plain-language previews of every XRPL transaction before you sign.'));
  }).catch(function () {
    var root = $('sponsors');
    clear(root);
    root.appendChild(message('bad', 'Integration status did not load. Reload the page to try again.'));
  });

  autoGrow();
  render();
})();
</script>
</body>
</html>`;
}
