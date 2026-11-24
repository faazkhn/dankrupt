// Prints the waitlist as CSV: `pnpm --filter web waitlist:export > waitlist.csv`.
// With the embedded dev database, stop `pnpm dev` first (PGlite allows one process at a time).
import { createDb, migrate } from "@dankrupt/db";

const db = createDb(process.env.DATABASE_URL ?? `pglite:${process.cwd()}/.data/pglite`);
await migrate(db);
const { rows } = await db.query<{ email: string; consent_at: Date; source: string | null; created_at: Date }>(
  "select email, consent_at, source, created_at from waitlist order by created_at",
);
const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
console.log("email,consent_at,source,created_at");
for (const r of rows)
  console.log([r.email, r.consent_at.toISOString(), r.source, r.created_at.toISOString()].map(cell).join(","));
await db.close();
