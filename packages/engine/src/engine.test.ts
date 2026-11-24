import { describe, expect, test } from "vitest";
import { Engine, COIN } from "./index.ts";

const t0 = Date.UTC(2026, 10, 24);
const listDoge = { type: "meme.list", memeId: "stonks", name: "Stonks", price: 100, depth: 500_000 } as const;

function setup() {
  const e = new Engine();
  e.apply({ seq: 1, time: t0, ...listDoge });
  e.apply({ seq: 2, time: t0, type: "account.open", accountId: "ana" });
  return e;
}

describe("market orders against the house", () => {
  test("new account gets 100,000 coins", () => {
    expect(setup().account("ana").cash).toBe(100_000 * COIN);
  });

  test("buying 200 shares at p=100, Y=500k costs 20,864.6 coins and lifts the price to 108.51 (PRD §6.7 house legs)", () => {
    const e = setup();
    const out = e.apply({ seq: 3, time: t0, type: "order.market", accountId: "ana", memeId: "stonks", side: "buy", qty: 200 });
    const fill = out.fills[0];
    expect(fill.qty).toBe(200);
    expect(fill.cost / COIN).toBeCloseTo(20_864.6, 0);
    expect(fill.fee / COIN).toBeCloseTo(20.86, 1);
    expect(e.meme("stonks").price).toBeCloseTo(108.507, 2);
    expect(e.account("ana").shares.stonks).toBe(200);
  });
});

describe("selling and limits", () => {
  test("selling back what you bought returns less than you paid (spread + fees), and the price returns to 100", () => {
    const e = setup();
    const buy = e.apply({ seq: 3, time: t0, type: "order.market", accountId: "ana", memeId: "stonks", side: "buy", qty: 50 });
    const sell = e.apply({ seq: 4, time: t0, type: "order.market", accountId: "ana", memeId: "stonks", side: "sell", qty: 50 });
    expect(sell.fills[0].qty).toBe(50);
    expect(e.meme("stonks").price).toBeCloseTo(100, 9);
    const paid = buy.fills[0].cost + buy.fills[0].fee;
    const got = sell.fills[0].cost - sell.fills[0].fee;
    expect(got).toBeLessThan(paid);
    // round trip loses roughly spread (0.3%) + two 0.1% fees on ~5,000 coins ≈ 25 coins
    expect((paid - got) / COIN).toBeCloseTo(25, -1);
    expect(e.account("ana").shares.stonks).toBe(0);
  });

  test("a market buy bigger than your cash fills as far as cash goes", () => {
    const e = setup();
    const out = e.apply({ seq: 3, time: t0, type: "order.market", accountId: "ana", memeId: "stonks", side: "buy", qty: 1_000_000 });
    const a = e.account("ana");
    expect(out.fills[0].qty).toBeGreaterThan(500);
    expect(a.cash).toBeGreaterThanOrEqual(0);
    expect(a.cash).toBeLessThan(150 * COIN); // under ~one share's price left over
  });

  test("you can't sell shares you don't hold (shorting comes later)", () => {
    const e = setup();
    const out = e.apply({ seq: 3, time: t0, type: "order.market", accountId: "ana", memeId: "stonks", side: "sell", qty: 1 });
    expect(out.rejects[0].reason).toMatch(/no shares/);
  });

  test("events must arrive in sequence", () => {
    const e = setup();
    expect(() => e.apply({ seq: 9, time: t0, type: "account.open", accountId: "bo" })).toThrow(/seq/);
  });
});
