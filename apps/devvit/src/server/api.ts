import { Hono, type Context } from "hono";
import { context, reddit, redis } from "@devvit/web/server";
import type { EventBody } from "@dankrupt/engine";
import { parseOrder } from "../../../server/src/http.ts";
import * as daily from "./daily.ts";
import * as signals from "./signals.ts";
import {
  Busy, K, candles, closedTrades, coins, equityHistory, heartbeat, markNoticesRead, mutate, notices, peek, receipts, recordCashEvent, submit,
} from "./store.ts";
import type { World } from "./world.ts";

const ID = /^[a-z0-9_-]{1,32}$/;
const DAY = 86_400_000;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const api = new Hono();

api.onError((err, c) => {
  // The shared validators (apps/server) throw their own HttpError class: anything carrying a status is an HTTP error.
  const tagged = (err as { status?: unknown }).status;
  const status = typeof tagged === "number" ? tagged : err instanceof Busy ? 503 : 500;
  if (status === 500) console.error(err);
  return c.json({ error: status === 500 ? "internal error" : err.message }, status as 400);
});

/** The signed-in Redditor, lowercased (engine account ids are lowercase). Logged-out viewers get 401. */
async function user(): Promise<string> {
  const name = context.username ?? (await reddit.getCurrentUsername());
  const id = name?.toLowerCase();
  if (!id || !ID.test(id)) throw new HttpError(401, "log in to Reddit to trade");
  return id;
}

/** Moderators of the subreddit (cached for 10 minutes). */
export async function isOperator(id: string): Promise<boolean> {
  const cached = await redis.get(`mod:${id}`);
  if (cached) return cached === "1";
  const sub = context.subredditName;
  const mods = sub ? await reddit.getModerators({ subredditName: sub, username: id }).all() : [];
  const yes = mods.some((m) => m.username.toLowerCase() === id);
  await redis.set(`mod:${id}`, yes ? "1" : "0", { expiration: new Date(Date.now() + 10 * 60_000) });
  return yes;
}

const memeParam = (c: Context) => {
  const memeId = c.req.query("memeId") ?? "";
  if (!ID.test(memeId)) throw new HttpError(400, "memeId is required");
  return memeId;
};

async function body(c: Context): Promise<Record<string, unknown>> {
  const raw = await c.req.text();
  if (raw.length > 10_000) throw new HttpError(413, "body too large");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new HttpError(400, "body must be JSON");
  }
}

/** Opens today's round account inside the same transaction as whatever comes next. */
function ensureRound(world: World, accountId: string, now: number) {
  if (!world.engine.hasAccount(accountId)) world.submit({ type: "account.open", accountId }, now);
}

async function accountView(world: World, accountId: string, display: string) {
  const a = world.engine.account(accountId);
  return {
    accountId: display,
    cash: coins(a.cash),
    freeCash: coins(a.freeCash),
    heldCash: coins(a.heldCash),
    heldMargin: coins(a.heldMargin),
    equity: coins(a.equity),
    initialMargin: coins(a.initialMargin),
    maintenance: coins(a.maintenance),
    shares: a.shares,
    heldShares: a.heldShares,
    positions: a.positions.map((p) => ({ ...p, mark: coins(p.mark), value: coins(p.value), pnl: coins(p.pnl), basis: coins(p.basis) })),
    resets: a.resets,
    canReset: a.canReset,
    orders: world.engine.openOrders(accountId),
    receipts: await receipts(accountId),
  };
}

/** Peek at the world, opening today's account first (a write) only if it doesn't exist yet. */
async function withRound(me: string) {
  const now = Date.now();
  const accountId = daily.roundAccount(me, now);
  let world = await peek();
  if (!world.engine.seq) {
    await daily.ensureSeeded();
    world = await peek();
  }
  if (!world.engine.hasAccount(accountId)) world = await mutate(({ world: w, now: t }) => (ensureRound(w, accountId, t), w));
  return { world, accountId, now };
}

// Slow or failed requests show in the playtest log; routine polls stay quiet.
api.use(async (c, next) => {
  const t = Date.now();
  await next();
  const ms = Date.now() - t;
  if (c.res.status >= 400 || ms > 1_500 || c.req.method !== "GET") console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
});

// ---------- public market data ----------

/** One poll for the live screens: every quote, the Dank Index and its last few 100 ms ticks. */
api.get("/tape", async (c) => {
  let w = await heartbeat();
  if (!w.engine.seq) {
    await daily.ensureSeeded();
    w = await peek();
  }
  return c.json({ dank: w.engine.dank, recent: w.dankHistory().slice(-30), rows: w.markets() });
});
/** The shared web chart asks for its history at the web app's path; serve it here too. */
api.get("/engine/dank", async (c) => c.json((await peek()).dankHistory()));

api.get("/health", async (c) => {
  const w = await peek();
  return c.json({ ok: true, seq: w.engine.seq, lagMs: Date.now() - w.engine.time });
});
api.get("/memes", async (c) => c.json((await peek()).engine.memes()));
api.get("/dank", async (c) => {
  const w = await heartbeat();
  return c.json(c.req.query("history") !== undefined ? w.dankHistory() : w.engine.dank);
});
api.get("/markets", async (c) => {
  let w = await heartbeat();
  if (!w.engine.seq) {
    await daily.ensureSeeded();
    w = await peek();
  }
  return c.json(w.markets());
});
api.get("/candles", async (c) => c.json(await candles(await peek(), memeParam(c))));
api.get("/attention", async (c) => c.json(await signals.attention(memeParam(c))));
api.get("/book", async (c) => {
  const memeId = memeParam(c);
  const w = await peek();
  if (!w.engine.memes().some((m) => m.memeId === memeId)) throw new HttpError(404, "no such meme");
  return c.json(w.engine.book(memeId, 8));
});
api.get("/meme-meta", async (c) => {
  const memeId = memeParam(c);
  const raw = await redis.hGet(K.meta, memeId);
  return c.json({ ...(raw ? JSON.parse(raw) : { description: "", links: [] }), videos: [] });
});

// ---------- the daily round ----------

/** Everything the start screen and the round bar need in one call. */
api.get("/day", async (c) => {
  const now = Date.now();
  const me = await user().catch(() => null);
  const world = await peek();
  const today = await daily.standings(world, now);
  const yesterdayKey = daily.dayKey(now - DAY);
  const yesterday = await daily.results(yesterdayKey);
  const s = me ? await daily.stats(me) : null;
  const mine = me ? today.find((r) => r.user === me) ?? null : null;
  const seen = me ? await redis.get(daily.DK.seenResult(me)) : null;
  const myYesterday = me ? yesterday.find((r) => r.user === me) ?? null : null;
  // The day's listing: the newest meme listed after launch (the launch set all share the first listing time).
  const all = world.engine.memes();
  const launchedAt = Math.min(...all.map((m) => m.listedAt));
  const listing = all.filter((m) => m.listedAt > launchedAt + 60_000 && (m.status === "preopen" || now - m.listedAt < DAY)).sort((a, b) => b.listedAt - a.listedAt)[0];
  return c.json({
    day: daily.dayNumber(now),
    key: daily.dayKey(now),
    endsAt: daily.dayStart(now) + DAY,
    startingCash: coins(world.engine.params.startingCash),
    players: today.length,
    leaders: today.slice(0, 10),
    me: me && {
      user: me,
      rank: mine?.rank ?? null,
      equity: mine?.equity ?? null,
      returnPct: mine?.returnPct ?? null,
      played: !!mine,
      streak: s ? daily.liveStreak(s, now) : 0,
      bestStreak: s?.best ?? 0,
      days: s?.days ?? 0,
      wins: s?.wins ?? 0,
    },
    yesterday: { day: daily.dayNumber(now - DAY), podium: yesterday.slice(0, 3), players: yesterday.length, mine: myYesterday, unseen: !!myYesterday && seen !== yesterdayKey },
    listing: listing ? { memeId: listing.memeId, name: listing.name, status: listing.status, opensAt: listing.opensAt } : null,
    // The feed card's top movers, so it needs this one read-only call.
    movers: world.markets().filter((m) => m.status === "active").sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 3)
      .map(({ memeId, name, mid, change24h }) => ({ memeId, name, mid, change24h })),
  });
});
api.post("/day/seen", async (c) => {
  await redis.set(daily.DK.seenResult(await user()), daily.dayKey(Date.now() - DAY));
  return c.json({ ok: true });
});

/** Boards for the Leaderboard screen: today live, yesterday final. Rows keep the web board's shape. */
api.get("/leaderboard", async (c) => {
  const w = c.req.query("window") ?? "daily";
  const now = Date.now();
  const rows = w === "yesterday" ? await daily.results(daily.dayKey(now - DAY)) : await daily.standings(await peek(), now);
  return c.json(rows.slice(0, 100).map((r) => ({ rank: r.rank, accountId: r.user, twr: r.returnPct / 100, style: "swing", trades: 0, resets: 0 })));
});

// ---------- the player ----------

api.get("/whoami", async (c) => {
  const me = await user();
  return c.json({ accountId: me, operator: await isOperator(me) });
});
api.get("/me", async (c) => {
  const me = await user();
  const { world, accountId } = await withRound(me);
  return c.json(await accountView(world, accountId, me));
});
api.get("/preview", async (c) => {
  const me = await user();
  const { world, accountId } = await withRound(me);
  const q = c.req.query();
  const o = parseOrder({ memeId: q.memeId, side: q.side, qty: Number(q.qty), type: q.type ?? "market", price: q.price !== undefined ? Number(q.price) : undefined });
  if (q.max === "1" && o.side === "buy" && o.type === "limit") return c.json({ qty: world.engine.maxLimitBuy(accountId, o.memeId, o.price!, o.qty) });
  const p = world.engine.preview(accountId, o.memeId, o.side, o.qty, o.type === "limit" ? o.price : undefined);
  return c.json({ ...p, total: coins(p.total), fee: coins(p.fee) });
});
api.post("/orders", async (c) => {
  const me = await user();
  const o = parseOrder(await body(c));
  const now = Date.now();
  const accountId = daily.roundAccount(me, now);
  const { out, world } = await mutate(({ world: w, now: t }) => {
    ensureRound(w, accountId, t);
    const ev: EventBody =
      o.type === "stop"
        ? { type: "order.stop", accountId, memeId: o.memeId, side: o.side, qty: o.qty, stopPrice: o.price! }
        : o.type === "limit"
        ? { type: "order.limit", accountId, memeId: o.memeId, side: o.side, qty: o.qty, price: o.price!, replaceOrderId: o.replaceOrderId,
            immediateOrCancel: o.immediateOrCancel, expiresAt: o.expiresInMinutes ? t + o.expiresInMinutes * 60_000 : null }
        : { type: "order.market", accountId, memeId: o.memeId, side: o.side, qty: o.qty };
    return { out: w.submit(ev, t), world: w };
  });
  if (!out.rejects.length) await daily.markPlayed(me, now);
  return c.json(
    {
      fills: out.fills.filter((f) => f.accountId === accountId).map((f) => ({ ...f, accountId: me, cost: coins(f.cost), fee: coins(f.fee) })),
      orders: out.orders.filter((x) => x.accountId === accountId),
      rejects: out.rejects,
      account: await accountView(world, accountId, me),
    },
    out.rejects.length ? 422 : 200,
  );
});
api.post("/orders/cancel", async (c) => {
  const me = await user();
  const { orderId } = await body(c);
  if (!Number.isSafeInteger(orderId)) throw new HttpError(400, "orderId is required");
  const accountId = daily.roundAccount(me, Date.now());
  const { out, world } = await submit({ type: "order.cancel", accountId, orderId: orderId as number });
  return c.json({ rejects: out.rejects, account: await accountView(world, accountId, me) }, out.rejects.length ? 422 : 200);
});
api.post("/reset", async (c) => {
  const me = await user();
  const accountId = daily.roundAccount(me, Date.now());
  const { out, world } = await mutate(({ world: w, now, write }) => {
    ensureRound(w, accountId, now);
    const before = Math.round(w.engine.account(accountId).equity);
    const r = w.submit({ type: "account.reset", accountId }, now);
    if (!r.rejects.length) {
      // A reset is a cash event: the record keeps the equity on both sides of it.
      const after = Math.round(w.engine.account(accountId).equity);
      write((tx) => recordCashEvent(tx, accountId, { time: now - 1, equity: before, cashEvent: "before-reset" }));
      write((tx) => recordCashEvent(tx, accountId, { time: now, equity: after, cashEvent: "reset" }));
    }
    return { out: r, world: w };
  });
  return c.json({ rejects: out.rejects, account: await accountView(world, accountId, me) }, out.rejects.length ? 422 : 200);
});
/**
 * Posts a closed trade to the subreddit as the player, after they confirmed in the app.
 * The card shows percentages and per-share prices only, never balances (as on the web).
 */
api.post("/share", async (c) => {
  const me = await user();
  const { memeId, closedAt: rawAt } = await body(c);
  if (typeof memeId !== "string" || !ID.test(memeId) || !Number.isSafeInteger(rawAt)) throw new HttpError(400, "bad trade reference");
  const closedAt = rawAt as number;
  const now = Date.now();
  let trade: Awaited<ReturnType<typeof closedTrades>>[number] | undefined;
  for (const t of [now, now - DAY]) {
    trade = (await closedTrades(daily.roundAccount(me, t))).find((x) => x.memeId === memeId && x.closedAt === closedAt);
    if (trade) break;
  }
  if (!trade || trade.basis <= 0) throw new HttpError(404, "no such trade");
  const sub = context.subredditName;
  if (!sub) throw new HttpError(400, "open this from the subreddit");
  const key = `shared:${me}:${memeId}:${closedAt}`;
  if (!(await redis.set(key, "1", { nx: true, expiration: new Date(now + 7 * DAY) }))) throw new HttpError(409, "you already posted this trade");
  try {
    const name = (await peek()).engine.memes().find((m) => m.memeId === memeId)?.name ?? memeId;
    const returnPct = (trade.pnl / trade.basis) * 100;
    const avgIn = trade.basis / trade.peakQty / 1e6;
    const avgOut = (trade.side === "long" ? trade.basis + trade.pnl : trade.basis - trade.pnl) / trade.peakQty / 1e6;
    const pct = `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(1)}%`;
    const title = `${returnPct >= 0 ? "Called it" : "Lesson learned"}: ${trade.side === "long" ? "long" : "short"} ${name}, ${pct} · Market Day #${daily.dayNumber(closedAt)}`;
    const post = await reddit.submitCustomPost({
      runAs: "USER",
      userGeneratedContent: { text: title },
      subredditName: sub,
      title,
      entry: "card",
      postData: { user: me, memeId, name, side: trade.side, returnPct, avgIn, avgOut, openedAt: trade.openedAt, closedAt, day: daily.dayNumber(closedAt) },
    });
    await reddit.setPostFlair({ subredditName: sub, postId: post.id, text: "Trade call", backgroundColor: "#1d8a4a", textColor: "light" }).catch((e) => console.error("post flair failed", e));
    return c.json({ url: `https://www.reddit.com/r/${sub}/comments/${post.id.replace(/^t3_/, "")}` });
  } catch (e) {
    await redis.del(key);
    throw e;
  }
});
api.get("/notices", async (c) => c.json(await notices(daily.roundAccount(await user(), Date.now()))));
api.post("/notices/read", async (c) => {
  await markNoticesRead(daily.roundAccount(await user(), Date.now()));
  return c.json({ ok: true });
});
api.get("/profile", async (c) => {
  const me = await user();
  const { world, accountId, now } = await withRound(me);
  const names = new Map(world.engine.memes().map((m) => [m.memeId, m.name]));
  const trades = await closedTrades(accountId);
  const history = await equityHistory(accountId, daily.dayStart(now));
  return c.json({
    account: await accountView(world, accountId, me),
    trades: trades.map((t) => ({ ...t, pnl: coins(t.pnl), basis: coins(t.basis), name: names.get(t.memeId) ?? t.memeId })),
    equity: history.map((h) => ({ ...h, equity: coins(h.equity) })),
  });
});
api.post("/view", async (c) => {
  const me = await user();
  const { memeId } = await body(c);
  if (typeof memeId !== "string" || !ID.test(memeId)) throw new HttpError(400, "memeId is required");
  return c.json({ counted: await signals.view(me, memeId) });
});
api.get("/watchlist", async (c) => c.json(await signals.watchlist(await user())));
api.post("/watchlist", async (c) => {
  const me = await user();
  const { memeId, on } = await body(c);
  if (typeof memeId !== "string" || !ID.test(memeId) || typeof on !== "boolean") throw new HttpError(400, "memeId and on are required");
  await signals.star(me, memeId, on);
  return c.json(await signals.watchlist(me));
});



