import { describe, expect, test } from "vitest";
import { DEFAULT_PARAMS, Engine } from "./index.ts";

const HOUR = 3_600_000;
const quiet = { ...DEFAULT_PARAMS, noisePerSqrtHour: 0 };

function listed(params = DEFAULT_PARAMS, fairValue = 150) {
  const e = new Engine(params);
  e.apply({ seq: 1, time: 0, type: "meme.list", memeId: "m", name: "M", price: 100, depth: 500_000, fairValue });
  return e;
}

describe("house drift toward target (PRD §6.3)", () => {
  test("with no trades the log-gap to fair value halves every 6 hours", () => {
    const e = listed(quiet);
    e.advance(6 * HOUR);
    // ln(150/100) = 0.4055; half of it remains → 150 / e^0.2027 = 122.47
    expect(e.meme("m").price).toBeCloseTo(122.47, 1);
    e.advance(12 * HOUR);
    expect(e.meme("m").price).toBeCloseTo(150 / Math.exp(0.4055 / 4), 1);
  });

  test("ticks are implied by time: advancing in steps equals one jump", () => {
    const a = listed();
    const b = listed();
    for (let t = 0; t <= HOUR; t += 7_777) a.advance(t);
    a.advance(HOUR);
    b.advance(HOUR);
    expect(a.snapshot()).toBe(b.snapshot());
  });

  test("noise is seeded: same events, same path; it actually moves the price", () => {
    const a = listed(DEFAULT_PARAMS, 100);
    const b = listed(DEFAULT_PARAMS, 100);
    a.advance(HOUR);
    b.advance(HOUR);
    expect(a.meme("m").price).toBe(b.meme("m").price);
    expect(a.meme("m").price).not.toBe(100);
  });

  test("an hour of noise at 0.3%/√h moves price by roughly 0.3%, not wildly", () => {
    const moves: number[] = [];
    for (let i = 0; i < 40; i++) {
      const e = new Engine(DEFAULT_PARAMS);
      e.apply({ seq: 1, time: 0, type: "meme.list", memeId: `m${i}`, name: "M", price: 100, depth: 500_000 });
      e.advance(HOUR);
      moves.push(Math.log(e.meme(`m${i}`).price / 100));
    }
    const sd = Math.sqrt(moves.reduce((s, x) => s + x * x, 0) / moves.length);
    expect(sd).toBeGreaterThan(0.0015);
    expect(sd).toBeLessThan(0.006);
  });

  test("spread widens with realised volatility but never past 3%", () => {
    const wild = listed({ ...DEFAULT_PARAMS, noisePerSqrtHour: 0.08 }, 100);
    wild.advance(2 * HOUR);
    const m = wild.meme("m");
    const spread = (m.ask - m.bid) / m.price;
    expect(spread).toBeGreaterThan(0.004);
    expect(spread).toBeLessThanOrEqual(0.03 + 1e-12);
  });

  test("events carry ticks with them: an order after an hour sees the drifted price", () => {
    const e = listed(quiet);
    e.apply({ seq: 2, time: HOUR, type: "account.open", accountId: "a" });
    expect(e.meme("m").price).toBeGreaterThan(100);
  });
});

describe("features updates (ticket 04)", () => {
  test("a new fair value becomes the drift target; heat 5 makes the house 5× deeper", () => {
    const e = listed(quiet, 100);
    e.apply({ seq: 2, time: 0, type: "meme.features", memeId: "m", fairValue: 150, heat: 5 });
    e.advance(6 * HOUR);
    expect(e.meme("m").price).toBeCloseTo(122.47, 1);
    // 10,000 coins move a heat-5 meme by (1 + 10k / 2.5M)² ≈ +0.8% instead of +4%
    e.apply({ seq: 3, time: 6 * HOUR, type: "account.open", accountId: "a" });
    const before = e.meme("m").price;
    e.apply({ seq: 4, time: 6 * HOUR, type: "order.market", accountId: "a", memeId: "m", side: "buy", qty: 80 });
    const move = e.meme("m").price / before - 1;
    expect(move).toBeLessThan(0.01);
    expect(move).toBeGreaterThan(0.005);
  });
});

describe("live params (ticket 12)", () => {
  test("params.set changes behaviour from that event on and rejects out-of-range values", () => {
    const e = listed(quiet, 150);
    expect(e.apply({ seq: 2, time: 0, type: "params.set", params: { driftHalfLifeHours: 999 } }).rejects[0].reason).toMatch(/between/);
    e.apply({ seq: 3, time: 0, type: "params.set", params: { driftHalfLifeHours: 3 } });
    e.advance(3 * HOUR);
    expect(e.meme("m").price).toBeCloseTo(122.47, 1); // half the gap in 3h now
    expect(e.params.driftHalfLifeHours).toBe(3);
  });
});

test("Dank opens once, moves the quiet meme every 100 ms and replays exactly", () => {
  const e = listed(quiet, 100);
  e.apply({ seq: 2, time: 2050, type: "dank.open" });
  expect(e.dank?.level).toBe(1000);
  const resumed = Engine.fromSnapshot(e.snapshot());
  const quotes = e.advance(2100).prices;
  expect(quotes).toHaveLength(1);
  expect(e.dank?.level).not.toBe(1000);
  expect(quotes[0].price / 100).toBeCloseTo(e.dank!.level / 1000, 12);
  e.advance(4000);
  resumed.advance(4000);
  expect(e.snapshot()).toBe(resumed.snapshot());
  const level = e.dank!.level;
  e.apply({ seq: 3, time: 4000, type: "dank.open" });
  expect(e.dank?.level).toBe(level);
});

test("Max uses executable depth for market buys and the configured fee for resting limits", () => {
  const e = listed(quiet, 100);
  e.apply({ seq: 2, time: 0, type: "account.open", accountId: "a" });
  e.apply({ seq: 3, time: 0, type: "params.set", params: { takerFeeBps: 100 } });
  const qty = e.preview("a", "m", "buy", 10_000_000).qty;
  expect(e.preview("a", "m", "buy", qty + 1).qty).toBe(qty);
  expect(e.maxLimitBuy("a", "m", 50, 10_000_000)).toBe(Math.floor(100_000 / 50.5));
  const out = e.apply({ seq: 4, time: 0, type: "order.market", accountId: "a", memeId: "m", side: "buy", qty });
  expect(out.fills.reduce((sum, f) => sum + f.qty, 0)).toBe(qty);
});

test("a delayed Dank clock returns every intermediate chart sample", () => {
  const e = listed();
  e.apply({ seq: 2, time: 0, type: "dank.open" });
  const ticks = e.advance(5000).dankTicks!;
  expect(ticks.map((p) => p.time)).toEqual(Array.from({ length: 50 }, (_, i) => (i + 1) * 100));
  expect(ticks.at(-1)?.price).toBe(e.dank!.level);
});

test("a rejected amendment preserves the original reservation and queue entry", () => {
  const e = listed(quiet, 100);
  e.apply({ seq: 2, time: 0, type: "account.open", accountId: "a" });
  const order = { type: "order.limit", accountId: "a", memeId: "m", side: "buy", qty: 5, price: 90 } as const;
  expect(e.apply({ ...order, seq: 3, time: 0 }).rejects).toEqual([]);
  const account = structuredClone(e.account("a"));
  const orders = e.openOrders("a");
  const out = e.apply({ ...order, seq: 4, time: 0, replaceOrderId: 3, qty: 1_000_000 });
  expect(out.rejects).toHaveLength(1);
  expect(out.orders).toEqual([]);
  expect(e.account("a")).toEqual(account);
  expect(e.openOrders("a")).toEqual(orders);
});

test("the single-member Dank basket tracks its midpoint return through replay", () => {
  const e = listed(quiet, 100);
  e.apply({ seq: 2, time: 0, type: "dank.open" });
  e.apply({ seq: 3, time: 0, type: "basket.open" });
  const resumed = Engine.fromSnapshot(e.snapshot());
  const quotes = e.advance(1000).prices;
  expect(e.dank!.level).toBeCloseTo(1000 * quotes.at(-1)!.mid / 100, 8);
  resumed.advance(1000);
  expect(resumed.snapshot()).toBe(e.snapshot());
});
