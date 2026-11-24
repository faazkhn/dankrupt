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
