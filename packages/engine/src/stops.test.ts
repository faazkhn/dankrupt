import { expect, test } from "vitest";
import { DEFAULT_PARAMS, Engine, type EventBody, type Output } from "./index.ts";

const quiet = { ...DEFAULT_PARAMS, noisePerSqrtHour: 0 };
const HOUR = 3_600_000;

function exchange(fairValue: number) {
  const e = new Engine(quiet);
  let seq = 0;
  const run = (b: EventBody, time = 0): Output => e.apply({ ...b, seq: ++seq, time } as never);
  run({ type: "meme.list", memeId: "m", name: "M", price: 100, depth: 500_000, fairValue });
  run({ type: "account.open", accountId: "ana" });
  return { e, run };
}

test("a sell stop fires a market sell when the mid falls to it, from house drift alone", () => {
  const { e, run } = exchange(50); // drifting down toward 50
  run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 20 });
  const placed = run({ type: "order.stop", accountId: "ana", memeId: "m", side: "sell", qty: 20, stopPrice: 90 });
  expect(placed.rejects).toEqual([]);
  expect(e.openOrders("ana")).toEqual([expect.objectContaining({ kind: "stop", side: "sell", price: 90, qty: 20 })]);
  const out = e.advance(6 * HOUR);
  expect(out.orders).toContainEqual(expect.objectContaining({ status: "triggered" }));
  const sold = out.fills.filter((f) => f.accountId === "ana" && f.side === "sell");
  expect(sold.reduce((s, f) => s + f.qty, 0)).toBe(20);
  expect(e.account("ana").shares.m).toBe(0);
  expect(e.openOrders("ana")).toEqual([]);
});

test("a buy stop fires when the mid rises to it", () => {
  const { e, run } = exchange(200);
  run({ type: "order.stop", accountId: "ana", memeId: "m", side: "buy", qty: 5, stopPrice: 110 });
  const out = e.advance(4 * HOUR);
  expect(out.fills.filter((f) => f.accountId === "ana").reduce((s, f) => s + f.qty, 0)).toBe(5);
});

test("a stop on the wrong side of the price is rejected, and stops can be cancelled", () => {
  const { e, run } = exchange(100);
  expect(run({ type: "order.stop", accountId: "ana", memeId: "m", side: "sell", qty: 1, stopPrice: 120 }).rejects[0].reason).toMatch(/below/);
  expect(run({ type: "order.stop", accountId: "ana", memeId: "m", side: "buy", qty: 1, stopPrice: 80 }).rejects[0].reason).toMatch(/above/);
  run({ type: "order.stop", accountId: "ana", memeId: "m", side: "buy", qty: 1, stopPrice: 130 });
  const { orderId } = e.openOrders("ana")[0];
  run({ type: "order.cancel", accountId: "ana", orderId });
  expect(e.openOrders("ana")).toEqual([]);
});
