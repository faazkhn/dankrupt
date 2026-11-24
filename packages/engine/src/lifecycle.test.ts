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
