import type { Db } from "@dankrupt/db";

const HOUR = 3_600_000;
const DEDUPE_MS = 5 * 60_000;

/**
 * In-game attention (PRD §5): meme page views and watchlist stars. A player's view of a meme counts
 * at most once per 5 minutes. Counts are normalised per 1,000 active players when features are built.
 */
export class InGame {
  private db: Db;
  private seen = new Map<string, number>(); // `${account}|${meme}` → last counted view

  constructor(db: Db) {
    this.db = db;
  }

  async view(accountId: string, memeId: string, now = Date.now()) {
    const key = `${accountId}|${memeId}`;
    if (now - (this.seen.get(key) ?? 0) < DEDUPE_MS) return false;
    this.seen.set(key, now);
    const hour = now - (now % HOUR);
    await this.db.query(
      `insert into ingame_views (meme_id, hour, views) values ($1, to_timestamp($2 / 1000.0), 1)
       on conflict (meme_id, hour) do update set views = ingame_views.views + 1`,
      [memeId, hour],
    );
    await this.db.query("insert into ingame_viewers (account_id, hour) values ($1, to_timestamp($2 / 1000.0)) on conflict do nothing", [accountId, hour]);
    return true;
  }

  async star(accountId: string, memeId: string, on: boolean) {
    if (on) await this.db.query("insert into watchlist (account_id, meme_id) values ($1, $2) on conflict do nothing", [accountId, memeId]);
    else await this.db.query("delete from watchlist where account_id = $1 and meme_id = $2", [accountId, memeId]);
  }

  async watchlist(accountId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ meme_id: string }>("select meme_id from watchlist where account_id = $1 order by created_at", [accountId]);
    return rows.map((r) => r.meme_id);
  }

  /**
   * Hourly in-game attention for one meme from `start` to `end`: (views that hour + 0.25 × stars)
   * per 1,000 players active in the last day. Never stale: no views simply means zero.
   */
  async hourly(memeId: string, start: number, end: number): Promise<number[]> {
    const { rows: views } = await this.db.query<{ h: number; views: number }>(
      "select extract(epoch from hour) * 1000 as h, views from ingame_views where meme_id = $1 and hour >= to_timestamp($2 / 1000.0)",
      [memeId, start],
    );
    const { rows: stars } = await this.db.query<{ n: number }>("select count(*)::int as n from watchlist where meme_id = $1", [memeId]);
    const { rows: active } = await this.db.query<{ n: number }>(
      "select count(distinct account_id)::int as n from ingame_viewers where hour >= to_timestamp($1 / 1000.0)",
      [end - 24 * HOUR],
    );
    const perK = 1_000 / Math.max(10, active[0]?.n ?? 0); // shortcut: floor of 10 players so a lone tester can't swing it
    const byHour = new Map(views.map((r) => [Number(r.h), Number(r.views)]));
    const out: number[] = [];
    for (let t = start; t < end; t += HOUR) out.push(((byHour.get(t) ?? 0) + 0.25 * (stars[0]?.n ?? 0)) * perK);
    return out;
  }
}
