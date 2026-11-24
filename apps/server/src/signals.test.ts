import { beforeEach, expect, test } from "vitest";
import { createDb, migrate, type Db } from "@dankrupt/db";
import { Sequencer } from "./sequencer.ts";
import { Signals, type DailyCounts } from "./signals.ts";

const DAY = 86_400_000;
let db: Db;
beforeEach(async () => {
  db = createDb("pglite:");
  await migrate(db);
});

/** A fake Wikipedia that serves `perDay` views for every day, except `spikeFrom` onwards. */
function fakeWiki(perDay: number, spikeFrom?: string, spike = perDay) {
  const calls: string[] = [];
  const fetch = async (title: string, from: string, to: string): Promise<DailyCounts> => {
    calls.push(`${title} ${from}..${to}`);
    const out: DailyCounts = {};
    for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) {
      const d = new Date(t).toISOString().slice(0, 10);
      out[d] = spikeFrom && d >= spikeFrom ? spike : perDay;
    }
    return out;
  };
  return { fetch, calls };
}

test("a sustained spike in Wikipedia views raises fair value and heat in the engine", async () => {
  const now = Date.UTC(2026, 10, 24, 12);
  const seq = await Sequencer.boot(db, [{ memeId: "m", name: "M", price: 100, depth: 500_000 }]);
  const wiki = fakeWiki(500, "2026-11-20", 4_000);
  const signals = new Signals(db, seq, wiki.fetch);
  await signals.mapSources("m", ["Some_article"]);
  await signals.refresh(now);
  const m = seq.engine.meme("m");
  expect(m.fairValue).toBeGreaterThan(110);
  expect(m.heat).toBeGreaterThan(1.5);
  const att = await signals.attention("m");
  expect(att.delayed).toBe(false);
  expect(att.wikipediaDaily.at(-1)).toEqual({ day: "2026-11-23", views: 4_000 });
});

test("refreshing again with nothing new sends no new event and only refetches the last days", async () => {
  const now = Date.UTC(2026, 10, 24, 12);
  const seq = await Sequencer.boot(db, [{ memeId: "m", name: "M", price: 100, depth: 500_000 }]);
  const wiki = fakeWiki(800);
  const signals = new Signals(db, seq, wiki.fetch);
  await signals.mapSources("m", ["A"]);
  await signals.refresh(now);
  const seqAfterFirst = seq.engine.seq;
  await signals.refresh(now + 60_000);
  expect(seq.engine.seq).toBe(seqAfterFirst);
  expect(wiki.calls.at(-1)).toBe("A 2026-11-21..2026-11-23");
});
