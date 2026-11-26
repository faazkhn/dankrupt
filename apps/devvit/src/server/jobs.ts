import { redis } from "@devvit/web/server";
import * as daily from "./daily.ts";
import * as signals from "./signals.ts";
import { K, mutate, peek, snapshotEquity } from "./store.ts";
import type { World } from "./world.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Two funded desks per meme quote around the house, as on the web server (dealers.ts), all memes each minute. */
function quoteDealers(world: World, now: number) {
  for (const market of world.engine.memes()) {
    if (market.status !== "active") continue;
    for (const desk of [1, 2]) {
      const accountId = `@desk${desk}/${market.memeId}`;
      if (!world.engine.hasAccount(accountId)) world.submit({ type: "account.open", accountId }, now);
      const inventory = world.engine.account(accountId).shares[market.memeId] ?? 0;
      const orders = world.engine.openOrders(accountId);
      const target = desk === 1 ? 24 : 48;
      const half = desk === 1 ? 0.0012 : 0.0024;
      const center = world.engine.meme(market.memeId).price * (1 + 0.0005 * (1 - inventory / target));
      for (const side of ["buy", "sell"] as const) {
        const old = orders.find((o) => o.side === side);
        const price = Math.max(0.01, Math.round(center * (side === "buy" ? 1 - half : 1 + half) * 100) / 100);
        const qty = side === "buy" ? Math.max(0, Math.min(target, target * 2 - inventory)) : Math.min(target, inventory);
        if (!qty) {
          if (old) world.submit({ type: "order.cancel", accountId, orderId: old.orderId }, now);
        } else if (!old || old.price !== price || old.qty !== qty) {
          world.submit({ type: "order.limit", accountId, memeId: market.memeId, side, price, qty, replaceOrderId: old?.orderId, expiresAt: now + 2 * MINUTE }, now);
        }
      }
    }
  }
}

/** Runs `fn` if `name` hasn't run in the last `everyMs`. */
async function every(name: string, everyMs: number, now: number, fn: () => Promise<unknown>) {
  const last = Number((await redis.hGet(K.jobs, name)) ?? 0);
  if (now - last < everyMs) return;
  await redis.hSet(K.jobs, { [name]: String(now) });
  await fn().catch((e) => console.error(`job ${name} failed`, e));
}

/** The minute cron: keeps the clock, the desks, the daily round and the attention data moving. */
export async function tick() {
  const now = Date.now();
  await daily.ensureSeeded();
  await daily.rollover(now);
  await mutate(({ world, now: t }) => quoteDealers(world, t));
  await every("equity", 15 * MINUTE, now, async () => snapshotEquity(await peek(), now));
  await every("candles-trim", HOUR, now, async () => {
    for (const m of (await peek()).engine.memes()) await redis.zRemRangeByScore(K.candles(m.memeId), 0, now - 2 * 24 * HOUR);
  });
  const fetched = await signals.fetchDue(now, 12_000);
  const hourly = Math.floor(now / HOUR) !== Math.floor(Number((await redis.hGet(K.jobs, "features")) ?? 0) / HOUR);
  const ids = hourly ? (await peek()).engine.memes().map((m) => m.memeId) : fetched;
  if (!ids.length) return;
  if (hourly) await redis.hSet(K.jobs, { features: String(now) });
  const events = await signals.recompute(await peek(), ids, now);
  if (events.length) await mutate(({ world, now: t }) => events.forEach((ev) => world.submit(ev, t)));
}
