import { describe, expect, test } from "vitest";
import { DEFAULT_PARAMS, Engine, type EventBody, type Output } from "./index.ts";

const quiet = { ...DEFAULT_PARAMS, noisePerSqrtHour: 0 };
const MIN = 60_000;

function preopen() {
  const e = new Engine(quiet);
  let seq = 0;
  const run = (b: EventBody, time = 0): Output => e.apply({ ...b, seq: ++seq, time } as never);
  for (const id of ["ana", "bo", "cy"]) run({ type: "account.open", accountId: id });
  run({ type: "meme.list", memeId: "m", name: "M", price: 100, depth: 500_000, preOpenUntil: 30 * MIN });
  return { e, run };
}

describe("pre-open and IPO (ticket 10)", () => {
  test("during pre-open the house is closed: market and stop orders are refused, limit orders rest", () => {
    const { e, run } = preopen();
    expect(e.meme("m").status).toBe("preopen");
    expect(run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 5 }).rejects[0].reason).toMatch(/pre-open/);
    expect(run({ type: "order.stop", accountId: "ana", memeId: "m", side: "buy", qty: 5, stopPrice: 150 }).rejects[0].reason).toMatch(/pre-open/);
    const out = run({ type: "order.limit", accountId: "ana", memeId: "m", side: "buy", qty: 5, price: 120 });
    expect(out.fills).toEqual([]);
    expect(e.book("m").bids[0]).toMatchObject({ price: 120, qty: 5 });
  });

  test("players can trade with each other in pre-open (a short sale against a bid)", () => {
    const { e, run } = preopen();
    run({ type: "order.limit", accountId: "ana", memeId: "m", side: "buy", qty: 5, price: 120 });
    const out = run({ type: "order.limit", accountId: "bo", memeId: "m", side: "sell", qty: 3, price: 110 }, MIN);
    expect(out.fills.map((f) => [f.accountId, f.source, f.qty])).toEqual([
      ["bo", "book", 3],
      ["ana", "book", 3],
    ]);
    expect(e.account("bo").shares.m).toBe(-3);
  });

  test("at the open the house starts at 100 and stacked bids above it fill against the house as makers", () => {
    const { e, run } = preopen();
    run({ type: "order.limit", accountId: "ana", memeId: "m", side: "buy", qty: 50, price: 105 });
    run({ type: "order.limit", accountId: "cy", memeId: "m", side: "buy", qty: 10, price: 90 });
    const out = e.advance(30 * MIN);
    expect(e.meme("m").status).toBe("active");
    const ana = out.fills.filter((f) => f.accountId === "ana");
    expect(ana.reduce((s, f) => s + f.qty, 0)).toBeGreaterThan(0);
    for (const f of ana) expect(f).toMatchObject({ role: "maker", fee: 0, source: "house" });
    expect(out.fills.some((f) => f.accountId === "cy")).toBe(false); // 90 is below the opening ask
    expect(e.meme("m").price).toBeGreaterThan(100); // demand at 105 lifted the opening price
  });

  test("the price does not drift during pre-open", () => {
    const { e } = preopen();
    e.advance(29 * MIN);
    expect(e.meme("m").price).toBe(100);
  });
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function active() {
  const e = new Engine(quiet);
  let seq = 0;
  let now = 0;
  const run = (b: EventBody, time = now): Output => {
    now = time;
    return e.apply({ ...b, seq: ++seq, time } as never);
  };
  run({ type: "meme.list", memeId: "m", name: "M", price: 100, depth: 500_000 });
  for (const id of ["ana", "bo"]) run({ type: "account.open", accountId: id });
  const cold = (from: number, to: number) => {
    for (let t = from; t <= to; t += 6 * HOUR) run({ type: "meme.features", memeId: "m", fairValue: 100, heat: 0.2, z: -1.5, acc: -0.01 }, t);
  };
  return { e, run, cold };
}

describe("dormancy, revival and halt (ticket 11)", () => {
  test("heat under 0.3 for 7 days in a row makes a meme dormant; fair value then halves every 7 days", () => {
    const { e, cold } = active();
    cold(0, 6 * DAY);
    expect(e.meme("m").status).toBe("active");
    cold(6 * DAY + 6 * HOUR, 7 * DAY + 6 * HOUR);
    expect(e.meme("m").status).toBe("dormant");
    const dormantAt = 7 * DAY;
    e.advance(dormantAt + 7 * DAY);
    expect(e.meme("m").fairValue).toBeCloseTo(50, 0);
  });

  test("one warm update resets the 7-day clock", () => {
    const { e, run, cold } = active();
    cold(0, 5 * DAY);
    run({ type: "meme.features", memeId: "m", fairValue: 100, heat: 0.5, z: 0, acc: 0 }, 5 * DAY + HOUR);
    cold(5 * DAY + 2 * HOUR, 9 * DAY);
    expect(e.meme("m").status).toBe("active");
  });

  test("dormant memes charge 5× borrow and block new shorts once utilisation passes 0.5", () => {
    const { e, run, cold } = active();
    cold(0, 7 * DAY + 6 * HOUR);
    expect(e.meme("m").status).toBe("dormant");
    const rate = e.meme("m").borrowPerHour;
    expect(rate).toBeCloseTo(5 * DEFAULT_PARAMS.borrowBasePerHour, 9);
    // a thin dormant meme: the house's virtual shares are few, so a big short pushes U past 0.5
    run({ type: "params.set", params: {} });
    const t = e.time;
    run({ type: "meme.list", memeId: "thin", name: "T", price: 100, depth: 20_000 }, t);
    for (let x = t; x <= t + 7 * DAY + 6 * HOUR; x += 6 * HOUR) run({ type: "meme.features", memeId: "thin", fairValue: 100, heat: 0.2, z: -1, acc: 0 }, x);
    expect(e.meme("thin").status).toBe("dormant");
    run({ type: "order.market", accountId: "ana", memeId: "thin", side: "sell", qty: 150 });
    const out = run({ type: "order.market", accountId: "bo", memeId: "thin", side: "sell", qty: 10 });
    expect(out.rejects[0]?.reason ?? "").toMatch(/margin|short/);
  });

  test("a hot spike revives a dormant meme: decay resets and it gets a comeback mark", () => {
    const { e, run, cold } = active();
    cold(0, 7 * DAY + 6 * HOUR);
    e.advance(10 * DAY);
    const decayed = e.meme("m").fairValue;
    expect(decayed).toBeLessThan(80);
    run({ type: "meme.features", memeId: "m", fairValue: 140, heat: 4, z: 3, acc: 0.4 }, 10 * DAY);
    const m = e.meme("m");
    expect(m.status).toBe("active");
    expect(m.fairValue).toBe(140);
    expect(m.comebackAt).toBe(10 * DAY);
  });

  test("halting settles every position at the mark and stops trading", () => {
    const { e, run } = active();
    run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 50 });
    run({ type: "order.market", accountId: "bo", memeId: "m", side: "sell", qty: 20 });
    run({ type: "order.limit", accountId: "ana", memeId: "m", side: "buy", qty: 5, price: 50 });
    const mark = e.meme("m").mark;
    const anaCash = e.account("ana").cash;
    const out = run({ type: "meme.halt", memeId: "m", reason: "takedown request" });
    expect(out.rejects).toEqual([]);
    expect(e.meme("m").status).toBe("halted");
    expect(e.account("ana").shares.m).toBe(0);
    expect(e.account("bo").shares.m).toBe(0);
    expect(e.account("ana").heldCash).toBe(0);
    expect((e.account("ana").cash - anaCash) / (50 * mark)).toBeCloseTo(1, 6);
    expect(run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 1 }).rejects[0].reason).toMatch(/halted/);
    expect(out.journal.reduce((s, l) => (l.commodity === "share:m" ? s + l.amount : s), 0)).toBe(0);
  });
});
