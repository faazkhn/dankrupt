import fc from "fast-check";
import { expect, test } from "vitest";
import { Engine, type EventBody, type JournalLine } from "./index.ts";

const ACCOUNTS = ["a", "b", "c"];
const MEMES = ["m1", "m2"];

const order = fc.record({
  type: fc.constant("order.market" as const),
  accountId: fc.constantFrom(...ACCOUNTS),
  memeId: fc.constantFrom(...MEMES),
  side: fc.constantFrom("buy" as const, "sell" as const),
  qty: fc.integer({ min: 1, max: 3_000 }),
});

const setupEvents: EventBody[] = [
  { type: "meme.list", memeId: "m1", name: "One", price: 100, depth: 500_000 },
  { type: "meme.list", memeId: "m2", name: "Two", price: 3, depth: 100_000 },
  ...ACCOUNTS.map((accountId) => ({ type: "account.open" as const, accountId })),
];

function run(bodies: EventBody[]) {
  const e = new Engine();
  const journal: JournalLine[] = [];
  bodies.forEach((b, i) => journal.push(...e.apply({ ...b, seq: i + 1, time: 1_000 * i }).journal));
  return { e, journal };
}

test("conservation: every commodity's journal lines sum to zero after every event", () => {
  fc.assert(
    fc.property(fc.array(order, { maxLength: 60 }), (orders) => {
      const { journal } = run([...setupEvents, ...orders]);
      const sums = new Map<string, number>();
      for (const l of journal) sums.set(l.commodity, (sums.get(l.commodity) ?? 0) + l.amount);
      for (const v of sums.values()) expect(v).toBe(0);
    }),
  );
});

test("no account ever goes below zero cash or shares (no shorting yet)", () => {
  fc.assert(
    fc.property(fc.array(order, { maxLength: 60 }), (orders) => {
      const { e } = run([...setupEvents, ...orders]);
      for (const id of ACCOUNTS) {
        const a = e.account(id);
        expect(a.cash).toBeGreaterThanOrEqual(0);
        for (const q of Object.values(a.shares)) expect(q).toBeGreaterThanOrEqual(0);
      }
    }),
  );
});

test("journal balances match account state", () => {
  fc.assert(
    fc.property(fc.array(order, { maxLength: 40 }), (orders) => {
      const { e, journal } = run([...setupEvents, ...orders]);
      for (const id of ACCOUNTS) {
        const cash = journal.filter((l) => l.account === `player:${id}` && l.commodity === "coin").reduce((s, l) => s + l.amount, 0);
        expect(cash).toBe(e.account(id).cash);
      }
    }),
  );
});

test("determinism: replaying the same events gives a byte-identical snapshot, also from a mid-way snapshot", () => {
  fc.assert(
    fc.property(fc.array(order, { maxLength: 60 }), fc.nat(), (orders, cut) => {
      const all = [...setupEvents, ...orders].map((b, i) => ({ ...b, seq: i + 1, time: 1_000 * i }));
      const a = new Engine();
      const b = new Engine();
      all.forEach((ev) => a.apply(ev));
      all.forEach((ev) => b.apply(ev));
      expect(a.snapshot()).toBe(b.snapshot());
      const k = cut % (all.length + 1);
      const c0 = new Engine();
      all.slice(0, k).forEach((ev) => c0.apply(ev));
      const c = Engine.fromSnapshot(c0.snapshot());
      all.slice(k).forEach((ev) => c.apply(ev));
      expect(c.snapshot()).toBe(a.snapshot());
    }),
  );
});

test("floor: the house price never goes below 0.01", () => {
  fc.assert(
    fc.property(fc.array(order, { maxLength: 80 }), (orders) => {
      const { e } = run([...setupEvents, ...orders]);
      for (const m of e.memes()) expect(m.price).toBeGreaterThanOrEqual(0.01);
    }),
  );
});
