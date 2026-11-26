import { redis, settings } from "@devvit/web/server";
import type { EventBody } from "@dankrupt/engine";
import { computeFeatures, DEFAULT_FEATURE_PARAMS, wikipediaHourly, type FeatureRow } from "@dankrupt/features";
import { wikipediaClient } from "../../../server/src/signals.ts";
import { K } from "./store.ts";
import type { World } from "./world.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HISTORY_DAYS = 60;
const DEDUPE_MS = 5 * 60_000;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Wikimedia asks automated clients for a contact; the developer sets it as the `wikiContact` secret. */
export async function userAgent() {
  const contact = await settings.get<string>("wikiContact").catch(() => undefined);
  return `DankruptExchange/0.2 (Reddit Devvit app${contact ? `; ${contact}` : ""})`;
}
const wiki = async () => wikipediaClient(await userAgent());

type Sources = { wikipedia: string[]; youtube: string[] };

export async function mapSources(memeId: string, wikipedia: string[], youtube: string[] = []) {
  await redis.hSet(K.sources, { [memeId]: JSON.stringify({ wikipedia, youtube } satisfies Sources) });
}

async function sources(): Promise<Record<string, Sources>> {
  const raw = await redis.hGetAll(K.sources);
  return Object.fromEntries(Object.entries(raw).map(([id, v]) => [id, JSON.parse(v) as Sources]));
}

/**
 * Fetches missing Wikipedia days for memes not yet fetched today, within a time budget so one cron
 * run stays under Devvit's 30 s request limit. Returns the memes it updated.
 */
export async function fetchDue(now: number, budgetMs = 15_000): Promise<string[]> {
  const started = Date.now();
  const today = day(now);
  const yesterday = day(now - DAY);
  const [maps, fetched, failed] = await Promise.all([sources(), redis.hGetAll(K.wikiFetched), redis.hGetAll(K.wikiFailed)]);
  const due = Object.entries(maps).filter(([id, s]) => s.wikipedia.length && fetched[id] !== today && now - Number(failed[id] ?? 0) > HOUR);
  if (!due.length) return [];
  const fetchWiki = await wiki();
  const done: string[] = [];
  for (const [memeId, { wikipedia }] of due) {
    if (Date.now() - started > budgetMs) break;
    const stored = Object.keys(await redis.hGetAll(K.wiki(memeId))).sort().at(-1);
    // Refetch the last two stored days too: Wikipedia may still be filling them in.
    const from = stored ? day(Date.parse(stored) - 2 * DAY) : day(now - HISTORY_DAYS * DAY);
    const sum: Record<string, number> = {};
    try {
      for (const t of wikipedia) for (const [d, v] of Object.entries(await fetchWiki(t, from, yesterday))) sum[d] = (sum[d] ?? 0) + v;
    } catch (e) {
      console.error(`wikipedia fetch failed for ${memeId}: ${(e as Error).message}`);
      await redis.hSet(K.wikiFailed, { [memeId]: String(now) });
      continue; // stale until a later run; features mark it delayed if this lasts
    }
    for (let t = Date.parse(from); day(t) < yesterday; t += DAY) sum[day(t)] ??= 0;
    if (Object.keys(sum).length) await redis.hSet(K.wiki(memeId), Object.fromEntries(Object.entries(sum).map(([d, v]) => [d, String(v)])));
    await redis.hSet(K.wikiFetched, { [memeId]: today });
    done.push(memeId);
  }
  return done;
}

/** Recomputes features and returns the `meme.features` events worth sending (fair value or heat moved). */
export async function recompute(world: World, memeIds: string[], now: number): Promise<EventBody[]> {
  const start = Math.floor((now - HISTORY_DAYS * DAY) / HOUR) * HOUR;
  const end = Math.floor(now / HOUR) * HOUR + HOUR;
  const listed = new Map(world.engine.memes().map((m) => [m.memeId, m]));
  const events: EventBody[] = [];
  for (const memeId of memeIds) {
    const meme = listed.get(memeId);
    if (!meme) continue;
    const raw = await redis.hGetAll(K.wiki(memeId));
    const daily = Object.fromEntries(Object.entries(raw).map(([d, v]) => [d, Number(v)]));
    const rows = computeFeatures(
      { start, ipoTime: meme.listedAt, sources: { wikipedia: wikipediaHourly(daily, start, end), ingame: await hourly(memeId, start, end) } },
      DEFAULT_FEATURE_PARAMS,
    );
    await storeFeatures(memeId, rows);
    const f = rows.at(-1);
    if (!f) continue;
    if (Math.abs(f.fair / meme.rawFairValue - 1) > 0.0005 || Math.abs(f.heat - meme.heat) > 0.01)
      events.push({ type: "meme.features", memeId, fairValue: round(f.fair, 4), heat: round(f.heat, 4), z: round(f.z, 4), acc: round(f.acc, 4) });
  }
  return events;
}

type StoredFeatures = { series: { time: number; heat: number; fair: number }[]; delayed: boolean; heat: number | null; momentum: number | null; time: number | null };

async function storeFeatures(memeId: string, rows: FeatureRow[]) {
  const last = rows.at(-1);
  const series = rows.slice(-30 * 24).filter((_, i) => i % 3 === 0).map((f) => ({ time: f.time, heat: round(f.heat, 3), fair: round(f.fair, 2) }));
  const v: StoredFeatures = { series, delayed: last?.delayed ?? false, heat: last?.heat ?? null, momentum: last?.v ?? null, time: last?.time ?? null };
  await redis.set(K.features(memeId), JSON.stringify(v));
}

/** Recent attention for the meme page: raw daily views, and hourly heat and fair value (every 3h). */
export async function attention(memeId: string) {
  const [raw, feat] = await Promise.all([redis.hGetAll(K.wiki(memeId)), redis.get(K.features(memeId))]);
  const f: StoredFeatures = feat ? JSON.parse(feat) : { series: [], delayed: false, heat: null, momentum: null, time: null };
  const wikipediaDaily = Object.entries(raw).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([d, v]) => ({ day: d, views: Number(v) }));
  return { wikipediaDaily, series: f.series, delayed: f.delayed, heat: f.heat, momentum: f.momentum };
}

export async function lastUpdates(memeIds: string[]): Promise<Record<string, number | null>> {
  const raw = memeIds.length ? await redis.mGet(memeIds.map(K.features)) : [];
  return Object.fromEntries(memeIds.map((id, i) => [id, raw[i] ? (JSON.parse(raw[i]!) as StoredFeatures).time : null]));
}

export async function videos(memeId: string): Promise<string[]> {
  const raw = await redis.hGet(K.sources, memeId);
  return raw ? (JSON.parse(raw) as Sources).youtube : [];
}

// ---------- in-game attention (PRD §5) ----------

/** A player's view of a meme counts at most once per 5 minutes. */
export async function view(accountId: string, memeId: string, now = Date.now()) {
  const fresh = await redis.set(K.seen(accountId, memeId), "1", { nx: true, expiration: new Date(now + DEDUPE_MS) });
  if (!fresh) return false;
  const hour = now - (now % HOUR);
  await redis.hIncrBy(K.views(memeId), String(hour), 1);
  await redis.zAdd(K.viewers, { member: accountId, score: hour });
  return true;
}

export async function star(accountId: string, memeId: string, on: boolean, now = Date.now()) {
  if (on) {
    await redis.zAdd(K.watch(accountId), { member: memeId, score: now });
    await redis.zAdd(K.stars(memeId), { member: accountId, score: now });
  } else {
    await redis.zRem(K.watch(accountId), [memeId]);
    await redis.zRem(K.stars(memeId), [accountId]);
  }
}

export async function watchlist(accountId: string): Promise<string[]> {
  return (await redis.zRange(K.watch(accountId), 0, -1, { by: "rank" })).map((r) => r.member);
}

/** (views that hour + 0.25 × stars) per 1,000 players active in the last day, hourly from `start` to `end`. */
async function hourly(memeId: string, start: number, end: number): Promise<number[]> {
  await redis.zRemRangeByScore(K.viewers, 0, end - DAY - 1);
  const [views, stars, active] = await Promise.all([redis.hGetAll(K.views(memeId)), redis.zCard(K.stars(memeId)), redis.zCard(K.viewers)]);
  const perK = 1_000 / Math.max(10, active); // shortcut: floor of 10 players so a lone tester can't swing it
  const out: number[] = [];
  for (let t = start; t < end; t += HOUR) out.push((Number(views[String(t)] ?? 0) + 0.25 * stars) * perK);
  return out;
}

export async function activePlayers() {
  return redis.zCard(K.viewers);
}

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
