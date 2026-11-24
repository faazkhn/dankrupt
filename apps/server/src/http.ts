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

export type OrderRequest = {
  memeId: string;
  side: "buy" | "sell";
  qty: number;
  type: "market" | "limit";
  price?: number;
  /** Minutes until a limit order expires; omit for good-till-cancelled. */
  expiresInMinutes?: number;
};

/** Validates an order request at the trust boundary. */
export function parseOrder(input: unknown): OrderRequest {
  const o = (input ?? {}) as Record<string, unknown>;
  if (typeof o.memeId !== "string" || !ID.test(o.memeId)) throw new HttpError(400, "memeId is required");
  if (o.side !== "buy" && o.side !== "sell") throw new HttpError(400, "side must be buy or sell");
  if (!Number.isSafeInteger(o.qty) || (o.qty as number) <= 0 || (o.qty as number) > 10_000_000)
    throw new HttpError(400, "qty must be a whole number from 1 to 10,000,000");
  const type = o.type ?? "market";
  if (type !== "market" && type !== "limit") throw new HttpError(400, "type must be market or limit");
  const out: OrderRequest = { memeId: o.memeId, side: o.side, qty: o.qty as number, type };
  if (type === "limit") {
    if (typeof o.price !== "number" || !Number.isFinite(o.price) || o.price < 0.01 || o.price > 10_000_000)
      throw new HttpError(400, "price must be a number from 0.01");
    out.price = o.price;
    if (o.expiresInMinutes !== undefined && o.expiresInMinutes !== null) {
      if (!Number.isSafeInteger(o.expiresInMinutes) || (o.expiresInMinutes as number) < 1 || (o.expiresInMinutes as number) > 60 * 24 * 90)
        throw new HttpError(400, "expiry must be 1 minute to 90 days");
      out.expiresInMinutes = o.expiresInMinutes as number;
    }
  }
  return out;
}

export function createApi(seq: Sequencer, feed?: Feed) {
  const e = seq.engine;
  const coins = (uc: number) => uc / COIN;
  const memeParam = (url: URL) => {
    const memeId = url.searchParams.get("memeId") ?? "";
    if (!ID.test(memeId)) throw new HttpError(400, "memeId is required");
    return memeId;
  };

  async function ensureAccount(id: string) {
    if (!e.hasAccount(id)) await seq.submit({ type: "account.open", accountId: id });
  }

  function accountView(id: string) {
    const a = e.account(id);
    return {
      accountId: id,
      cash: coins(a.cash),
      freeCash: coins(a.freeCash),
      heldCash: coins(a.heldCash),
      shares: a.shares,
      heldShares: a.heldShares,
      orders: e.openOrders(id),
    };
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
    if (req.method === "GET" && url.pathname === "/api/candles") return send(200, feed?.candles(memeParam(url)) ?? []);
    if (req.method === "GET" && url.pathname === "/api/book") {
      const memeId = memeParam(url);
      if (!e.memes().some((m) => m.memeId === memeId)) throw new HttpError(404, "no such meme");
      return send(200, e.book(memeId, 8));
    }

    const me = playerId(req);
    if (!me) throw new HttpError(401, "sign in first");

    if (req.method === "GET" && url.pathname === "/api/me") {
      await ensureAccount(me);
      return send(200, accountView(me));
    }
    if (req.method === "GET" && url.pathname === "/api/preview") {
      await ensureAccount(me);
      const o = parseOrder({
        memeId: url.searchParams.get("memeId"),
        side: url.searchParams.get("side"),
        qty: Number(url.searchParams.get("qty")),
        type: url.searchParams.get("type") ?? "market",
        price: url.searchParams.has("price") ? Number(url.searchParams.get("price")) : undefined,
      });
      const p = e.preview(me, o.memeId, o.side, o.qty, o.type === "limit" ? o.price : undefined);
      return send(200, { ...p, total: coins(p.total), fee: coins(p.fee) });
    }
    if (req.method === "POST" && url.pathname === "/api/orders") {
      const o = parseOrder(await body(req));
      await ensureAccount(me);
      const out = await seq.submit(
        o.type === "limit"
          ? {
              type: "order.limit",
              accountId: me,
              memeId: o.memeId,
              side: o.side,
              qty: o.qty,
              price: o.price!,
              expiresAt: o.expiresInMinutes ? Date.now() + o.expiresInMinutes * 60_000 : null,
            }
          : { type: "order.market", accountId: me, memeId: o.memeId, side: o.side, qty: o.qty },
      );
      return send(out.rejects.length ? 422 : 200, {
        fills: out.fills.filter((f) => f.accountId === me).map((f) => ({ ...f, cost: coins(f.cost), fee: coins(f.fee) })),
        orders: out.orders.filter((x) => x.accountId === me),
        rejects: out.rejects,
        account: accountView(me),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/orders/cancel") {
      const { orderId } = (await body(req)) as { orderId?: unknown };
      if (!Number.isSafeInteger(orderId)) throw new HttpError(400, "orderId is required");
      const out = await seq.submit({ type: "order.cancel", accountId: me, orderId: orderId as number });
      return send(out.rejects.length ? 422 : 200, { rejects: out.rejects, account: accountView(me) });
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
