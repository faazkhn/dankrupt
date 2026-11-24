import type { Db } from "@dankrupt/db";
import { COIN, type Engine } from "@dankrupt/engine";

const DAY = 86_400_000;

/** Rolling sample of order round-trip times (ms) for p50/p99. */
export class Latency {
  private samples: number[] = [];
  record(ms: number) {
    this.samples.push(ms);
    if (this.samples.length > 2_000) this.samples.shift();
  }
  percentile(p: number) {
    if (!this.samples.length) return null;
    const s = [...this.samples].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  }
  get count() {
    return this.samples.length;
  }
}

/**
 * Operator dashboard numbers (PRD story 15): coin supply and its weekly growth per active player
 * against the 2% target, the house's P&L, fees and resets, and engine health.
 */
export async function dashboard(db: Db, engine: Engine, latency: Latency, extras: { wsClients: number; features: Record<string, number | null> }, now = Date.now()) {
  const eco = engine.economy();
  const weekAgo = now - 7 * DAY;
  const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const [then] = await q<{ s: number | null }>(
    `select sum(equity)::float8 as s from (select distinct on (account_id) equity from equity_snapshots
     where time <= to_timestamp($1 / 1000.0) order by account_id, time desc) x`,
    [weekAgo],
  );
  const [signups] = await q<{ n: number }>("select count(*)::int as n from equity_snapshots where cash_event = 'open' and time > to_timestamp($1 / 1000.0)", [weekAgo]);
  const [resetsWeek] = await q<{ n: number }>("select count(*)::int as n from equity_snapshots where cash_event = 'reset' and time > to_timestamp($1 / 1000.0)", [weekAgo]);
  const [active] = await q<{ n: number }>(
    `select count(*)::int as n from (select account_id from ingame_viewers where hour > to_timestamp($1 / 1000.0)
     union select account_id from closed_trades where closed_at > to_timestamp($1 / 1000.0)) x`,
    [weekAgo],
  );
  const [sink] = await q<{ all: number | null; day: number | null }>(
    `select sum(amount)::float8 as all, sum(amount) filter (where time > to_timestamp($1 / 1000.0))::float8 as day from journal where account = 'sink'`,
    [now - DAY],
  );
  const [mint] = await q<{ all: number | null }>("select -sum(amount)::float8 as all from journal where account = 'mint'");

  const start = engine.params.startingCash;
  const supplyThen = then?.s ?? null;
  // Growth beyond new sign-ups and resets (both mint coins on purpose), per active player, as % of a starting stake.
  const excess = supplyThen === null ? null : eco.supply - supplyThen - (signups.n + resetsWeek.n) * start;
  const perPlayer = excess === null || !active.n ? null : (excess / (active.n * start)) * 100;
  const coins = (uc: number | null) => (uc === null ? null : uc / COIN);
  return {
    supply: coins(eco.supply),
    supplyWeekAgo: coins(supplyThen),
    weeklyGrowthPerActivePlayerPct: perPlayer,
    targetPct: 2,
    accounts: eco.accounts,
    activePlayers7d: active.n,
    signups7d: signups.n,
    resets7d: resetsWeek.n,
    feesAllTime: coins(sink.all ?? 0),
    fees24h: coins(sink.day ?? 0),
    minted: coins(mint.all ?? 0),
    house: eco.house.map((h) => ({ ...h, cash: coins(h.cash), pnl: coins(h.pnl) })).sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0)),
    housePnl: coins(eco.house.reduce((s, h) => s + h.pnl, 0)),
    health: {
      seq: engine.seq,
      tickLagMs: Math.max(0, now - engine.time),
      orderP50Ms: latency.percentile(50),
      orderP99Ms: latency.percentile(99),
      orderSamples: latency.count,
      wsClients: extras.wsClients,
      lastFeatures: extras.features,
    },
  };
}
