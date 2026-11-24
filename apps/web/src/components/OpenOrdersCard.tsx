"use client";

import { useState } from "react";
import { XIcon } from "@phosphor-icons/react";
import { cancelOrder, fmt, fmtInt, type Me } from "@/lib/market";

export function OpenOrdersCard({ me, memeId, onChange }: { me: Me; memeId: string; onChange: (m: Me) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const orders = me.orders.filter((o) => o.memeId === memeId);
  if (!orders.length) return null;
  return (
    <div className="paper p-5">
      <h2 className="font-display text-2xl">Your open orders</h2>
      <ul className="mt-2 divide-y-2 divide-dashed divide-ink/20">
        {orders.map((o) => (
          <li key={o.orderId} className="flex items-center justify-between gap-3 py-2 font-bold">
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
          </li>
        ))}
      </ul>
    </div>
  );
}
