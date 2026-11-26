"use client";

import { useState } from "react";
import { XIcon } from "@phosphor-icons/react";
import { cancelOrder, placeOrder, fmt, fmtInt, type Me } from "@/lib/market";

export function OpenOrdersCard({ me, memeId, onChange }: { me: Me; memeId: string; onChange: (m: Me) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const orders = me.orders.filter((o) => o.memeId === memeId);
  if (!orders.length) return null;
  return (
    <div className="paper p-5">
      <h2 className="font-display text-2xl">Your open orders</h2>
      <ul className="mt-2 divide-y-2 divide-dashed divide-ink/20">
        {orders.map((o) => (
          <li key={o.orderId} className="flex flex-wrap items-center justify-between gap-3 py-2 font-bold">
            <span>
              {o.kind === "stop" && <span className="mr-1 rounded-md bg-ink px-1.5 py-0.5 text-xs text-paper">STOP</span>}
              <span className={o.side === "buy" ? "text-mint" : "text-berry"}>{o.side === "buy" ? "Buy" : "Sell"}</span> {fmtInt(o.qty)}{" "}
              {o.kind === "stop" ? (o.side === "sell" ? "if price falls to" : "if price rises to") : "at"} <span className="tabular-nums">{fmt(o.price)}</span>
              {o.expiresAt && (
                <span className="block text-xs text-ink-soft">
                  until {new Date(o.expiresAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </span>
            <button
              type="button"
              disabled={busy === o.orderId}
              onClick={async () => {
                setBusy(o.orderId);
                try {
                  onChange((await cancelOrder(o.orderId)).account);
                } finally {
                  setBusy(null);
                }
              }}
              className="btn-candy is-small is-muted gap-1 px-3 text-base"
            >
              <XIcon weight="bold" aria-hidden="true" /> Cancel
            </button>
            {o.kind === "limit" && <details className="w-full">
              <summary className="cursor-pointer text-sm underline">Amend limit order</summary>
              <form className="mt-2 grid gap-2" onSubmit={async event => {
                event.preventDefault();
                const fields = new FormData(event.currentTarget);
                setBusy(o.orderId); setError("");
                try {
                  const result = await placeOrder({ type: "limit", memeId, side: o.side, replaceOrderId: o.orderId,
                    price: Number(fields.get("price")), qty: Number(fields.get("qty")) });
                  onChange(result.account);
                  setError(result.rejects[0]?.reason ?? "");
                } catch { setError("Could not confirm amendment. Check open orders."); }
                finally { setBusy(null); }
              }}>
                <label>Price <input className="w-28 border px-2" type="number" required min=".01" step=".01" name="price" defaultValue={o.price}/></label>
                <label>Remaining shares <input className="w-20 border px-2" type="number" required min="1" max="10000000" name="qty" defaultValue={o.qty}/></label>
                <button className="btn-candy is-small" disabled={busy !== null}>Replace at back of queue</button>
              </form>
            </details>}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
