import { beforeEach, expect, test } from "vitest";
import { createDb, migrate, type Db } from "@dankrupt/db";
import { Sequencer } from "./sequencer.ts";

let db: Db;
beforeEach(async () => {
  db = createDb("pglite:");
  await migrate(db);
});

const seed = [{ memeId: "stonks", name: "Stonks", price: 100, depth: 500_000 }];

test("an order is persisted and replays to identical state after a restart", async () => {
  const s1 = await Sequencer.boot(db, seed);
  await s1.submit({ type: "account.open", accountId: "ana" });
  const out = await s1.submit({ type: "order.market", accountId: "ana", memeId: "stonks", side: "buy", qty: 30 });
  expect(out.fills[0].qty).toBe(30);
  const before = s1.engine.snapshot();

  const s2 = await Sequencer.boot(db, seed); // restart: same database, fresh process state
  expect(s2.engine.snapshot()).toBe(before);
  expect(s2.engine.account("ana").shares.stonks).toBe(30);
});

test("concurrent submissions are applied one at a time in sequence order", async () => {
  const s = await Sequencer.boot(db, seed);
  await s.submit({ type: "account.open", accountId: "ana" });
  await Promise.all(
    Array.from({ length: 20 }, () => s.submit({ type: "order.market", accountId: "ana", memeId: "stonks", side: "buy", qty: 1 })),
  );
  const { rows } = await db.query<{ seq: number }>("select seq::float8 as seq from events order by seq");
  expect(rows.map((r) => r.seq)).toEqual(rows.map((_, i) => i + 1));
  expect(s.engine.account("ana").shares.stonks).toBe(20);
});

test("journal projection balances to zero per commodity and survives restart without duplicates", async () => {
  const s1 = await Sequencer.boot(db, seed);
  await s1.submit({ type: "account.open", accountId: "ana" });
  await s1.submit({ type: "order.market", accountId: "ana", memeId: "stonks", side: "buy", qty: 10 });
  await Sequencer.boot(db, seed);
  const { rows } = await db.query<{ commodity: string; total: number; n: number }>(
    "select commodity, sum(amount)::float8 as total, count(*)::int as n from journal group by commodity order by commodity",
  );
  expect(rows).toEqual([
    { commodity: "coin", total: 0, n: 5 },
    { commodity: "share:stonks", total: 0, n: 2 },
  ]);
});

test("seed memes are listed once, not on every boot", async () => {
  await Sequencer.boot(db, seed);
  const s = await Sequencer.boot(db, seed);
  expect(s.engine.memes().map((m) => m.memeId)).toEqual(["stonks"]);
});
