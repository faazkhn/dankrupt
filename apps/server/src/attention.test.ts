import { expect, test } from "vitest";
import { createDb, migrate } from "@dankrupt/db";
import { InGame } from "./attention.ts";

const HOUR = 3_600_000;

test("views count once per player per 5 minutes; stars add steady attention; normalised per 1,000 active players", async () => {
  const db = createDb("pglite:");
  await migrate(db);
  const g = new InGame(db);
  const t = Date.UTC(2026, 10, 24, 10);
  expect(await g.view("ana", "m", t)).toBe(true);
  expect(await g.view("ana", "m", t + 60_000)).toBe(false); // within 5 minutes
  expect(await g.view("ana", "m", t + 6 * 60_000)).toBe(true);
  await g.view("bo", "m", t + 1_000);
  await g.star("ana", "m", true);
  await g.star("ana", "m", true); // idempotent
  expect(await g.watchlist("ana")).toEqual(["m"]);
  const h = await g.hourly("m", t - HOUR, t + HOUR);
  // 3 views that hour + 0.25 × 1 star, per 1,000 of max(10, 2 active) players
  expect(h).toEqual([0.25 * 100, (3 + 0.25) * 100]);
  await g.star("ana", "m", false);
  expect(await g.watchlist("ana")).toEqual([]);
});
