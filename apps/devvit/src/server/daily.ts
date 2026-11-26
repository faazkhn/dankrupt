import { context, reddit, redis } from "@devvit/web/server";
import type { EventBody } from "@dankrupt/engine";
import approved from "../../../sim/memes.json" with { type: "json" };
import { mapSources } from "./signals.ts";
import { K, isBot, mutate } from "./store.ts";
import type { World } from "./world.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Market Day #1. Rounds run 00:00–24:00 UTC. */
export const LAUNCH = Date.UTC(2026, 10, 26);
/** How many approved memes trade from day one; the rest list one per day as the Market Day listing. */
const LAUNCH_SET = 10;
const OPENING_AUCTION_MS = 2 * HOUR;

export const dayStart = (t: number) => t - (t % DAY);
export const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10).replaceAll("-", "");
export const dayNumber = (t: number) => Math.floor((dayStart(t) - LAUNCH) / DAY) + 1;
/** Each player trades a fresh wallet each day: one engine account per player per round. */
export const roundAccount = (user: string, t: number) => `${user}--d${dayKey(t)}`;
export const roundOf = (accountId: string) => accountId.match(/^(.+)--d(\d{8})$/)?.slice(1) as [string, string] | undefined;

const memes = (approved as { memes: { id: string; title: string }[] }).memes;

export const DK = {
  players: (key: string) => `day:players:${key}`,
  results: (key: string) => `day:results:${key}`,
  player: (user: string) => `player:${user}`,
  settled: "day:settled",
  posts: "day:posts",
  flair: "day:flair",
  seenResult: (user: string) => `day:seen:${user}`,
};

export type Result = { rank: number; user: string; equity: number; returnPct: number };
export type PlayerStats = { streak: number; best: number; days: number; lastKey: string; wins: number; bestRank: number };

/** Lists the launch set and opens the market. Idempotent: a world that already has memes is left alone. */
export async function ensureSeeded() {
  const seeded = await mutate(({ world, now }) => {
    if (world.engine.seq) return false;
    for (const m of memes.slice(0, LAUNCH_SET)) world.submit({ type: "meme.list", memeId: m.id, name: m.title, price: 100, depth: 500_000 }, now);
    world.submit({ type: "dank.open" }, now);
    world.submit({ type: "basket.open" }, now);
    world.submit({ type: "liquidity.open" }, now);
    return true;
  });
  if (!seeded) return;
  // Launch day is already "rolled over": the install post is its Market Day thread.
  await redis.set(`${DK.settled}:${dayKey(Date.now())}`, "1", { expiration: new Date(Date.now() + 2 * DAY) });
  for (const m of memes.slice(0, LAUNCH_SET)) await mapSources(m.id, [m.title]);
}

/** Counts a player into today's round on their first order, and advances their streak. */
export async function markPlayed(user: string, now: number) {
  const key = dayKey(now);
  const first = (await redis.zScore(DK.players(key), user)) === undefined;
  if (!first) return;
  await redis.zAdd(DK.players(key), { member: user, score: now });
  const s = await stats(user);
  const continued = s.lastKey === dayKey(now - DAY);
  await redis.hSet(DK.player(user), {
    streak: String(continued ? s.streak + 1 : 1),
    best: String(Math.max(s.best, continued ? s.streak + 1 : 1)),
    days: String(s.days + 1),
    lastKey: key,
  });
}

export async function stats(user: string): Promise<PlayerStats> {
  const h = await redis.hGetAll(DK.player(user));
  return { streak: Number(h.streak ?? 0), best: Number(h.best ?? 0), days: Number(h.days ?? 0), lastKey: h.lastKey ?? "", wins: Number(h.wins ?? 0), bestRank: Number(h.bestRank ?? 0) };
}

/** A streak only counts if it reached yesterday or today. */
export const liveStreak = (s: PlayerStats, now: number) => (s.lastKey === dayKey(now) || s.lastKey === dayKey(now - DAY) ? s.streak : 0);

/** Today's standings, live: every player who traded today, by equity at the mark. */
export async function standings(world: World, now: number): Promise<Result[]> {
  const key = dayKey(now);
  const players = (await redis.zRange(DK.players(key), 0, -1, { by: "rank" })).map((r) => r.member);
  return rank(world, players.map((u) => [u, roundAccount(u, now)]));
}

function rank(world: World, pairs: [string, string][]): Result[] {
  const start = world.engine.params.startingCash;
  return pairs
    .filter(([, id]) => world.engine.hasAccount(id))
    .map(([user, id]) => ({ user, equity: world.engine.account(id).equity }))
    .sort((a, b) => b.equity - a.equity || a.user.localeCompare(b.user))
    .map((r, i) => ({ rank: i + 1, user: r.user, equity: r.equity / 1e6, returnPct: (r.equity / start - 1) * 100 }));
}

export async function results(key: string): Promise<Result[]> {
  const raw = await redis.get(DK.results(key));
  return raw ? JSON.parse(raw) : [];
}

/**
 * Runs once a new UTC day starts: ranks and closes yesterday's round accounts (positions settle at
 * the mark), records results, awards flair, lists the day's meme and posts the Market Day thread.
 */
export async function rollover(now: number) {
  const key = dayKey(now);
  const prevKey = dayKey(now - DAY);
  const claimed = await redis.set(`${DK.settled}:${key}`, "1", { nx: true, expiration: new Date(now + 2 * DAY) });
  if (!claimed) return;
  try {
    const players = new Set((await redis.zRange(DK.players(prevKey), 0, -1, { by: "rank" })).map((r) => r.member));
    const final = await mutate(({ world, now: t }) => {
      const stale = world.engine.accounts().filter((id) => !isBot(id) && roundOf(id) && roundOf(id)![1] !== key);
      const ranked = rank(world, stale.filter((id) => roundOf(id)![1] === prevKey && players.has(roundOf(id)![0])).map((id) => [roundOf(id)![0], id]));
      for (const id of stale) world.submit({ type: "account.close", accountId: id }, t);
      const listing = nextListing(world);
      if (listing) world.submit(listing, t);
      return { ranked, listing };
    });
    await redis.set(DK.results(prevKey), JSON.stringify(final.ranked));
    for (const r of final.ranked) {
      const s = await stats(r.user);
      await redis.hSet(DK.player(r.user), { wins: String(s.wins + (r.rank === 1 ? 1 : 0)), bestRank: String(s.bestRank ? Math.min(s.bestRank, r.rank) : r.rank) });
    }
    if (final.listing?.type === "meme.list") await mapSources(final.listing.memeId, [final.listing.name]);
    await awardFlair(final.ranked.slice(0, 3), dayNumber(now - DAY)).catch((e) => console.error("flair failed", e));
    await postMarketDay(now, final.listing?.type === "meme.list" ? final.listing.name : null).catch((e) => console.error("market day post failed", e));
  } catch (e) {
    await redis.del(`${DK.settled}:${key}`); // let the next cron run retry
    throw e;
  }
}

function nextListing(world: World): EventBody | null {
  const listed = new Set(world.engine.memes().map((m) => m.memeId));
  const m = memes.find((x) => !listed.has(x.id));
  if (!m) return null;
  return { type: "meme.list", memeId: m.id, name: m.title, price: 100, depth: 500_000, preOpenUntil: Date.now() + OPENING_AUCTION_MS };
}

async function awardFlair(top: Result[], day: number) {
  const subredditName = context.subredditName;
  if (!subredditName) return;
  const before: string[] = JSON.parse((await redis.get(DK.flair)) ?? "[]");
  for (const u of before) if (!top.some((t) => t.user === u)) await reddit.removeUserFlair(subredditName, u).catch(() => undefined);
  const medals = ["🥇", "🥈", "🥉"];
  for (const r of top) await reddit.setUserFlair({ subredditName, username: r.user, text: `${medals[r.rank - 1]} Day ${day} top trader` });
  await redis.set(DK.flair, JSON.stringify(top.map((t) => t.user)));
}

export async function postMarketDay(now: number, listing: string | null) {
  const subredditName = context.subredditName;
  if (!subredditName) return null;
  const n = dayNumber(now);
  const date = new Date(now).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const post = await reddit.submitCustomPost({
    subredditName,
    title: `Market Day #${n} · ${date}${listing ? ` · ${listing} lists today` : ""}`,
    entry: "default",
  });
  await redis.zAdd(DK.posts, { member: post.id, score: now });
  return post;
}
