import { describe, expect, test } from "vitest";
import { COIN, DEFAULT_PARAMS, Engine, type EventBody, type Output } from "./index.ts";

const quiet = { ...DEFAULT_PARAMS, noisePerSqrtHour: 0 };
const HOUR = 3_600_000;

function exchange(memes: { id: string; fair?: number; depth?: number }[] = [{ id: "m" }]) {
  const e = new Engine(quiet);
  let seq = 0;
  let now = 0;
  const run = (b: EventBody, at = now): Output => {
    now = at;
    return e.apply({ ...b, seq: ++seq, time: at } as never);
  };
  for (const m of memes) run({ type: "meme.list", memeId: m.id, name: m.id.toUpperCase(), price: 100, depth: m.depth ?? 500_000, fairValue: m.fair });
  run({ type: "account.open", accountId: "ana" });
  run({ type: "account.open", accountId: "bo" });
  return { e, run };
}

describe("shorting (PRD §7)", () => {
  test("PRD §7.5: shorting 500 at ~100 adds the proceeds to cash and locks them plus 50% margin", () => {
    const { e, run } = exchange([{ id: "m", depth: 50_000_000 }]); // deep, so the sale barely moves the price
    const out = run({ type: "order.market", accountId: "ana", memeId: "m", side: "sell", qty: 500 });
    const proceeds = out.fills[0].cost - out.fills[0].fee;
    const a = e.account("ana");
    expect(a.shares.m).toBe(-500);
    expect((a.cash - 100_000 * COIN - proceeds) / COIN).toBeLessThan(1); // minus one minute of borrow
    expect(a.initialMargin / COIN).toBeCloseTo(0.5 * 500 * 100, -2);
    expect(a.maintenance / COIN).toBeCloseTo(0.3 * 500 * 100, -2);
    expect(a.freeCash / COIN).toBeCloseTo(100_000 - 500 * 100 * 0.5, -2);
  });

  test("a short is liquidated when the mark rises past ~230: bought back, 1% fee, notice", () => {
    const { e, run } = exchange([{ id: "m", depth: 50_000_000 }]);
    run({ type: "order.market", accountId: "ana", memeId: "m", side: "sell", qty: 500 });
    run({ type: "meme.features", memeId: "m", fairValue: 400, heat: 1 }, 1_000);
    let liq: Output | null = null;
    for (let h = 1; h <= 30 && !liq; h++) {
      const out = e.advance(h * HOUR);
      if (out.notices.some((n) => n.kind === "liquidation")) liq = out;
    }
    expect(liq).not.toBeNull();
    const notice = liq!.notices.find((n) => n.kind === "liquidation")!;
    expect(notice.fee).toBeGreaterThan(0);
    const mark = e.meme("m").mark / COIN;
    expect(mark).toBeGreaterThan(200);
    expect(mark).toBeLessThan(260);
    const a = e.account("ana");
    expect(a.shares.m ?? 0).toBeGreaterThan(-500);
    if ((a.shares.m ?? 0) < 0) expect(a.equity).toBeGreaterThanOrEqual(a.initialMargin);
  });

  test("a falling long elsewhere can liquidate a short (margin is account-wide)", () => {
    const { e, run } = exchange([{ id: "a" }, { id: "b", depth: 50_000_000 }]);
    run({ type: "order.market", accountId: "ana", memeId: "a", side: "buy", qty: 900 }); // ~all cash into A
    run({ type: "order.market", accountId: "ana", memeId: "b", side: "sell", qty: 150 }); // and a short in B
    expect(e.account("ana").shares.b).toBeLessThan(0);
    run({ type: "meme.features", memeId: "a", fairValue: 1, heat: 1 }, 1_000); // A is worthless now
    let liquidated = false;
    for (let h = 1; h <= 48 && !liquidated; h++) liquidated = e.advance(h * HOUR).notices.some((n) => n.kind === "liquidation" && n.memeId === "b");
    expect(liquidated).toBe(true);
  });

  test("you can always buy to cover, even with little free cash", () => {
    const { e, run } = exchange([{ id: "m", depth: 50_000_000 }]);
    run({ type: "order.market", accountId: "ana", memeId: "m", side: "sell", qty: 1_900 });
    expect(e.account("ana").freeCash / COIN).toBeLessThan(10_000);
    run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 1_900 });
    expect(e.account("ana").shares.m).toBe(0);
  });
});

describe("borrow fee (PRD §7.3, per started minute)", () => {
  test("an hour short pays about |q|·M·r per hour", () => {
    const { e, run } = exchange([{ id: "m", depth: 50_000_000 }]);
    run({ type: "order.market", accountId: "ana", memeId: "m", side: "sell", qty: 100 });
    const m = e.meme("m");
    const cash0 = e.account("ana").cash;
    e.advance(HOUR + 30_000);
    const paid = cash0 - e.account("ana").cash;
    const expected = 100 * m.mark * m.borrowPerHour;
    expect(paid / expected).toBeGreaterThan(0.9);
    expect(paid / expected).toBeLessThan(1.15);
  });

  test("a crowded short (U = 1) costs about 1.32% a day", () => {
    const r = DEFAULT_PARAMS.borrowBasePerHour + DEFAULT_PARAMS.borrowSlopePerHour * 1;
    expect(r * 24).toBeCloseTo(0.0132, 4);
  });

  test("even a 20-second short pays one minute", () => {
    const { e, run } = exchange([{ id: "m", depth: 50_000_000 }]);
    const out1 = run({ type: "order.market", accountId: "ana", memeId: "m", side: "sell", qty: 100 }, 5_000);
    run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 100 }, 25_000);
    const borrow = out1.journal.filter((l) => l.account === "sink").map((l) => l.amount);
    expect(borrow.length).toBe(2); // taker fee + the first minute of borrow
    expect(e.account("ana").shares.m).toBe(0);
  });
});

describe("resets and round trips", () => {
  test("a reset needs equity under 1,000 and no positions; it tops up to 100,000 and counts", () => {
    const { e, run } = exchange();
    expect(run({ type: "account.reset", accountId: "ana" }).rejects[0].reason).toMatch(/under 1,000/);
    // Go broke the realistic way: a maximum short on a thin meme, squeezed until liquidation.
    run({ type: "meme.list", memeId: "thin", name: "THIN", price: 100, depth: 30_000 });
    run({ type: "order.market", accountId: "ana", memeId: "thin", side: "sell", qty: 100_000 });
    run({ type: "meme.features", memeId: "thin", fairValue: 5_000, heat: 1 });
    for (let h = 1; h <= 72 && (e.account("ana").shares.thin ?? 0) < 0; h++) e.advance(h * HOUR);
    // whatever survives the liquidation, close it so the account is flat
    if ((e.account("ana").shares.thin ?? 0) < 0) run({ type: "order.market", accountId: "ana", memeId: "thin", side: "buy", qty: -e.account("ana").shares.thin }, e.time);
    expect(e.account("ana").equity).toBeLessThan(1_000 * COIN);
    expect(e.account("ana").canReset).toBe(true);
    const out = run({ type: "account.reset", accountId: "ana" }, e.time);
    expect(out.rejects).toEqual([]);
    expect(e.account("ana")).toMatchObject({ cash: 100_000 * COIN, resets: 1 });
    expect(out.notices[0].kind).toBe("reset");
  });

  test("a buy-then-sell is one closed long round trip whose P&L is the net cash", () => {
    const { e, run } = exchange();
    const cash0 = e.account("ana").cash;
    run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 30 }, 1_000);
    run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 20 }, 2_000);
    const out = run({ type: "order.market", accountId: "ana", memeId: "m", side: "sell", qty: 50 }, 90_000);
    expect(out.closed).toEqual([
      expect.objectContaining({ accountId: "ana", memeId: "m", side: "long", openedAt: 1_000, closedAt: 90_000, peakQty: 50, pnl: e.account("ana").cash - cash0 }),
    ]);
  });

  test("flipping from long to short in one order closes the long and opens a short", () => {
    const { e, run } = exchange([{ id: "m", depth: 50_000_000 }]);
    run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 10 }, 1_000);
    const out = run({ type: "order.market", accountId: "ana", memeId: "m", side: "sell", qty: 30 }, 2_000);
    expect(out.closed).toHaveLength(1);
    expect(out.closed[0].side).toBe("long");
    expect(e.account("ana").shares.m).toBe(-20);
    expect(e.account("ana").positions[0]).toMatchObject({ memeId: "m", qty: -20, openedAt: 2_000 });
  });
});

describe("economy (ticket 13)", () => {
  test("coin supply moves exactly opposite to the house's P&L plus fees (PRD §4)", () => {
    const { e, run } = exchange();
    const before = e.economy();
    run({ type: "order.market", accountId: "ana", memeId: "m", side: "buy", qty: 300 });
    run({ type: "order.market", accountId: "bo", memeId: "m", side: "sell", qty: 100 });
    e.advance(3 * HOUR);
    const after = e.economy();
    const housePnl = after.house.reduce((s, h) => s + h.pnl, 0) - before.house.reduce((s, h) => s + h.pnl, 0);
    const fees = (after.supply - before.supply + housePnl) * -1; // ΔS = −ΔΠ_house − fees
    expect(fees).toBeGreaterThan(0);
    expect(fees / COIN).toBeLessThan(100); // two 0.1% taker fees on ~40k notional plus a few minutes of borrow
  });
});
