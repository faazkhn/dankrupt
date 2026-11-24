import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { COIN, DEFAULT_PARAMS, Engine, type EventBody, type JournalLine, type Output } from "./index.ts";

const quiet = { ...DEFAULT_PARAMS, noisePerSqrtHour: 0 };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function exchange(params = quiet) {
  const e = new Engine(params);
  let seq = 0;
  let now = 0;
  const run = (b: EventBody, at = now): Output => {
    now = at;
    return e.apply({ ...b, seq: ++seq, time: at } as never);
  };
  run({ type: "meme.list", memeId: "m", name: "M", price: 100, depth: 500_000 });
  for (const id of ["ana", "bo", "cy"]) run({ type: "account.open", accountId: id });
  return { e, run, at: (t: number) => (now = t) };
}

/** bo holds 100 shares and the house has drifted back to exactly 100 with base spread. */
function boHolds100() {
  const x = exchange();
  x.run({ type: "order.market", accountId: "bo", memeId: "m", side: "buy", qty: 100 });
  x.e.advance(10 * DAY); // 40 half-lives, and the 24h VWAP window has emptied
  x.at(10 * DAY);
  return x;
}

describe("PRD §6.7 worked example", () => {
  test("a market buy of 300 against one ask of 100 @ 101 fills 21 house, 100 book, 179 house for 30,964.6 coins", () => {
    const { e, run } = boHolds100();
    expect(e.meme("m").price).toBeCloseTo(100, 6);
    run({ type: "order.limit", accountId: "bo", memeId: "m", side: "sell", qty: 100, price: 101 });
    const cashBefore = e.account("ana").cash;
    const out = run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 300 });
    const mine = out.fills.filter((f) => f.accountId === "ana");
    expect(mine.map((f) => [f.source, f.qty])).toEqual([
      ["house", 21],
      ["book", 100],
      ["house", 179],
    ]);
    const gross = mine.reduce((s, f) => s + f.cost, 0) / COIN;
    expect(gross).toBeCloseTo(30_964.6, 0);
    expect((cashBefore - e.account("ana").cash) / COIN).toBeCloseTo(30_964.6 + 31, 0); // plus the 0.1% taker fee
    expect(e.meme("m").price).toBeCloseTo(108.507, 2);
    // bo was the maker: paid no fee, got exactly 101 × 100
    const boFill = out.fills.find((f) => f.accountId === "bo")!;
    expect(boFill).toMatchObject({ role: "maker", fee: 0, cost: 101 * 100 * COIN });
  });

  test("the last traded price is the last share's price, not the sweep's average", () => {
    const { run, e } = exchange();
    const out = run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 800 });
    const avg = out.fills[0].cost / COIN / 800;
    expect(out.trades.at(-1)!.price).toBeCloseTo(e.meme("m").ask, 6);
    expect(out.trades.at(-1)!.price).toBeGreaterThan(avg);
  });
});

describe("limit orders", () => {
  test("a buy below the market rests, holds back its cash, and cancelling releases it", () => {
    const { e, run } = exchange();
    const out = run({ type: "order.limit", accountId: "ana", memeId: "m", side: "buy", qty: 10, price: 95 });
    expect(out.fills).toEqual([]);
    expect(e.book("m").bids).toEqual([{ price: 95, qty: 10, orders: 1 }]);
    const held = 10 * (95 * COIN + Math.ceil(95 * COIN * 0.001));
    expect(e.account("ana").heldCash).toBe(held);
    expect(e.account("ana").freeCash).toBe(100_000 * COIN - held);
    const orderId = e.openOrders("ana")[0].orderId;
    run({ type: "order.cancel", accountId: "ana", orderId });
    expect(e.account("ana").heldCash).toBe(0);
    expect(e.book("m").bids).toEqual([]);
  });

  test("a limit buy at or above the ask fills immediately, but never above its limit", () => {
    const { e, run } = exchange();
    const out = run({ type: "order.limit", accountId: "ana", memeId: "m", side: "buy", qty: 900, price: 102 });
    const filled = out.fills.reduce((s, f) => s + f.qty, 0);
    expect(filled).toBeGreaterThan(0);
    expect(filled).toBeLessThan(900);
    for (const f of out.fills) expect(f.cost / f.qty).toBeLessThanOrEqual(102 * COIN);
    expect(e.book("m").bids[0]).toMatchObject({ price: 102, qty: 900 - filled });
  });

  test("you can't place a buy you can't pay for, or sell shares you don't have", () => {
    const { run } = exchange();
    expect(run({ type: "order.limit", accountId: "ana", memeId: "m", side: "buy", qty: 2_000, price: 60 }).rejects[0].reason).toMatch(/free cash/);
    expect(run({ type: "order.limit", accountId: "ana", memeId: "m", side: "sell", qty: 5_000, price: 150 }).rejects[0].reason).toMatch(/margin/);
    expect(run({ type: "order.limit", accountId: "ana", memeId: "m", side: "buy", qty: 1, price: 10.005 }).rejects[0].reason).toMatch(/steps of 0.01/);
  });

  test("players win ties, and earlier orders fill first at the same price", () => {
    const { e, run } = boHolds100();
    run({ type: "order.market", accountId: "cy", memeId: "m", side: "buy", qty: 50 });
    e.advance(20 * DAY);
    const t = 20 * DAY;
    // 100.10 is inside the house's ask (100.15), so the book is the better source
    run({ type: "order.limit", accountId: "bo", memeId: "m", side: "sell", qty: 10, price: 100.1 }, t);
    run({ type: "order.limit", accountId: "cy", memeId: "m", side: "sell", qty: 10, price: 100.1 }, t);
    const out = run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 15 }, t);
    const makers = out.fills.filter((f) => f.role === "maker").map((f) => [f.accountId, f.qty]);
    expect(makers).toEqual([
      ["bo", 10],
      ["cy", 5],
    ]);
  });

  test("an order with an expiry is cancelled on the first tick after it", () => {
    const { e, run } = exchange();
    run({ type: "order.limit", accountId: "ana", memeId: "m", side: "buy", qty: 3, price: 90, expiresAt: HOUR });
    e.advance(HOUR - 2_000);
    expect(e.openOrders("ana")).toHaveLength(1);
    const out = e.advance(HOUR);
    expect(out.orders).toContainEqual(expect.objectContaining({ status: "expired" }));
    expect(e.openOrders("ana")).toHaveLength(0);
    expect(e.account("ana").heldCash).toBe(0);
  });

  test("no-cross: when the house drifts down through a resting bid, the bid fills against the house as a maker", () => {
    const x = exchange();
    // listed at 100 but worth 50: the house drifts down toward 50 and runs into ana's bid at 80
    x.run({ type: "meme.list", memeId: "cheap", name: "C", price: 100, depth: 500_000, fairValue: 50 });
    const placed = x.run({ type: "order.limit", accountId: "ana", memeId: "cheap", side: "buy", qty: 40, price: 80 });
    expect(placed.fills).toEqual([]);
    const out = x.e.advance(12 * HOUR);
    const fills = out.fills.filter((f) => f.accountId === "ana");
    expect(fills.reduce((s, f) => s + f.qty, 0)).toBe(40);
    for (const f of fills) {
      expect(f).toMatchObject({ role: "maker", fee: 0, source: "house" });
      expect(f.cost / f.qty).toBeLessThanOrEqual(80 * COIN);
    }
    expect(out.journal.every((l) => l.cause.startsWith("t"))).toBe(true);
  });
});

describe("preview", () => {
  test("preview matches what the order then does, and says when cash is the limit", () => {
    const { e, run } = exchange();
    const p = e.preview("ana", "m", "buy", 980);
    expect(p.limitedBy).toBe("cash");
    expect(p.qty).toBeLessThan(980);
    const out = run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 980 });
    expect(out.fills[0].qty).toBe(p.qty);
    expect(out.fills[0].cost + out.fills[0].fee).toBe(p.total);
    const sell = e.preview("ana", "m", "sell", 50_000);
    expect(sell.limitedBy).toBe("margin");
    expect(sell.shortQty).toBeGreaterThan(0);
    expect(sell.qty).toBe(p.qty + sell.shortQty);
  });

  test("preview changes nothing", () => {
    const { e } = exchange();
    const before = e.snapshot();
    e.preview("ana", "m", "buy", 300);
    expect(e.snapshot()).toBe(before);
  });
});

// ---------- properties over random order flow ----------

const ACCOUNTS = ["ana", "bo", "cy"];
const step = fc.oneof(
  fc.record({ k: fc.constant("mkt" as const), who: fc.constantFrom(...ACCOUNTS), side: fc.constantFrom("buy" as const, "sell" as const), qty: fc.integer({ min: 1, max: 1_500 }) }),
  fc.record({
    k: fc.constant("lim" as const),
    who: fc.constantFrom(...ACCOUNTS),
    side: fc.constantFrom("buy" as const, "sell" as const),
    qty: fc.integer({ min: 1, max: 400 }),
    cents: fc.integer({ min: 8_000, max: 12_500 }),
    ttl: fc.option(fc.integer({ min: 2, max: 3_600 }), { nil: null }),
  }),
  fc.record({ k: fc.constant("cancel" as const), who: fc.constantFrom(...ACCOUNTS), pick: fc.nat() }),
  fc.record({ k: fc.constant("stop" as const), who: fc.constantFrom(...ACCOUNTS), side: fc.constantFrom("buy" as const, "sell" as const), qty: fc.integer({ min: 1, max: 300 }), cents: fc.integer({ min: 8_000, max: 12_500 }) }),
  fc.record({ k: fc.constant("wait" as const), secs: fc.integer({ min: 1, max: 7_200 }) }),
);

function runSteps(steps: { k: string; [x: string]: unknown }[]) {
  const e = new Engine(DEFAULT_PARAMS);
  const journal: JournalLine[] = [];
  let seq = 0;
  let t = 1_000_000;
  const push = (o: Output) => journal.push(...o.journal);
  const run = (b: EventBody) => push(e.apply({ ...b, seq: ++seq, time: t } as never));
  run({ type: "meme.list", memeId: "m", name: "M", price: 100, depth: 300_000 });
  for (const id of ACCOUNTS) run({ type: "account.open", accountId: id });
  const after = () => {
    const q = e.meme("m");
    const b = e.book("m");
    // no-cross, with the one-share rounding allowance
    if (b.bids[0]) expect(b.bids[0].price).toBeLessThan(b.house!.ask * 1.02 + 0.02);
    if (b.asks[0]) expect(b.asks[0].price).toBeGreaterThan(b.house!.bid * 0.98 - 0.02);
    if (b.bids[0] && b.asks[0]) expect(b.bids[0].price).toBeLessThan(b.asks[0].price);
    expect(q.price).toBeGreaterThanOrEqual(0.01);
    for (const id of ACCOUNTS) {
      const a = e.account(id);
      expect(a.heldCash).toBeGreaterThanOrEqual(0);
      expect(a.heldMargin).toBeGreaterThanOrEqual(0);
      for (const [k, v] of Object.entries(a.heldShares)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(Math.max(0, a.shares[k] ?? 0));
      }
      if (Object.values(a.shares).some((q) => q < 0)) expect(a.equity).toBeGreaterThanOrEqual(a.maintenance);
    }
  };
  for (const s of steps) {
    if (s.k === "mkt") run({ type: "order.market", accountId: s.who as string, memeId: "m", side: s.side as "buy", qty: s.qty as number });
    if (s.k === "lim")
      run({
        type: "order.limit",
        accountId: s.who as string,
        memeId: "m",
        side: s.side as "buy",
        qty: s.qty as number,
        price: (s.cents as number) / 100,
        expiresAt: s.ttl ? t + (s.ttl as number) * 1_000 : null,
      });
    if (s.k === "stop") run({ type: "order.stop", accountId: s.who as string, memeId: "m", side: s.side as "buy", qty: s.qty as number, stopPrice: (s.cents as number) / 100 });
    if (s.k === "cancel") {
      const open = e.openOrders(s.who as string);
      if (open.length) run({ type: "order.cancel", accountId: s.who as string, orderId: open[(s.pick as number) % open.length].orderId });
    }
    if (s.k === "wait") {
      t += (s.secs as number) * 1_000;
      push(e.advance(t));
    }
    after();
  }
  return { e, journal };
}

test("random order flow keeps every invariant: conservation, no-cross, no negative or over-held balances", () => {
  fc.assert(
    fc.property(fc.array(step, { maxLength: 50 }), (steps) => {
      const { journal } = runSteps(steps as never);
      const sums = new Map<string, number>();
      for (const l of journal) sums.set(l.commodity, (sums.get(l.commodity) ?? 0) + l.amount);
      for (const v of sums.values()) expect(v).toBe(0);
      const keys = new Set(journal.map((l) => `${l.cause}#${l.n}`));
      expect(keys.size).toBe(journal.length);
    }),
    { numRuns: 150 },
  );
});

test("random order flow replays to an identical snapshot", () => {
  fc.assert(
    fc.property(fc.array(step, { maxLength: 40 }), (steps) => {
      expect(runSteps(steps as never).e.snapshot()).toBe(runSteps(steps as never).e.snapshot());
    }),
    { numRuns: 60 },
  );
});

test("regression: going short past shares held by your own resting sell turns them into margin-backed short sales", () => {
  const { e } = runSteps([
    { k: "mkt", who: "cy", side: "buy", qty: 1 },
    { k: "lim", who: "cy", side: "sell", qty: 1, cents: 9989, ttl: null },
    { k: "mkt", who: "cy", side: "sell", qty: 1 },
  ] as never);
  const a = e.account("cy");
  expect(a.shares.m).toBe(0);
  expect(a.heldShares.m ?? 0).toBe(0);
  expect(a.heldMargin).toBeGreaterThan(0);
});
