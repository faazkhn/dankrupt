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
