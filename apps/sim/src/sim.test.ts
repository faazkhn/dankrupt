import { expect, test } from "vitest";
import { pearson, runSim } from "./sim.ts";

test("pearson is 1 for a perfect line and -1 for its mirror", () => {
  expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 9);
  expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 9);
});

test("a run is deterministic per seed and keeps prices moving", () => {
  const flat = Array(40).fill(500);
  const climb = [...Array(30).fill(500), ...Array.from({ length: 10 }, (_, i) => 500 * 1.4 ** (i + 1))];
  const history = { flat: { title: "F", start: "2020-01-01", daily: flat }, climb: { title: "C", start: "2020-01-01", daily: climb } };
  const cfg = { seed: 3, days: 6, warmup: 30, randomBots: 4, trendBots: 2 };
  const a = runSim(history, cfg);
  const b = runSim(history, cfg);
  expect(a).toEqual(b);
  expect(a.memes).toBe(2);
  expect(a.longestFlatHours).toBeLessThan(24);
});
