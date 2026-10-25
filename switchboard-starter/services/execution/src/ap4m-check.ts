/**
 * pnpm ap4m:check [--env-file path]
 *
 * Read-only AP4M preflight. Uses the shell environment, plus a dotenv file when one is given
 * (for example one pulled with `vercel env pull`). Exits 0 when ready, 1 when not.
 */
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { ap4mPreflight } from "./ap4m-preflight.js";

function loadEnv(argv: string[]): NodeJS.ProcessEnv {
  const flag = argv.indexOf("--env-file");
  if (flag === -1) return process.env;
  const path = argv[flag + 1];
  if (!path) throw new Error("--env-file needs a path.");
  return { ...process.env, ...parseEnv(readFileSync(path, "utf8")) };
}

const report = await ap4mPreflight(loadEnv(process.argv.slice(2)));
for (const check of report.checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);
}
console.log(`\n${report.note}`);
process.exitCode = report.ready ? 0 : 1;
