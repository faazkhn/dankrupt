import { describe, expect, test } from "vitest";
import { computeFeatures, DEFAULT_FEATURE_PARAMS, wikipediaHourly } from "./index.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const P = DEFAULT_FEATURE_PARAMS;

/** Hourly Wikipedia-only series: `perHour` for `days`, then `after` per hour for `days2`. */
function series(perHour: number, days: number, after = perHour, days2 = 0) {
  return [...Array(days * 24).fill(perHour), ...Array(days2 * 24).fill(after)];
}

describe("fair value (PRD §5)", () => {
  test("doubling attention, once settled, lifts fair value by 2^0.6 = 1.52×", () => {
    const rows = computeFeatures({ start: 0, ipoTime: 0, sources: { wikipedia: series(50, 40, 100, 30) } }, P);
    const before = rows[40 * 24 - 1];
    const after = rows.at(-1)!;
    expect(before.fair).toBeCloseTo(100, 0);
    // momentum has died down after 30 flat days, so only the elasticity term remains
    expect(after.fair / before.fair).toBeCloseTo(Math.exp(0.6 * Math.log(101 / 51)), 2);
  });

  test("momentum adds at most ±28% (λ = 0.25, v clipped to ±1)", () => {
    const rows = computeFeatures({ start: 0, ipoTime: 0, sources: { wikipedia: series(1, 10, 100_000, 3) } }, P);
    const peakMomentum = Math.max(...rows.map((r) => r.fair / Math.exp(0.6 * (r.a24 - rows[0].a24)) / 100));
    expect(peakMomentum).toBeLessThanOrEqual(Math.exp(0.25) + 1e-9);
    expect(peakMomentum).toBeGreaterThan(1.2);
  });

  test("fair value never drops below 1 coin", () => {
    const rows = computeFeatures({ start: 0, ipoTime: 0, sources: { wikipedia: series(100_000, 10, 0, 60) } }, P);
    expect(Math.min(...rows.map((r) => r.fair))).toBeGreaterThanOrEqual(1);
  });

  test("a spike makes heat hot; a flat month keeps it near ln 2", () => {
    const flat = computeFeatures({ start: 0, ipoTime: 0, sources: { wikipedia: series(40, 40) } }, P).at(-1)!;
    expect(flat.heat).toBeCloseTo(Math.log(2), 1);
    const spike = computeFeatures({ start: 0, ipoTime: 0, sources: { wikipedia: series(40, 40, 400, 1) } }, P).at(-1)!;
    expect(spike.heat).toBeGreaterThan(3);
  });
});

describe("staleness", () => {
  test("when every source is stale, attention freezes and the row is marked delayed", () => {
    const wiki = [...series(40, 10), ...Array(48).fill(null)];
    const rows = computeFeatures({ start: 0, ipoTime: 0, sources: { wikipedia: wiki } }, P);
    const last = rows.at(-1)!;
    expect(last.delayed).toBe(true);
    expect(last.A).toBe(rows[10 * 24 - 1].A);
  });

  test("a stale source drops out of the blend instead of dragging it", () => {
    const n = 20 * 24;
    const wiki = Array(n).fill(100);
    const game = [...Array(n - 24).fill(100), ...Array(24).fill(null)];
    const rows = computeFeatures({ start: 0, ipoTime: 0, sources: { wikipedia: wiki, ingame: game } }, P);
    expect(rows.at(-1)!.delayed).toBe(false);
    expect(rows.at(-1)!.A).toBeCloseTo(Math.log(101) - P.baselines.wikipedia, 6);
  });
});

describe("Wikipedia daily counts → hourly attention", () => {
  test("each hour uses yesterday's count (published next day), per hour", () => {
    const days = { "2026-11-01": 240, "2026-11-02": 480 };
    const start = Date.UTC(2026, 10, 2);
    const h = wikipediaHourly(days, start, start + 2 * DAY);
    expect(h[0]).toBe(10); // Nov 2 uses Nov 1's 240 / 24
    expect(h[24]).toBe(20); // Nov 3 uses Nov 2
  });

  test("a day that hasn't loaded falls back to the day before; two missing days means stale", () => {
    const start = Date.UTC(2026, 10, 3);
    const h = wikipediaHourly({ "2026-11-01": 240 }, start, start + 2 * DAY);
    expect(h[0]).toBe(10); // Nov 2 not loaded yet: still fresh using Nov 1
    expect(h[24]).toBeNull(); // Nov 4: neither Nov 3 nor Nov 2 loaded
  });
});
