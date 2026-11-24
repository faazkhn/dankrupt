import { describe, expect, test } from "vitest";
import { styleOf, twr, windowStart } from "./board.ts";

const H = 3_600_000;

describe("time-weighted return", () => {
  test("no cash events: plain return from window start to now", () => {
    expect(twr([{ time: 0, equity: 100, cashEvent: null }], 110)).toBeCloseTo(0.1, 9);
  });

  test("a reset starts a new chain instead of erasing losses", () => {
    // lost 90% (100 → 10), reset to 100, then made 20%: (10/100)·(120/100) − 1 = −88%
    const snaps = [
      { time: 0, equity: 100, cashEvent: null },
      { time: H - 1, equity: 10, cashEvent: "before-reset" },
      { time: H, equity: 100, cashEvent: "reset" },
    ];
    expect(twr(snaps, 120)).toBeCloseTo(-0.88, 9);
  });

  test("a wipeout to zero or below keeps −100% forever on the all-time board", () => {
    const snaps = [
      { time: 0, equity: 100, cashEvent: null },
      { time: H - 1, equity: -50, cashEvent: "before-reset" },
      { time: H, equity: 100, cashEvent: "reset" },
    ];
    expect(twr(snaps, 500)).toBe(-1);
  });
});

describe("styles (median holding time of the window's trades)", () => {
  test("under an hour is a scalper, up to three days a swing trader, beyond that a trend-spotter", () => {
    expect(styleOf([10, 20, 59].map((m) => m * 60_000))).toBe("scalper");
    expect(styleOf([2, 5, 30].map((h) => h * H))).toBe("swing");
    expect(styleOf([80, 100, 200].map((h) => h * H))).toBe("trend");
  });
});

describe("IST windows", () => {
  test("the daily board starts at midnight IST, the weekly board on Monday", () => {
    const now = Date.UTC(2026, 10, 26, 20, 0); // Thu 26 Nov 20:00 UTC = Fri 27 Nov 01:30 IST
    expect(new Date(windowStart("daily", now)).toISOString()).toBe("2026-11-26T18:30:00.000Z");
    expect(new Date(windowStart("weekly", now)).toISOString()).toBe("2026-11-22T18:30:00.000Z"); // Mon 23 Nov 00:00 IST
  });
});

import { createDb, migrate } from "@dankrupt/db";
import { leaderboard } from "./board.ts";
import { Projections } from "./projections.ts";
import { Sequencer } from "./sequencer.ts";

test("only players with 5+ closed trades rank, by TWR, and each gets a style", async () => {
  const db = createDb("pglite:");
  await migrate(db);
  const projections = new Projections(db);
  const seq = await Sequencer.boot(db, [{ memeId: "m", name: "M", price: 100, depth: 500_000 }], [projections.onApplied]);
  for (const id of ["busy", "lazy"]) await seq.submit({ type: "account.open", accountId: id });
  await projections.snapshotEquity(seq.engine, Date.now() - 1_000);
  for (let i = 0; i < 5; i++) {
    await seq.submit({ type: "order.market", accountId: "busy", memeId: "m", side: "buy", qty: 10 });
    await seq.submit({ type: "order.market", accountId: "busy", memeId: "m", side: "sell", qty: 10 });
  }
  await seq.submit({ type: "order.market", accountId: "lazy", memeId: "m", side: "buy", qty: 10 });
  await seq.submit({ type: "order.market", accountId: "lazy", memeId: "m", side: "sell", qty: 10 });
  await projections.flush();
  const board = await leaderboard(db, seq.engine, "alltime", null);
  expect(board.map((r) => r.accountId)).toEqual(["busy"]);
  expect(board[0]).toMatchObject({ rank: 1, style: "scalper", trades: 5 });
  expect(board[0].twr).toBeLessThan(0); // five round trips pay the spread and fees
  expect(await leaderboard(db, seq.engine, "alltime", "trend")).toEqual([]);
});
