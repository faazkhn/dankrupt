import { expect, test } from "vitest";
import { createDb, migrate } from "./index.ts";

test("migrate is idempotent", async () => {
  const db = createDb("pglite:");
  await migrate(db);
  await migrate(db);
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from schema_migrations");
  expect(rows[0].n).toBeGreaterThan(0);
  await db.close();
});

test("file-backed PGlite creates its directory", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = `${mkdtempSync(`${tmpdir()}/dk-`)}/nested/pg`;
  const db = createDb(`pglite:${dir}`);
  await migrate(db);
  await db.close();
});
