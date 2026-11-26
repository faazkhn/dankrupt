import { Hono, type Context } from "hono";
import { context, reddit, redis } from "@devvit/web/server";
import { PARAM_BOUNDS, type EventBody } from "@dankrupt/engine";
import { parseOrder } from "../../../server/src/http.ts";
import { AdminError, parseCandidate, parseMeta, wikipediaResolver } from "../../../server/src/admin.ts";
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
  const status = typeof tagged === "number" ? tagged : err instanceof AdminError ? 422 : err instanceof Busy ? 503 : 500;
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

/** Operators are the subreddit's moderators (cached for 10 minutes). */
async function isOperator(id: string): Promise<boolean> {
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

// ---------- public market data ----------

api.get("/health", async (c) => {
  const w = await peek();
  return c.json({ ok: true, seq: w.engine.seq, lagMs: Date.now() - w.engine.time });
});
api.get("/memes", async (c) => c.json((await peek()).engine.memes()));
api.get("/dank", async (c) => {
  await heartbeat();
  const w = await peek();
  return c.json(c.req.query("history") !== undefined ? w.dankHistory() : w.engine.dank);
});
api.get("/markets", async (c) => {
  await heartbeat();
  let w = await peek();
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
  const listing = world.engine.memes().filter((m) => m.status === "preopen" || now - m.listedAt < DAY).sort((a, b) => b.listedAt - a.listedAt)[0];
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

// ---------- operators (subreddit moderators) ----------

const admin = new Hono<{ Variables: { me: string } }>();
admin.use(async (c, next) => {
  const me = await user();
  if (!(await isOperator(me))) throw new HttpError(403, "moderators only");
  c.set("me", me);
  await next();
});

async function log(operator: string, action: string, detail: unknown) {
  const time = Date.now();
  await redis.zAdd(K.actions, { member: JSON.stringify({ time: new Date(time).toISOString(), operator, action, detail }), score: time });
  await redis.zRemRangeByRank(K.actions, 0, -501);
}

type Candidate = { id: number; meme_id: string; name: string; description: string; links: string[]; wikipedia: string[]; youtube: string[]; status: string; reason: string | null; source: string; created_at: string; decided_at: string | null; decided_by: string | null };

async function candidate(id: number): Promise<Candidate> {
  const raw = await redis.hGet(K.candidates, String(id));
  if (!raw) throw new AdminError("no such candidate");
  return JSON.parse(raw);
}

admin.get("/candidates", async (c) => {
  const all = Object.values(await redis.hGetAll(K.candidates)).map((v) => JSON.parse(v) as Candidate);
  return c.json(all.sort((a, b) => b.id - a.id).slice(0, 200));
});
admin.post("/candidates", async (c) => {
  const input = parseCandidate(await body(c));
  if ((await peek()).engine.memes().some((m) => m.memeId === input.memeId)) throw new AdminError("a meme with that id is already listed");
  const resolve = wikipediaResolver(await signals.userAgent());
  const wikipedia: string[] = [];
  for (const t of input.wikipedia) {
    const canonical = await resolve(t);
    if (!canonical) throw new AdminError(`no Wikipedia article called "${t}"`);
    wikipedia.push(canonical);
  }
  const id = await redis.incrBy(K.candidateSeq, 1);
  const cand: Candidate = { id, meme_id: input.memeId, name: input.name, description: input.description, links: input.links, wikipedia, youtube: input.youtube,
    status: "candidate", reason: null, source: "operator", created_at: new Date().toISOString(), decided_at: null, decided_by: null };
  await redis.hSet(K.candidates, { [String(id)]: JSON.stringify(cand) });
  await log(c.get("me"), "candidate.add", cand);
  return c.json({ id });
});
admin.post("/candidates/:id/:verb", async (c) => {
  const id = Number(c.req.param("id"));
  const verb = c.req.param("verb");
  const cand = await candidate(id);
  if (cand.status !== "candidate") throw new AdminError(`already ${cand.status}`);
  const me = c.get("me");
  if (verb === "approve") {
    if (!cand.wikipedia.length) throw new AdminError("map at least one data source first");
    const { out } = await submit({ type: "meme.list", memeId: cand.meme_id, name: cand.name, price: 100, depth: 500_000, preOpenUntil: Date.now() + 30 * 60_000 });
    if (out.rejects.length) throw new AdminError(out.rejects[0].reason);
    await redis.hSet(K.meta, { [cand.meme_id]: JSON.stringify({ description: cand.description, links: cand.links }) });
    await signals.mapSources(cand.meme_id, cand.wikipedia, cand.youtube);
    Object.assign(cand, { status: "approved" });
  } else if (verb === "reject") {
    const { reason } = await body(c);
    const why = typeof reason === "string" ? reason.trim().slice(0, 200) : "";
    if (!why) throw new AdminError("say which content-screen rule it fails");
    Object.assign(cand, { status: "rejected", reason: why });
  } else throw new HttpError(404, "not found");
  Object.assign(cand, { decided_at: new Date().toISOString(), decided_by: me });
  await redis.hSet(K.candidates, { [String(id)]: JSON.stringify(cand) });
  await log(me, `candidate.${verb}`, { id, memeId: cand.meme_id });
  return c.json({ ok: true });
});
admin.get("/listed", async (c) =>
  c.json((await peek()).engine.memes().map((m) => ({ memeId: m.memeId, name: m.name, status: m.status, price: m.price, heat: m.heat }))),
);
admin.post("/halt", async (c) => {
  const { memeId, reason } = await body(c);
  const why = typeof reason === "string" ? reason.trim().slice(0, 200) : "";
  if (typeof memeId !== "string" || !why) throw new AdminError("say which meme and why");
  const { out } = await submit({ type: "meme.halt", memeId, reason: why });
  if (out.rejects.length) throw new AdminError(out.rejects[0].reason);
  await log(c.get("me"), "meme.halt", { memeId, reason: why });
  return c.json({ ok: true });
});
admin.get("/params", async (c) => c.json({ values: (await peek()).engine.params, bounds: PARAM_BOUNDS }));
admin.post("/params", async (c) => {
  const clean = Object.fromEntries(Object.entries(await body(c)).map(([k, v]) => [k, Number(v)]));
  const { out, world } = await submit({ type: "params.set", params: clean });
  if (out.rejects.length) throw new AdminError(out.rejects[0].reason);
  await log(c.get("me"), "params.set", clean);
  return c.json({ values: world.engine.params, bounds: PARAM_BOUNDS });
});
admin.get("/actions", async (c) => {
  const rows = await redis.zRange(K.actions, 0, 49, { by: "rank", reverse: true });
  return c.json(rows.map((r) => JSON.parse(r.member)));
});
admin.post("/meme-meta", async (c) => {
  const b = await body(c);
  if (typeof b.memeId !== "string" || !ID.test(b.memeId)) throw new HttpError(400, "memeId is required");
  const meta = parseMeta(b);
  await redis.hSet(K.meta, { [b.memeId]: JSON.stringify(meta) });
  await log(c.get("me"), "meme.meta", { memeId: b.memeId, ...meta });
  return c.json({ ok: true });
});
admin.get("/dashboard", async (c) => {
  const w = await peek();
  const eco = w.engine.economy();
  const ids = w.engine.memes().map((m) => m.memeId);
  return c.json({
    supply: coins(eco.supply),
    supplyWeekAgo: null,
    weeklyGrowthPerActivePlayerPct: null,
    targetPct: 2,
    accounts: eco.accounts,
    activePlayers7d: await signals.activePlayers(),
    signups7d: 0,
    resets7d: 0,
    feesAllTime: null,
    fees24h: null,
    minted: null,
    house: eco.house.map((h) => ({ ...h, cash: coins(h.cash), pnl: coins(h.pnl) })).sort((a, b) => a.pnl - b.pnl),
    housePnl: coins(eco.house.reduce((s, h) => s + h.pnl, 0)),
    health: { seq: w.engine.seq, tickLagMs: Math.max(0, Date.now() - w.engine.time), orderP50Ms: null, orderP99Ms: null, orderSamples: 0, wsClients: 0, lastFeatures: await signals.lastUpdates(ids) },
  });
});
api.route("/admin", admin);

