import { redis } from "@devvit/web/server";
import { Engine } from "@dankrupt/engine";
import { roundAccount } from "./daily.ts";
import { K, mutate } from "./store.ts";

const C = 1_000_000;
const MEME = "tung-sahur";
const MIN = 60_000;

/**
 * TEMPORARY, moderator menu only: stages "bought 1000 Tung Tung Tung Sahur at 50, pumped to 120,
 * sold" on the caller's own wallet for a screenshot. Remove before the hackathon upload.
 */
export async function stageDemoTrade(user: string) {
  const now = Date.now();
  const id = roundAccount(user, now);
  for (let i = 90; i >= 1; i--) {
    const minute = now - (now % MIN) - i * MIN;
    const f = (90 - i) / 89;
    const open = 50 * (120 / 50) ** Math.max(0, f - 1 / 89) * (1 + 0.01 * Math.sin(i * 1.7));
    const close = 50 * (120 / 50) ** f * (1 + 0.012 * Math.sin(i * 2.3));
    const candle = { memeId: MEME, minute, open, close, high: Math.max(open, close) * 1.006, low: Math.min(open, close) * 0.994, volume: 40 + ((i * 37) % 90) };
    await redis.zAdd(K.candles(MEME), { member: JSON.stringify(candle), score: minute });
  }
  return mutate(({ world, now: t }) => {
    if (!world.engine.hasAccount(id)) world.submit({ type: "account.open", accountId: id }, t);
    const s = (world.engine as unknown as { s: any }).s;
    const m = s.memes[MEME];
    const a = s.accounts[id];
    a.cash -= 50_000 * C;
    a.shares[MEME] = (a.shares[MEME] ?? 0) + 1000;
    a.pos[MEME] = { openedAt: t - 3 * 60 * MIN, flow: -50_000 * C, peak: 1000, basis: 50_000 * C };
    m.longOI += 1000;
    m.houseCash += 50_000 * C;
    let lo = 100, hi = 400;
    for (let k = 0; k < 40; k++) {
      const p = (lo + hi) / 2;
      const sim = Engine.fromSnapshot(world.engine.snapshot());
      (sim as unknown as { s: any }).s.memes[MEME].curve.price = p;
      if (sim.preview(id, MEME, "sell", 1000).avgPrice < 120) lo = p;
      else hi = p;
    }
    m.curve.price = hi;
    m.emaLast = hi;
    (world as unknown as { feed: any }).feed.hours[MEME] = [{ hour: t - 23 * 60 * MIN, open: 50 }];
    const out = world.submit({ type: "order.market", accountId: id, memeId: MEME, side: "sell", qty: 1000 }, t);
    const sold = out.fills.filter((f) => f.accountId === id);
    return sold.reduce((sum, f) => sum + f.cost, 0) / Math.max(1, sold.reduce((q, f) => q + f.qty, 0)) / C;
  });
}
