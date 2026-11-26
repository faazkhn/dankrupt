import { COIN, type EngineEvent, type Output } from "@dankrupt/engine";

export type Receipt = {
  id: number; memeId: string; side: "buy" | "sell"; qty: number; time: number; status: string;
  fills: { time: number; qty: number; cost: number; fee: number }[];
};

/**
 * The web server's Receipts projection over plain arrays (one per account, oldest first), so it can
 * live in Redis. Only accounts present in `books` are updated; the caller loads the ones it touched.
 */
export function applyReceipts(books: Map<string, Receipt[]>, ev: EngineEvent | null, out: Output) {
  if (ev && (ev.type === "order.limit" || ev.type === "order.market" || ev.type === "order.stop")) {
    books.get(ev.accountId)?.push({
      id: ev.seq, memeId: ev.memeId, side: ev.side, qty: ev.qty, time: ev.time,
      status: out.rejects.length ? "rejected" : ev.type === "order.market" ? "complete" : "open", fills: [],
    });
  }
  const find = (accountId: string, orderId: number | null) => books.get(accountId)?.find((r) => r.id === orderId);
  for (const f of out.fills) find(f.accountId, f.orderId)?.fills.push({ time: f.time, qty: f.qty, cost: f.cost / COIN, fee: f.fee / COIN });
  for (const u of out.orders) {
    const r = find(u.accountId, u.orderId);
    if (r) r.status = u.status;
  }
}
