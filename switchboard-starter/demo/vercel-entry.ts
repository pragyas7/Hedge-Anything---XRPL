import type { IncomingMessage, ServerResponse } from "node:http";
import "canonicalize";
import "decimal.js";
import "ethers";
import "fastify";
import "jose";
import gateway from "../server.js";

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Vercel rewrites every path to /api?path=... The Fastify routes stay at the original path. */
export function restoreDemoUrl(req: IncomingMessage): void {
  const raw = req.url ?? "/";
  const host = header(req, "host") ?? "localhost";
  let url: URL;
  try {
    url = new URL(raw, `http://${host}`);
  } catch {
    return;
  }
  if (!url.searchParams.has("path")) return;
  const path = url.searchParams.get("path") ?? "";
  url.searchParams.delete("path");
  const query = url.searchParams.toString();
  const pathname = path.length === 0 ? "/" : path.startsWith("/") ? path : `/${path}`;
  req.url = query.length > 0 ? `${pathname}?${query}` : pathname;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  restoreDemoUrl(req);
  await gateway.ready();
  gateway.server.emit("request", req, res);
}
