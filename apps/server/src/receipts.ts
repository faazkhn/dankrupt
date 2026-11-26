import { COIN, type EngineEvent, type Output } from "@dankrupt/engine";

type Receipt = {
  id: number; memeId: string; side: "buy" | "sell"; qty: number; time: number; status: string;
  fills: { time: number; qty: number; cost: number; fee: number }[];
};

/** Rebuilt from the event log on boot, including maker fills between user requests. */
export class Receipts {
  private accounts = new Map<string, Map<number, Receipt>>();

  apply(ev: EngineEvent | null, out: Output) {
    if (ev && (ev.type === "order.limit" || ev.type === "order.market" || ev.type === "order.stop")) {
      const orders = this.accounts.get(ev.accountId) ?? new Map<number, Receipt>();
      this.accounts.set(ev.accountId, orders);
      orders.set(ev.seq, { id: ev.seq, memeId: ev.memeId, side: ev.side, qty: ev.qty, time: ev.time,
        status: out.rejects.length ? "rejected" : ev.type === "order.market" ? "complete" : "open", fills: [] });
    }
    for (const fill of out.fills) {
      const receipt = this.accounts.get(fill.accountId)?.get(fill.orderId ?? -1);
      receipt?.fills.push({ time: fill.time, qty: fill.qty, cost: fill.cost / COIN, fee: fill.fee / COIN });
    }
    for (const update of out.orders) {
      const receipt = this.accounts.get(update.accountId)?.get(update.orderId);
      if (receipt) receipt.status = update.status;
    }
  }

  recent(account: string) {
    return [...(this.accounts.get(account)?.values() ?? [])].slice(-50).reverse();
  }
}
