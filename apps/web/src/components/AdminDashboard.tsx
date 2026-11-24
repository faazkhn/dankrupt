"use client";

import { useEffect, useState } from "react";
import { WarningIcon } from "@phosphor-icons/react";
import { adminCall, fmt } from "@/lib/market";

type Dash = {
  supply: number;
  supplyWeekAgo: number | null;
  weeklyGrowthPerActivePlayerPct: number | null;
  targetPct: number;
  accounts: number;
  activePlayers7d: number;
  signups7d: number;
  resets7d: number;
  feesAllTime: number;
  fees24h: number;
  minted: number;
  housePnl: number;
  house: { memeId: string; name: string; status: string; shares: number; pnl: number }[];
  health: { seq: number; tickLagMs: number; orderP50Ms: number | null; orderP99Ms: number | null; orderSamples: number; wsClients: number; lastFeatures: Record<string, number | null> };
};

/** Is the economy running hot, and is the engine healthy? Refreshes every 15 seconds. */
export function AdminDashboard() {
  const [d, setD] = useState<(Dash & { at: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = () =>
      adminCall<Dash>("dashboard")
        .then((x) => (setD({ ...x, at: Date.now() }), setError(null)))
        .catch((e: Error) => setError(e.message));
    const first = setTimeout(load, 0);
    const id = setInterval(load, 15_000);
    return () => (clearTimeout(first), clearInterval(id));
  }, []);
  if (error) return <p className="paper p-5 font-bold text-berry">{error}</p>;
  if (!d) return <div className="paper h-48 animate-pulse" aria-hidden="true" />;
  const hot = d.weeklyGrowthPerActivePlayerPct !== null && d.weeklyGrowthPerActivePlayerPct > d.targetPct;
  const stale = Object.entries(d.health.lastFeatures).filter(([, t]) => t === null || d.at - t > 3 * 3_600_000);
  return (
    <section className="paper p-6">
      <h2 className="font-display text-3xl">Economy and health</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Coin supply" value={fmt(d.supply, 0)} />
        <Stat
          label="Weekly growth / active player"
          value={d.weeklyGrowthPerActivePlayerPct === null ? "–" : `${d.weeklyGrowthPerActivePlayerPct.toFixed(2)}%`}
          warn={hot}
          note={`target ≤ ${d.targetPct}%`}
        />
        <Stat label="House P&L" value={fmt(d.housePnl, 0)} warn={d.housePnl < 0} note={d.housePnl < 0 ? "house losing: coins created" : "house winning: coins destroyed"} />
        <Stat label="Fees, 24h" value={fmt(d.fees24h, 0)} note={`${fmt(d.feesAllTime, 0)} all time`} />
        <Stat label="Players" value={String(d.accounts)} note={`${d.activePlayers7d} active this week`} />
        <Stat label="Sign-ups, 7d" value={String(d.signups7d)} />
        <Stat label="Resets, 7d" value={String(d.resets7d)} />
        <Stat label="Coins minted" value={fmt(d.minted, 0)} />
      </div>
      {hot && (
        <p className="mt-3 flex items-center gap-2 font-bold text-berry">
          <WarningIcon weight="fill" aria-hidden="true" /> Supply is running hot. The two dials: widen the base spread or raise the taker fee (Live params, below).
        </p>
      )}

      <h3 className="font-display mt-5 text-2xl">Engine</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Events" value={String(d.health.seq)} />
        <Stat label="Tick lag" value={`${(d.health.tickLagMs / 1000).toFixed(1)} s`} warn={d.health.tickLagMs > 5_000} />
        <Stat
          label="Orders p50 / p99"
          value={d.health.orderP50Ms === null ? "–" : `${d.health.orderP50Ms.toFixed(0)} / ${d.health.orderP99Ms!.toFixed(0)} ms`}
          warn={(d.health.orderP99Ms ?? 0) > 50}
          note={`${d.health.orderSamples} recent orders · target p99 < 50 ms`}
        />
        <Stat label="Live viewers" value={String(d.health.wsClients)} note="websocket clients" />
      </div>
      {stale.length > 0 && <p className="mt-2 text-sm font-bold text-berry">Attention data older than 3h: {stale.map(([id]) => id).join(", ")}</p>}

      <h3 className="font-display mt-5 text-2xl">House by meme</h3>
      <ul className="mt-2 divide-y-2 divide-dashed divide-ink/20 text-sm">
        {d.house.map((h) => (
          <li key={h.memeId} className="flex justify-between gap-3 py-1.5 font-bold">
            <span>
              {h.name} <span className="text-ink-soft">{h.shares > 0 ? `long ${h.shares}` : h.shares < 0 ? `short ${-h.shares}` : "flat"}</span>
            </span>
            <span className={`tabular-nums ${h.pnl >= 0 ? "text-mint" : "text-berry"}`}>
              {h.pnl >= 0 ? "+" : "−"}
              {fmt(Math.abs(h.pnl))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border-2 p-3 ${warn ? "border-berry bg-berry/10" : "border-ink/20 bg-paper-shade/60"}`}>
      <p className="text-[11px] font-black tracking-wide text-ink-soft uppercase">{label}</p>
      <p className="text-xl font-black tabular-nums">{value}</p>
      {note && <p className="text-xs font-bold text-ink-soft">{note}</p>}
    </div>
  );
}
