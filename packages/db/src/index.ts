import { mkdirSync } from "node:fs";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

/** The one shape both drivers share: parameterised query returning rows. */
export type Db = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
};

/**
 * Postgres when a postgres:// URL is given, otherwise embedded PGlite.
 * shortcut: PGlite is single-process; dev only. Production must set DATABASE_URL.
 */
export function createDb(url = process.env.DATABASE_URL): Db {
  if (url?.startsWith("postgres")) {
    const pool = new pg.Pool({ connectionString: url });
    return { query: (s, p) => pool.query(s, p as unknown[]) as never, close: () => pool.end() };
  }
  const dir = url?.replace(/^pglite:/, "") || undefined; // undefined = in-memory
  if (dir) mkdirSync(dir, { recursive: true });
  const lite = new PGlite(dir);
  return { query: (s, p) => lite.query(s, p) as never, close: () => lite.close() };
}

// One statement per entry: the query API runs prepared statements, which allow only one.
const MIGRATIONS: string[] = [
  `create table waitlist (
     id bigint generated always as identity primary key,
     email text not null unique,
     consent_at timestamptz not null,
     source text,
     created_at timestamptz not null default now()
   )`,
  `create table events (
     seq bigint primary key,
     time timestamptz not null,
     body jsonb not null
   )`,
  `create table journal (
     seq bigint not null,
     account text not null,
     commodity text not null,
     amount bigint not null
   )`,
  `create index journal_seq on journal (seq)`,
  `create index journal_account on journal (account, commodity)`,
  `create table candles_1m (
     meme_id text not null,
     minute timestamptz not null,
     open double precision not null,
     high double precision not null,
     low double precision not null,
     close double precision not null,
     volume bigint not null default 0,
     primary key (meme_id, minute)
   )`,
  // Journal lines are keyed by their cause (an event or a tick) so replays write each line once.
  `drop table journal`,
  `create table journal (
     cause text not null,
     n int not null,
     seq bigint not null,
     time timestamptz not null,
     account text not null,
     commodity text not null,
     amount bigint not null,
     primary key (cause, n)
   )`,
  `create index journal_time on journal (time)`,
  `create index journal_account2 on journal (account, commodity)`,
  `create table meme_signal_map (
     meme_id text not null,
     source text not null,
     ref text not null,
     primary key (meme_id, source, ref)
   )`,
  `create table signal_raw (
     meme_id text not null,
     source text not null,
     day date not null,
     count bigint not null,
     primary key (meme_id, source, day)
   )`,
  `create table notices (
     account_id text not null,
     time timestamptz not null,
     kind text not null,
     meme_id text not null default '',
     text text not null,
     read boolean not null default false,
     primary key (account_id, time, kind, meme_id)
   )`,
  `create table closed_trades (
     account_id text not null,
     meme_id text not null,
     side text not null,
     opened_at timestamptz not null,
     closed_at timestamptz not null,
     peak_qty bigint not null,
     pnl bigint not null,
     basis bigint not null,
     primary key (account_id, meme_id, opened_at, closed_at)
   )`,
  `create index closed_trades_closed on closed_trades (closed_at)`,
  `create table equity_snapshots (
     account_id text not null,
     time timestamptz not null,
     equity bigint not null,
     cash_event text,
     primary key (account_id, time)
   )`,
];

/** Applies pending migrations in order; safe to call on every boot. */
export async function migrate(db: Db): Promise<void> {
  await db.query(`select pg_advisory_lock(727274)`); // web and server may boot together on one database
  try {
    await runMigrations(db);
  } finally {
    await db.query(`select pg_advisory_unlock(727274)`);
  }
}

async function runMigrations(db: Db): Promise<void> {
  await db.query(`create table if not exists schema_migrations (version int primary key)`);
  const { rows } = await db.query<{ v: number | null }>(`select max(version) as v from schema_migrations`);
  for (let v = (rows[0]?.v ?? 0) + 1; v <= MIGRATIONS.length; v++) {
    await db.query("begin");
    try {
      await db.query(MIGRATIONS[v - 1]);
      await db.query(`insert into schema_migrations (version) values ($1)`, [v]);
      await db.query("commit");
    } catch (e) {
      await db.query("rollback");
      throw e;
    }
  }
}
