import type { Db } from "@dankrupt/db";
import type { Engine, EngineEvent, Output } from "@dankrupt/engine";

/**
 * Read models built from engine output: in-app notices, closed round-trip trades, and equity
 * snapshots for leaderboards. Writes are keyed so replaying history on boot adds nothing twice.
 */
export class Projections {
  private db: Db;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(db: Db) {
    this.db = db;
  }

  readonly onApplied = (ev: EngineEvent | null, out: Output) => {
    if (ev?.type === "account.open" && !out.rejects.length) {
      // Every TWR chain needs a starting point: the starting cash, at the moment the account opened.
      const time = ev.time;
      const id = ev.accountId;
      this.queue = this.queue.then(() =>
        this.db.query(
          `insert into equity_snapshots (account_id, time, equity, cash_event) select $1, to_timestamp($2 / 1000.0), $3, 'open'
           where not exists (select 1 from equity_snapshots where account_id = $1 and time <= to_timestamp($2 / 1000.0))`,
          [id, time, out.journal.find((l) => l.account === `player:${id}`)?.amount ?? 0],
        ),
      );
    }
    if (!out.notices.length && !out.closed.length) return;
    const notices = [...out.notices];
    const closed = [...out.closed];
    this.queue = this.queue.then(async () => {
      for (const n of notices)
        await this.db.query(
          `insert into notices (account_id, time, kind, meme_id, text) values ($1, to_timestamp($2 / 1000.0), $3, $4, $5) on conflict do nothing`,
          [n.accountId, n.time, n.kind, n.memeId ?? "", n.text],
        );
      for (const t of closed)
        await this.db.query(
          `insert into closed_trades (account_id, meme_id, side, opened_at, closed_at, peak_qty, pnl, basis)
           values ($1, $2, $3, to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0), $6, $7, $8) on conflict do nothing`,
          [t.accountId, t.memeId, t.side, t.openedAt, t.closedAt, t.peakQty, t.pnl, Math.round(t.basis)],
        );
    }).catch((e) => console.error("projection write failed", e));
  };

  /** Waits for queued writes (tests, shutdown). */
  flush() {
    return this.queue;
  }

  async snapshotEquity(engine: Engine, time = Date.now(), cashEvent: string | null = null, only?: string) {
    for (const id of only ? [only] : engine.accounts()) {
      const a = engine.account(id);
      await this.db.query(
        `insert into equity_snapshots (account_id, time, equity, cash_event) values ($1, to_timestamp($2 / 1000.0), $3, $4)
         on conflict (account_id, time) do update set equity = excluded.equity, cash_event = coalesce(excluded.cash_event, equity_snapshots.cash_event)`,
        [id, time, Math.round(a.equity), cashEvent],
      );
    }
  }

  /** Every five minutes, everyone's equity (the TWR boards chain these). */
  start(engine: Engine, ms = 5 * 60_000) {
    return setInterval(() => this.snapshotEquity(engine).catch((e) => console.error("equity snapshot failed", e)), ms).unref();
  }

  async notices(accountId: string, limit = 20) {
    const { rows } = await this.db.query<{ time: string; kind: string; meme_id: string; text: string; read: boolean }>(
      "select time::text, kind, meme_id, text, read from notices where account_id = $1 order by time desc limit $2",
      [accountId, limit],
    );
    return rows.map((r) => ({ time: Date.parse(r.time), kind: r.kind, memeId: r.meme_id || null, text: r.text, read: r.read }));
  }

  async markRead(accountId: string) {
    await this.db.query("update notices set read = true where account_id = $1 and not read", [accountId]);
  }

  async closedTrades(accountId: string, limit = 50) {
    const { rows } = await this.db.query<{ meme_id: string; side: string; opened_at: string; closed_at: string; peak_qty: number; pnl: number; basis: number }>(
      `select meme_id, side, opened_at::text, closed_at::text, peak_qty::float8 as peak_qty, pnl::float8 as pnl, basis::float8 as basis
       from closed_trades where account_id = $1 order by closed_at desc limit $2`,
      [accountId, limit],
    );
    return rows.map((r) => ({
      memeId: r.meme_id,
      side: r.side,
      openedAt: Date.parse(r.opened_at),
      closedAt: Date.parse(r.closed_at),
      peakQty: Number(r.peak_qty),
      pnl: Number(r.pnl),
      basis: Number(r.basis),
    }));
  }

  async equityHistory(accountId: string, since: number) {
    const { rows } = await this.db.query<{ time: string; equity: number; cash_event: string | null }>(
      "select time::text, equity::float8 as equity, cash_event from equity_snapshots where account_id = $1 and time >= to_timestamp($2 / 1000.0) order by time",
      [accountId, since],
    );
    return rows.map((r) => ({ time: Date.parse(r.time), equity: Number(r.equity), cashEvent: r.cash_event }));
  }
}
