import type { Sequencer } from "./sequencer.ts";

/** Two funded desks submit ordinary journaled orders. Only owned inventory can be offered. */
export async function quoteDealer(seq: Sequencer, memeId: string, desk: number) {
  const market = seq.engine.meme(memeId);
  if (market.status !== "active") return;
  const accountId = "@desk" + desk + "/" + memeId;
  if (!seq.engine.hasAccount(accountId)) await seq.submit({ type: "account.open", accountId });
  const account = seq.engine.account(accountId);
  const orders = seq.engine.openOrders(accountId);
  const inventory = account.shares[memeId] ?? 0;
  const target = desk === 1 ? 24 : 48;
  const center = market.price * (1 + 0.0005 * (1 - inventory / target));
  for (const side of ["buy", "sell"] as const) {
    const old = orders.find(o => o.side === side);
    const half = desk === 1 ? 0.0012 : 0.0024;
    const price = Math.max(0.01, Math.round(center * (side === "buy" ? 1 - half : 1 + half) * 100) / 100);
    const qty = side === "buy" ? Math.max(0, Math.min(target, target * 2 - inventory)) : Math.min(target, inventory);
    if (!qty) {
      if (old) await seq.submit({ type: "order.cancel", accountId, orderId: old.orderId });
    } else if (!old || old.price !== price || old.qty !== qty) {
      await seq.submit({ type: "order.limit", accountId, memeId, side, price, qty,
        replaceOrderId: old?.orderId, expiresAt: Date.now() + 120_000 });
    }
  }
}

export function startDealers(seq: Sequencer) {
  let turn = 0, running = false;
  return setInterval(async () => {
    if (running) return;
    const markets = seq.engine.memes().filter(m => m.status === "active");
    if (!markets.length) return;
    running = true;
    try {
      const slot = turn++ % (markets.length * 2);
      await quoteDealer(seq, markets[Math.floor(slot / 2)].memeId, 1 + slot % 2);
    } catch (e) { console.error("dealer quote failed", e); }
    finally { running = false; }
  }, 2_000).unref();
}
