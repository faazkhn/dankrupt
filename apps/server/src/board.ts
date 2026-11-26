import type { Db } from "@dankrupt/db";
import type { Engine } from "@dankrupt/engine";

export type Window = "daily" | "weekly" | "alltime";
export type Style = "scalper" | "swing" | "trend";
type Snap = { time: number; equity: number; cashEvent: string | null };

const HOUR = 3_600_000;
const IST = 5.5 * HOUR;

/** Start of the board's window: today or this week (Monday) in IST; all-time is 0. */
export function windowStart(w: Window, now: number): number {
  if (w === "alltime") return 0;
  const local = now + IST;
  const dayStart = local - (local % (24 * HOUR));
  if (w === "daily") return dayStart - IST;
  const weekday = (new Date(dayStart).getUTCDay() + 6) % 7; // Monday = 0
  return dayStart - weekday * 24 * HOUR - IST;
}

/**
 * Time-weighted return (PRD §4): returns chained between cash events. A reset ends one chain at the
 * equity just before it and starts the next at the topped-up equity, so losses stay on the record.
 * A chain that ends at or below zero pins the result at −100%.
 */
export function twr(snaps: Snap[], nowEquity: number): number {
  if (!snaps.length) return 0;
  let product = 1;
  let start = snaps[0].equity;
  for (const s of snaps.slice(1)) {
    if (s.cashEvent === "before-reset") {
      product *= start > 0 ? Math.max(0, s.equity) / start : 0;
    }
    if (s.cashEvent === "reset") start = s.equity;
  }
  product *= start > 0 ? Math.max(0, nowEquity) / start : 0;
  return Math.max(-1, product - 1);
}

export function styleOf(holdingMs: number[]): Style {
  const sorted = [...holdingMs].sort((a, b) => a - b);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return mid < HOUR ? "scalper" : mid <= 72 * HOUR ? "swing" : "trend";
}

export type BoardRow = { rank: number; accountId: string; twr: number; style: Style; trades: number; resets: number };

const MIN_TRADES = 5;

/** Ranks every player with at least 5 closed trades in the window by TWR, optionally within one style. */
export async function leaderboard(db: Db, engine: Engine, w: Window, style: Style | null, now = Date.now()): Promise<BoardRow[]> {
  const since = windowStart(w, now);
  const { rows: trades } = await db.query<{ account_id: string; held: number }>(
    `select account_id, extract(epoch from (closed_at - opened_at)) * 1000 as held
     from closed_trades where closed_at >= to_timestamp($1 / 1000.0)`,
    [since],
  );
  const holds = new Map<string, number[]>();
  for (const t of trades) holds.set(t.account_id, [...(holds.get(t.account_id) ?? []), Number(t.held)]);
  const eligible = [...holds].filter(([id, h]) => !id.startsWith("@desk") && h.length >= MIN_TRADES);
  if (!eligible.length) return [];

  const ids = eligible.map(([id]) => id);
  // The chain starts at the last snapshot at or before the window opens (or the first one inside it).
  const { rows: snaps } = await db.query<{ account_id: string; time: string; equity: number; cash_event: string | null }>(
    `select account_id, time::text, equity::float8 as equity, cash_event from equity_snapshots s
     where account_id = any($1) and (time >= to_timestamp($2 / 1000.0) or time = (
       select max(time) from equity_snapshots x where x.account_id = s.account_id and x.time < to_timestamp($2 / 1000.0)))
     order by account_id, time`,
    [ids, since],
  );
  const byAccount = new Map<string, Snap[]>();
  for (const r of snaps) byAccount.set(r.account_id, [...(byAccount.get(r.account_id) ?? []), { time: Date.parse(r.time), equity: Number(r.equity), cashEvent: r.cash_event }]);

  const rows = eligible
    .filter(([id]) => engine.hasAccount(id))
    .map(([id, h]) => {
      const a = engine.account(id);
      const series = byAccount.get(id) ?? [{ time: since, equity: engine.account(id).equity, cashEvent: null }];
      return { accountId: id, twr: twr(series, a.equity), style: styleOf(h), trades: h.length, resets: a.resets };
    })
    .filter((r) => !style || r.style === style)
    .sort((a, b) => b.twr - a.twr || a.accountId.localeCompare(b.accountId));
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}
