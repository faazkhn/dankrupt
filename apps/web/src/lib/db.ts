import { createDb, migrate, type Db } from "@dankrupt/db";

const g = globalThis as unknown as { __dankruptDb?: Promise<Db> };

/** One migrated connection per server process (survives dev hot reloads). */
export function getDb(): Promise<Db> {
  return (g.__dankruptDb ??= (async () => {
    const db = createDb(process.env.DATABASE_URL ?? `pglite:${process.cwd()}/.data/pglite`);
    await migrate(db);
    return db;
  })().catch((e) => {
    g.__dankruptDb = undefined; // don't cache a failed boot; retry on the next request
    throw e;
  }));
}
