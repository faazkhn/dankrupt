import type { Db } from "@dankrupt/db";
import { computeFeatures, DEFAULT_FEATURE_PARAMS, wikipediaHourly, type FeatureRow } from "@dankrupt/features";
import type { InGame } from "./attention.ts";
import type { Sequencer } from "./sequencer.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HISTORY_DAYS = 60;

/** Daily counts keyed YYYY-MM-DD. */
export type DailyCounts = Record<string, number>;
export type WikipediaFetch = (title: string, fromDay: string, toDay: string) => Promise<DailyCounts>;

const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const compact = (d: string) => d.replaceAll("-", "");

/**
 * Wikimedia per-article daily pageviews (user agents only). One request at a time, ~1.2s apart,
 * backing off on 429 as the research doc requires. Missing days in the reply mean zero views.
 */
export function wikipediaClient(userAgent = process.env.WIKI_USER_AGENT ?? "DankruptExchange/0.1 (free paper-money meme market)"): WikipediaFetch {
  let last = 0;
  return async (title, fromDay, toDay) => {
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replaceAll(" ", "_"))}/daily/${compact(fromDay)}/${compact(toDay)}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const wait = Math.max(0, last + 1_200 - Date.now()) + (attempt ? 2 ** attempt * 2_000 : 0);
      if (wait) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      const res = await fetch(url, { headers: { "user-agent": userAgent, accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) continue;
      if (res.status === 404) return {}; // no views recorded in the range (or not loaded yet)
      if (!res.ok) throw new Error(`wikipedia ${res.status} for ${title}`);
      const data = (await res.json()) as { items: { timestamp: string; views: number }[] };
      const out: DailyCounts = {};
      for (const it of data.items) out[`${it.timestamp.slice(0, 4)}-${it.timestamp.slice(4, 6)}-${it.timestamp.slice(6, 8)}`] = it.views;
      return out;
    }
    throw new Error(`wikipedia kept rate-limiting ${title}`);
  };
}

/**
 * The attention pipeline: keeps raw daily counts per meme, recomputes features from them, and sends
 * the engine a `meme.features` event whenever fair value or heat moves enough to matter.
 */
export class Signals {
  private latest = new Map<string, FeatureRow[]>();
  private db: Db;
  private seq: Sequencer;
  private fetchWiki: WikipediaFetch;

  private ingame: InGame | undefined;

  constructor(db: Db, seq: Sequencer, fetchWiki: WikipediaFetch, ingame?: InGame) {
    this.db = db;
    this.seq = seq;
    this.fetchWiki = fetchWiki;
    this.ingame = ingame;
  }

  async mapSources(memeId: string, wikipedia: string[], youtube: string[] = []) {
    for (const ref of wikipedia)
      await this.db.query("insert into meme_signal_map (meme_id, source, ref) values ($1, 'wikipedia', $2) on conflict do nothing", [memeId, ref]);
    // YouTube ids are for official embeds only; no statistics are fetched until ticket 09b's approval.
    for (const ref of youtube)
      await this.db.query("insert into meme_signal_map (meme_id, source, ref) values ($1, 'youtube', $2) on conflict do nothing", [memeId, ref]);
  }

  async videos(memeId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ ref: string }>("select ref from meme_signal_map where meme_id = $1 and source = 'youtube'", [memeId]);
    return rows.map((r) => r.ref);
  }

  /** Fetches whatever days are missing, then recomputes every meme's features. */
  async refresh(now = Date.now()) {
    const { rows: maps } = await this.db.query<{ meme_id: string; ref: string }>("select meme_id, ref from meme_signal_map where source = 'wikipedia'");
    const byMeme = new Map<string, string[]>();
    for (const r of maps) byMeme.set(r.meme_id, [...(byMeme.get(r.meme_id) ?? []), r.ref]);

    const yesterday = day(now - DAY);
    for (const [memeId, titles] of byMeme) {
      const { rows } = await this.db.query<{ d: string | null }>(
        "select to_char(max(day), 'YYYY-MM-DD') as d from signal_raw where meme_id = $1 and source = 'wikipedia'",
        [memeId],
      );
      // Refetch the last two stored days too: Wikipedia may still be filling them in.
      const from = rows[0]?.d ? day(Date.parse(rows[0].d) - 2 * DAY) : day(now - HISTORY_DAYS * DAY);
      if (from > yesterday) continue;
      const sum: DailyCounts = {};
      try {
        for (const t of titles) for (const [d, v] of Object.entries(await this.fetchWiki(t, from, yesterday))) sum[d] = (sum[d] ?? 0) + v;
      } catch (e) {
        console.error(`wikipedia fetch failed for ${memeId}`, e);
        continue; // stale until the next refresh; features mark it delayed if this lasts
      }
      // Days the API skipped inside the range had zero views, unless they're the last (possibly unloaded) day.
      for (let t = Date.parse(from); day(t) < yesterday; t += DAY) sum[day(t)] ??= 0;
      for (const [d, v] of Object.entries(sum))
        await this.db.query(
          `insert into signal_raw (meme_id, source, day, count) values ($1, 'wikipedia', $2, $3)
           on conflict (meme_id, source, day) do update set count = excluded.count`,
          [memeId, d, v],
        );
    }
    await this.recompute(now, this.ingame ? this.seq.engine.memes().map((m) => m.memeId) : [...byMeme.keys()]);
  }

  private async recompute(now: number, memeIds: string[]) {
    const start = Math.floor((now - HISTORY_DAYS * DAY) / HOUR) * HOUR;
    const end = Math.floor(now / HOUR) * HOUR + HOUR;
    const listed = new Map(this.seq.engine.memes().map((m) => [m.memeId, m]));
    for (const memeId of memeIds) {
      const meme = listed.get(memeId);
      if (!meme) continue;
      const { rows } = await this.db.query<{ d: string; count: number }>(
        "select to_char(day, 'YYYY-MM-DD') as d, count::float8 as count from signal_raw where meme_id = $1 and source = 'wikipedia'",
        [memeId],
      );
      const daily: DailyCounts = Object.fromEntries(rows.map((r) => [r.d, Number(r.count)]));
      const sources = {
        wikipedia: wikipediaHourly(daily, start, end),
        ...(this.ingame ? { ingame: await this.ingame.hourly(memeId, start, end) } : {}),
      };
      const features = computeFeatures({ start, ipoTime: meme.listedAt, sources }, DEFAULT_FEATURE_PARAMS);
      this.latest.set(memeId, features);
      const f = features.at(-1);
      if (!f) continue;
      const fairMoved = Math.abs(f.fair / meme.rawFairValue - 1) > 0.0005;
      const heatMoved = Math.abs(f.heat - meme.heat) > 0.01;
      if (fairMoved || heatMoved)
        await this.seq.submit({ type: "meme.features", memeId, fairValue: round(f.fair, 4), heat: round(f.heat, 4), z: round(f.z, 4), acc: round(f.acc, 4) });
    }
  }

  /** Recent attention for the meme page: raw daily views, and hourly heat and fair value (every 3h). */
  async attention(memeId: string) {
    const { rows } = await this.db.query<{ d: string; count: number }>(
      "select to_char(day, 'YYYY-MM-DD') as d, count::float8 as count from signal_raw where meme_id = $1 and source = 'wikipedia' order by day desc limit 30",
      [memeId],
    );
    const features = (this.latest.get(memeId) ?? []).slice(-30 * 24).filter((_, i) => i % 3 === 0);
    const last = this.latest.get(memeId)?.at(-1);
    return {
      wikipediaDaily: rows.reverse().map((r) => ({ day: r.d, views: Number(r.count) })),
      series: features.map((f) => ({ time: f.time, heat: round(f.heat, 3), fair: round(f.fair, 2) })),
      delayed: last?.delayed ?? false, // nothing computed yet (just booted) isn't "delayed"
      heat: last?.heat ?? null,
      momentum: last?.v ?? null,
    };
  }

  /** Refreshes now and then every `ms`. Wikipedia only changes daily, so hourly is plenty. */
  start(ms = HOUR) {
    const run = () => this.refresh().catch((e) => console.error("signals refresh failed", e));
    void run();
    return setInterval(run, ms).unref();
  }
}

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
