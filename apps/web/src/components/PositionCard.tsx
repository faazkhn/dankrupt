"use client";

import { ShieldWarningIcon } from "@phosphor-icons/react";
import { fmt, fmtInt, type Me } from "@/lib/market";

/** The player's position in this meme, its P&L, and (if short) how close the account is to liquidation. */
export function PositionCard({ me, memeId }: { me: Me; memeId: string }) {
  const p = me.positions.find((x) => x.memeId === memeId);
  const held = me.heldShares[memeId] ?? 0;
  const shortAnywhere = me.positions.some((x) => x.qty < 0);
  const cushion = me.equity - me.maintenance;
  const up = (p?.pnl ?? 0) >= 0;
  return (
    <div className="paper -rotate-[0.6deg] p-5">
      <h2 className="font-display text-2xl">Your position</h2>
      {!p ? (
        <p className="mt-1 text-3xl font-black">No position</p>
      ) : (
        <>
          <p className="mt-1 text-3xl font-black tabular-nums">
            {p.qty < 0 && <span className="mr-2 rounded-md bg-berry px-2 py-0.5 align-middle text-base text-paper">SHORT</span>}
            {fmtInt(Math.abs(p.qty))} shares
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-bold">
            <dt className="text-ink-soft">Mark price</dt>
            <dd className="text-right tabular-nums">{fmt(p.mark)}</dd>
            <dt className="text-ink-soft">{p.qty < 0 ? "To buy back" : "Worth"}</dt>
            <dd className="text-right tabular-nums">{fmt(Math.abs(p.value))}</dd>
            <dt className="text-ink-soft">Profit / loss</dt>
            <dd className={`text-right tabular-nums ${up ? "text-mint" : "text-berry"}`}>
              {up ? "+" : "−"}
              {fmt(Math.abs(p.pnl))}
            </dd>
          </dl>
        </>
      )}
      {held > 0 && <p className="mt-2 text-sm font-bold text-ink-soft">{fmtInt(held)} held by your sell orders</p>}
      {shortAnywhere && (
        <div className={`mt-3 rounded-xl border-2 p-3 text-sm font-bold ${cushion < me.maintenance * 0.3 ? "border-berry bg-berry/10" : "border-ink/20 bg-paper-shade/60"}`}>
          <p className="flex items-center gap-1.5">
            <ShieldWarningIcon weight="fill" className="size-5 shrink-0" aria-hidden="true" />
            Margin check: equity {fmt(me.equity)} vs liquidation line {fmt(me.maintenance)}
          </p>
          <p className="mt-1 text-ink-soft">
            {cushion > 0
              ? `You're ${fmt(cushion)} coins above it. If your shorts rise that much in value, they get bought back automatically.`
              : "You're below it: your shorts are being bought back."}
          </p>
        </div>
      )}
    </div>
  );
}
