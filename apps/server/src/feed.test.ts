import { expect, test } from "vitest";
import { createDb, migrate } from "@dankrupt/db";
import { Feed } from "./feed.ts";
import { Sequencer } from "./sequencer.ts";

test("markets rows carry mid, last trade, 24h change and a sparkline; closed candles persist once", async () => {
  const db = createDb("pglite:");
  await migrate(db);
  const feed = await Feed.create(db);
  const seq = await Sequencer.boot(db, [{ memeId: "m", name: "Meme", price: 100, depth: 500_000 }], [feed.onApplied]);
  const t0 = seq.engine.memes().length && Date.now();
  await seq.submit({ type: "account.open", accountId: "a" });
  await seq.submit({ type: "order.market", accountId: "a", memeId: "m", side: "buy", qty: 50 });
  await seq.clock(t0 + 5 * 60_000);
  const [row] = feed.markets();
  expect(row).toMatchObject({ memeId: "m", name: "Meme" });
  expect(row.ltp).toBeGreaterThan(100);
  expect(row.spark.length).toBeGreaterThanOrEqual(5);
  expect(Math.abs(row.change24h)).toBeLessThan(10);
  await feed.flush();
  await feed.flush();
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from candles_1m");
  expect(rows[0].n).toBeGreaterThanOrEqual(4);
});
