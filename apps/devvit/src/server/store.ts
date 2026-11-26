import { redis, realtime } from "@devvit/web/server";
import { COIN, type EventBody, type Output } from "@dankrupt/engine";
import { World, type Applied, type Candle } from "./world.ts";
import { applyReceipts, type Receipt } from "./receipts.ts";

/** Every Redis key the app uses, in one place: Devvit can't list keys, so nothing may be built ad hoc elsewhere. */
export const K = {
  world: "world",
  beat: "beat",
  candles: (memeId: string) => `candles:${memeId}`,
  receipts: (a: string) => `rcpt:${a}`,
  notices: (a: string) => `notices:${a}`,
  closed: (a: string) => `closed:${a}`,
  /** Periodic equity snapshots (trimmed to 8 days). */
  equity: (a: string) => `eq:${a}`,
  /** Cash events (open, before-reset, reset): kept forever, they anchor all-time TWR. */
  cashEvents: (a: string) => `eqc:${a}`,
  board: (w: string) => `board:${w}`,
  sources: "sources",
  wiki: (memeId: string) => `wiki:${memeId}`,
  wikiFetched: "wiki:fetched",
  wikiFailed: "wiki:failed",
  features: (memeId: string) => `feat:${memeId}`,
  views: (memeId: string) => `views:${memeId}`,
  viewers: "viewers",
  seen: (a: string, memeId: string) => `seen:${a}:${memeId}`,
  stars: (memeId: string) => `stars:${memeId}`,
  watch: (a: string) => `watch:${a}`,
  candidates: "candidates",
  candidateSeq: "candidates:seq",
  actions: "actions",
  meta: "meta",
  jobs: "jobs",
};

export const CHANNEL = "markets";
const DAY = 86_400_000;

export type StoredNotice = { time: number; kind: string; memeId: string | null; text: string; read: boolean };
export type StoredTrade = { memeId: string; side: "long" | "short"; openedAt: number; closedAt: number; peakQty: number; pnl: number; basis: number };
export type Snap = { time: number; equity: number; cashEvent: string | null };

/** Desk bots trade through ordinary accounts; they get no receipts, notices or board rows. */
export const isBot = (accountId: string) => accountId.startsWith("@");

type Tx = Awaited<ReturnType<typeof redis.watch>>;
type Write = (tx: Tx) => Promise<unknown>;

export class Busy extends Error {}

/** What a mutation can do besides changing the world: extra keyed writes in the same transaction. */
export type Ctx = { world: World; now: number; write: (w: Write) => void };

/**
 * Loads the world, lets `fn` change it, and commits the new snapshot plus every projection in one
 * optimistic transaction on the world key. A concurrent commit aborts ours and we retry from scratch,
 * so two requests can never both spend the same coins.
 */
export async function mutate<T>(fn: (ctx: Ctx) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const tx = await redis.watch(K.world);
    const world = World.load(await redis.get(K.world));
    const now = Date.now();
    const extra: Write[] = [];
    let result: T;
    try {
      result = await fn({ world, now, write: (w) => extra.push(w) });
      world.advance(now); // ticks every caller sees as "now" are persisted too
      extra.push(...(await projections(world.log, world.closedCandles)));
    } catch (e) {
      await tx.unwatch();
      throw e;
    }
    await tx.multi();
    await tx.set(K.world, world.save());
    for (const w of extra) await w(tx);
    let committed = false;
    try {
      const res = await tx.exec();
      committed = Array.isArray(res) && res.length > 0;
    } catch {
      // Devvit's exec throws when a watched key changed under us: another commit won, so retry.
    }
    if (committed) {
      await broadcast(world).catch((e) => console.error("realtime send failed", e));
      return result;
    }
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * (attempt + 1)));
  }
  throw new Busy("the market is busy, try again");
}

/** The world advanced to now in memory only. Reads never write; the clock is persisted by `heartbeat` and the cron. */
export async function peek(): Promise<World> {
  const world = World.load(await redis.get(K.world));
  world.advance(Date.now());
  return world;
}

/** Persists the clock at most about once a second, whoever asks first, so polling viewers drive live prices. */
export async function heartbeat(): Promise<World> {
  const won = await redis.set(K.beat, "1", { nx: true, expiration: new Date(Date.now() + 1_000) });
  if (won) {
    const w = await mutate(({ world }) => world).catch((e) => { if (!(e instanceof Busy)) throw e; return null; });
    if (w) return w;
  }
  return peek();
}

export async function submit(body: EventBody): Promise<{ out: Output; world: World }> {
  return mutate(({ world, now }) => ({ out: world.submit(body, now), world }));
}

async function broadcast(world: World) {
  await realtime.send(CHANNEL, { type: "markets", dank: world.engine.dank, recent: world.dankHistory().slice(-30), rows: world.markets() });
}

const parse = <T>(raw: string | null | undefined, fallback: T): T => (raw ? (JSON.parse(raw) as T) : fallback);

/** Turns what the engine did into Redis writes: candles, receipts, notices, closed trades, equity anchors. */
async function projections(log: Applied[], candles: Candle[]): Promise<Write[]> {
  const writes: Write[] = [];
  for (const c of candles) writes.push((tx) => tx.zAdd(K.candles(c.memeId), { member: JSON.stringify(c), score: c.minute }));

  const touched = new Set<string>();
  const notices = new Map<string, StoredNotice[]>();
  const closed = new Map<string, StoredTrade[]>();
  for (const { ev, out } of log) {
    if (ev && "accountId" in ev && !isBot(ev.accountId) && ev.type.startsWith("order.")) touched.add(ev.accountId);
    for (const f of out.fills) if (!isBot(f.accountId)) touched.add(f.accountId);
    for (const o of out.orders) if (!isBot(o.accountId)) touched.add(o.accountId);
    for (const n of out.notices) {
      if (isBot(n.accountId)) continue;
      notices.set(n.accountId, [...(notices.get(n.accountId) ?? []), { time: n.time, kind: n.kind, memeId: n.memeId ?? null, text: n.text, read: false }]);
    }
    for (const t of out.closed) {
      if (isBot(t.accountId)) continue;
      const { accountId, ...rest } = t;
      closed.set(accountId, [...(closed.get(accountId) ?? []), { ...rest, basis: Math.round(rest.basis) }]);
    }
    if (ev?.type === "account.open" && !out.rejects.length && !isBot(ev.accountId)) {
      const equity = out.journal.find((l) => l.account === `player:${ev.accountId}`)?.amount ?? 0;
      const snap: Snap = { time: ev.time, equity, cashEvent: "open" };
      writes.push((tx) => tx.zAdd(K.cashEvents(ev.accountId), { member: JSON.stringify(snap), score: ev.time }));
    }
  }

  const ids = [...touched];
  if (ids.length) {
    const raw = await redis.mGet(ids.map(K.receipts));
    const books = new Map(ids.map((id, i) => [id, parse<Receipt[]>(raw[i], [])]));
    for (const { ev, out } of log) applyReceipts(books, ev, out);
    for (const [id, list] of books) writes.push((tx) => tx.set(K.receipts(id), JSON.stringify(list.slice(-50))));
  }
  if (notices.size) {
    const keys = [...notices.keys()];
    const raw = await redis.mGet(keys.map(K.notices));
    keys.forEach((id, i) => {
      const list = [...notices.get(id)!.reverse(), ...parse<StoredNotice[]>(raw[i], [])].slice(0, 20);
      writes.push((tx) => tx.set(K.notices(id), JSON.stringify(list)));
    });
  }
  if (closed.size) {
    const keys = [...closed.keys()];
    const raw = await redis.mGet(keys.map(K.closed));
    keys.forEach((id, i) => {
      // shortcut: last 200 round trips per player; boards need only the window's, raise if heavy traders hit it.
      const list = [...closed.get(id)!.reverse(), ...parse<StoredTrade[]>(raw[i], [])].slice(0, 200);
      writes.push((tx) => tx.set(K.closed(id), JSON.stringify(list)));
    });
  }
  return writes;
}

// ---------- read models ----------

export async function candles(world: World, memeId: string, limit = 180): Promise<Omit<Candle, "memeId">[]> {
  const rows = await redis.zRange(K.candles(memeId), 0, limit - 1, { by: "rank", reverse: true });
  const closed = rows.map((r) => JSON.parse(r.member) as Candle).reverse();
  const open = world.openCandle(memeId);
  return [...closed, ...(open ? [open] : [])].slice(-limit).map(({ memeId: _m, ...c }) => c);
}

export async function receipts(accountId: string): Promise<Receipt[]> {
  return parse<Receipt[]>(await redis.get(K.receipts(accountId)), []).slice().reverse();
}

export async function notices(accountId: string): Promise<StoredNotice[]> {
  return parse<StoredNotice[]>(await redis.get(K.notices(accountId)), []);
}

export async function markNoticesRead(accountId: string) {
  // Read-modify-write without the world lock: a notice landing in between can stay unread, which is harmless.
  const list = await notices(accountId);
  if (list.some((n) => !n.read)) await redis.set(K.notices(accountId), JSON.stringify(list.map((n) => ({ ...n, read: true }))));
}

export async function closedTrades(accountId: string): Promise<StoredTrade[]> {
  return parse<StoredTrade[]>(await redis.get(K.closed(accountId)), []);
}

export async function snapshotEquity(world: World, time: number) {
  const ids = world.engine.accounts().filter((id) => !isBot(id));
  for (let i = 0; i < ids.length; i += 50)
    await Promise.all(
      ids.slice(i, i + 50).map(async (id) => {
        const snap: Snap = { time, equity: Math.round(world.engine.account(id).equity), cashEvent: null };
        await redis.zAdd(K.equity(id), { member: JSON.stringify(snap), score: time });
        await redis.zRemRangeByScore(K.equity(id), 0, time - 8 * DAY);
      }),
    );
}

/** Equity history for the profile chart: periodic snapshots plus cash events, oldest first. */
export async function equityHistory(accountId: string, since: number): Promise<Snap[]> {
  const [p, c] = await Promise.all([
    redis.zRange(K.equity(accountId), since, Number.MAX_SAFE_INTEGER, { by: "score" }),
    redis.zRange(K.cashEvents(accountId), since, Number.MAX_SAFE_INTEGER, { by: "score" }),
  ]);
  return [...p, ...c].map((r) => JSON.parse(r.member) as Snap).sort((a, b) => a.time - b.time);
}

/** The TWR chain for a window: the last snapshot at or before it opens, then every cash event inside it. */
export async function twrSeries(accountId: string, since: number): Promise<Snap[]> {
  const last = (key: string) => redis.zRange(key, since, 0, { by: "score", reverse: true, limit: { offset: 0, count: 1 } });
  const [p, c, inside] = await Promise.all([
    last(K.equity(accountId)),
    last(K.cashEvents(accountId)),
    redis.zRange(K.cashEvents(accountId), since + 1, Number.MAX_SAFE_INTEGER, { by: "score" }),
  ]);
  const before = [...p, ...c].map((r) => JSON.parse(r.member) as Snap).sort((a, b) => b.time - a.time)[0];
  return [...(before ? [before] : []), ...inside.map((r) => JSON.parse(r.member) as Snap)];
}

export async function recordCashEvent(tx: Tx, accountId: string, snap: Snap) {
  await tx.zAdd(K.cashEvents(accountId), { member: JSON.stringify(snap), score: snap.time });
}

export const coins = (uc: number) => uc / COIN;
