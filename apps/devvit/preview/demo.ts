/**
 * Preview only, never shipped: seeds a lived-in market for demo footage (other traders, a meme on a
 * run, yesterday's result and a streak). The numbers are illustrative, not real play.
 */
import { redis } from "../src/server/fake-devvit.ts";
import { DK, dayKey, ensureSeeded, markPlayed } from "../src/server/daily.ts";
import { K, mutate } from "../src/server/store.ts";
import { roundAccount } from "../src/server/daily.ts";

const C = 1_000_000;
const MIN = 60_000;
const DAY = 86_400_000;
type S = { s: any };

/** Day changes shown on the board (%), so it has a real spread of movers. Skibidi's +31% is the hook's number. */
const CHANGE: Record<string, number> = {
  "skibidi-toilet": 31, "moo-deng": 8.7, "chill-guy": -3.8, "ok-boomer": -9.9, "grimace-shake": 5.1,
  "coffin-dance": -1.0, "dat-boi": 2.0, "storm-area-51": -2.9, "italian-brainrot": 3.1, "tung-sahur": 1.0,
};
const TRADERS: [string, string, "buy" | "sell", number][] = [
  ["stonkwizard", "skibidi-toilet", "buy", 80], ["moodeng_maxi", "moo-deng", "buy", 250], ["chillguy_capital", "chill-guy", "buy", 200],
  ["paperhands_pete", "ok-boomer", "sell", 150], ["dankvalue", "grimace-shake", "buy", 120], ["shortking", "coffin-dance", "sell", 180],
  ["meme_quant", "italian-brainrot", "buy", 90], ["boomer_bear", "ok-boomer", "sell", 60],
];

export async function seedDemo(me: string) {
  await ensureSeeded();
  const now = Date.now();
  const mid = await mutate(({ world, now: t }) => {
    for (const [user, memeId, side, qty] of TRADERS) {
      const id = roundAccount(user, t);
      if (!world.engine.hasAccount(id)) world.submit({ type: "account.open", accountId: id }, t);
      world.submit({ type: "order.market", accountId: id, memeId, side, qty }, t);
    }
    const id = roundAccount(me, t);
    if (!world.engine.hasAccount(id)) world.submit({ type: "account.open", accountId: id }, t);
    const s = (world.engine as unknown as S).s;
    // Faaz bought 400 Skibidi Toilet at 76 this morning.
    const a = s.accounts[id], m = s.memes["skibidi-toilet"];
    a.cash -= 400 * 76.3 * C;
    a.shares["skibidi-toilet"] = 400;
    a.pos["skibidi-toilet"] = { openedAt: t - 9 * 60 * MIN, flow: -400 * 76.3 * C, peak: 400, basis: 400 * 76.3 * C };
    m.longOI += 400;
    m.houseCash += 400 * 76.3 * C;
    const feed = (world as unknown as { feed: any }).feed;
    for (const row of world.markets()) if (row.memeId in CHANGE) feed.hours[row.memeId] = [{ hour: t - 23 * 60 * MIN, open: row.mid / (1 + CHANGE[row.memeId] / 100) }];
    return world.markets().find((r) => r.memeId === "skibidi-toilet")!.mid;
  });
  // Skibidi Toilet's run: a 90-minute climb to today's price on the candle chart.
  for (let i = 90; i >= 1; i--) {
    const minute = now - (now % MIN) - i * MIN;
    const f = (90 - i) / 89;
    const p = (x: number) => (mid / 1.31) * 1.31 ** x;
    const open = p(Math.max(0, f - 1 / 89)) * (1 + 0.006 * Math.sin(i * 1.7));
    const close = p(f) * (1 + 0.008 * Math.sin(i * 2.3));
    const c = { memeId: "skibidi-toilet", minute, open, close, high: Math.max(open, close) * 1.004, low: Math.min(open, close) * 0.996, volume: 40 + ((i * 37) % 90) };
    await redis.zAdd(K.candles("skibidi-toilet"), { member: JSON.stringify(c), score: minute });
  }
  for (const [user] of TRADERS) await markPlayed(user, now);
  await markPlayed(me, now);
  await redis.del(DK.seenResult(me)); // show yesterday's result card again
  await redis.hSet(DK.player(me), { streak: "4", best: "4", days: "11", lastKey: dayKey(now), wins: "3", bestRank: "1" });
  const y = [me, "stonkwizard", "moodeng_maxi", "meme_quant", "dankvalue", "chillguy_capital", "shortking", "paperhands_pete", "boomer_bear"];
  const ret = [31.2, 18.4, 9.7, 6.1, 3.3, 1.2, -2.8, -7.5, -14.9];
  await redis.set(DK.results(dayKey(now - DAY)), JSON.stringify(y.map((user, i) => ({ rank: i + 1, user, equity: 100_000 * (1 + ret[i] / 100), returnPct: ret[i] }))));
  return { ok: true };
}
