import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { COIN } from "@dankrupt/engine";
import type { Feed } from "./feed.ts";
import type { Sequencer } from "./sequencer.ts";

const ID = /^[a-z0-9_-]{1,32}$/;

/**
 * shortcut: dev-only identity from the x-dev-user header, trusted only outside production.
 * Ticket 16 replaces this with Google sessions.
 */
function playerId(req: IncomingMessage): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const id = String(req.headers["x-dev-user"] ?? "").toLowerCase();
  return ID.test(id) ? id : null;
}

async function body(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new HttpError(413, "body too large");
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new HttpError(400, "body must be JSON");
  }
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Validates an order request at the trust boundary. */
export function parseOrder(input: unknown): { memeId: string; side: "buy" | "sell"; qty: number } {
  const o = (input ?? {}) as Record<string, unknown>;
  if (typeof o.memeId !== "string" || !ID.test(o.memeId)) throw new HttpError(400, "memeId is required");
  if (o.side !== "buy" && o.side !== "sell") throw new HttpError(400, "side must be buy or sell");
  if (!Number.isSafeInteger(o.qty) || (o.qty as number) <= 0 || (o.qty as number) > 10_000_000)
    throw new HttpError(400, "qty must be a whole number from 1 to 10,000,000");
  return { memeId: o.memeId, side: o.side, qty: o.qty as number };
}

export function createApi(seq: Sequencer, feed?: Feed) {
  const e = seq.engine;
  const coins = (uc: number) => uc / COIN;

  async function ensureAccount(id: string) {
    if (!e.hasAccount(id)) await seq.submit({ type: "account.open", accountId: id });
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(data));
    };

    if (req.method === "GET" && url.pathname === "/api/health") return send(200, { ok: true, seq: e.seq });
    if (req.method === "GET" && url.pathname === "/api/memes") return send(200, e.memes());
    if (req.method === "GET" && url.pathname === "/api/markets") return send(200, feed?.markets() ?? []);
    if (req.method === "GET" && url.pathname === "/api/candles") {
      const memeId = url.searchParams.get("memeId") ?? "";
      if (!ID.test(memeId)) throw new HttpError(400, "memeId is required");
      return send(200, feed?.candles(memeId) ?? []);
    }

    const me = playerId(req);
    if (!me) throw new HttpError(401, "sign in first");

    if (req.method === "GET" && url.pathname === "/api/me") {
      await ensureAccount(me);
      const a = e.account(me);
      return send(200, { accountId: me, cash: coins(a.cash), shares: a.shares });
    }
    if (req.method === "POST" && url.pathname === "/api/orders") {
      const o = parseOrder(await body(req));
      await ensureAccount(me);
      const out = await seq.submit({ type: "order.market", accountId: me, ...o });
      const a = e.account(me);
      return send(out.rejects.length ? 422 : 200, {
        fills: out.fills.map((f) => ({ ...f, cost: coins(f.cost), fee: coins(f.fee) })),
        rejects: out.rejects,
        account: { cash: coins(a.cash), shares: a.shares },
      });
    }
    throw new HttpError(404, "not found");
  }

  return createServer((req, res) => {
    route(req, res).catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: status === 500 ? "internal error" : (err as Error).message }));
    });
  });
}
