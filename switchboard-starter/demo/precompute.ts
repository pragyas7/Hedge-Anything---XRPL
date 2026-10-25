/**
 * pnpm demo:precompute ["description" ...]
 *
 * Calls Claude for real on the demo examples and saves the answers to demo/precomputed.ts, so the
 * page can show them instantly. Kalshi markets are not saved; they are looked up live per request.
 * Needs ANTHROPIC_API_KEY.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { askClaude, discoveryKey, weatherCatalog } from "./discover.js";

const examples = process.argv.slice(2).length ? process.argv.slice(2) : ["Ice cream shop in New York"];
const catalog = await weatherCatalog();
const saved: Record<string, unknown> = {};
for (const description of examples) {
  const found = await askClaude({ description, jurisdiction: "US", budget: "800", tail: "8000" }, catalog.lines, 240_000);
  console.log(found ? `saved: ${description}` : `no answer: ${description}`);
  if (found) saved[discoveryKey(description)] = { generatedAt: new Date().toISOString(), model: "claude-opus-5-5", discovery: found };
}
if (Object.keys(saved).length === 0) process.exit(1);
const body = `/**
 * Saved Claude answers for the demo examples, keyed by discoveryKey(description).
 * Generated with \`pnpm demo:precompute\`, which calls the model for real and writes this file.
 * Only the model's reasoning is saved; Kalshi markets are looked up live on every request.
 */
import type { Discovery } from "./discover.js";

export const PRECOMPUTED: Record<string, { generatedAt: string; model: string; discovery: Discovery }> = ${JSON.stringify(saved, null, 2)};
`;
writeFileSync(fileURLToPath(new URL("./precomputed.ts", import.meta.url)), body);
