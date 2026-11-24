"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowCounterClockwiseIcon, ArrowLeftIcon } from "@phosphor-icons/react";
import { ShareButton } from "@/components/ShareButton";
import { Sparkline } from "@/components/Sparkline";
import { TradeHeader } from "@/components/TradeHeader";
import { fmt, fmtInt, getProfile, resetAccount, type Profile } from "@/lib/market";

const duration = (ms: number) => {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
};

export default function MePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(0);
  const load = useCallback(
    () =>
      getProfile()
        .then((x) => (setP(x), setNow(Date.now())))
        .catch((e: Error) => setError(e.message)),
    [],
  );
  useEffect(() => {
    const t = setTimeout(load, 0);
    const id = setInterval(load, 15_000);
    return () => (clearTimeout(t), clearInterval(id));
  }, [load]);

  const a = p?.account ?? null;
  return (
    <>
      <TradeHeader me={a} />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 pt-6 pb-16">
        <Link href="/trade" className="btn-candy is-secondary is-small px-5">
          <ArrowLeftIcon weight="bold" className="size-6" aria-hidden="true" /> Markets
        </Link>
        {error && (
          <p className="paper p-5 font-bold">
            {error === "sign in first" ? (
              <>
                <Link href="/dev-login" className="underline">
                  Sign in
                </Link>{" "}
                to see your profile.
              </>
            ) : (
              error
            )}
          </p>
        )}
        {a && (
          <section className="paper -rotate-[0.3deg] p-6">
            <h1 className="font-display text-4xl">@{a.accountId}</h1>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Stat label="Equity" value={fmt(a.equity)} />
              <Stat label="Cash" value={fmt(a.cash)} />
              <Stat label="Resets used" value={fmtInt(a.resets)} />
            </div>
            {p!.equity.length > 1 && (
              <figure className="mt-4">
                <figcaption className="text-sm font-bold text-ink-soft">Equity, last 30 days</figcaption>
                <Sparkline points={p!.equity.map((e) => e.equity)} className="mt-1 h-24 w-full" />
              </figure>
            )}
            {a.canReset && (
              <div className="mt-5 rounded-2xl border-[3px] border-dashed border-berry/60 bg-berry/5 p-4">
                <p className="font-bold">You&apos;re nearly out of coins. Take a free reset back to 100,000? Your reset count goes up by one and shows on your profile.</p>
                {confirming ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      className="btn-candy is-sell is-small px-4"
                      onClick={async () => {
                        const out = await resetAccount();
                        if (out.rejects.length) setError(out.rejects[0].reason);
                        setConfirming(false);
                        load();
                      }}
                    >
                      <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" /> Yes, reset me
                    </button>
                    <button className="btn-candy is-muted is-small px-4" onClick={() => setConfirming(false)}>
                      Not yet
                    </button>
                  </div>
                ) : (
                  <button className="btn-candy is-small mt-3 px-4" onClick={() => setConfirming(true)}>
                    <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" /> Free reset
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {a && (
          <section className="paper p-6">
            <h2 className="font-display text-3xl">Open positions</h2>
            {a.positions.length === 0 ? (
              <p className="mt-2 font-bold text-ink-soft">Nothing open. Go find the next big meme.</p>
            ) : (
              <ul className="mt-2 divide-y-2 divide-dashed divide-ink/20">
                {a.positions.map((x) => (
                  <li key={x.memeId}>
                    <Link href={`/m/${x.memeId}`} className="flex min-h-14 items-center justify-between gap-3 py-2 font-bold hover:bg-[#fff3d6]">
                      <span>
                        {x.qty < 0 && <span className="mr-1 rounded bg-berry px-1.5 text-xs text-paper">SHORT</span>}
                        {fmtInt(Math.abs(x.qty))} × {x.memeId}
                        <span className="block text-xs text-ink-soft">held {duration(now - x.openedAt)}</span>
                      </span>
                      <span className={`tabular-nums ${x.pnl >= 0 ? "text-mint" : "text-berry"}`}>
                        {x.pnl >= 0 ? "+" : "−"}
                        {fmt(Math.abs(x.pnl))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {p && (
          <section className="paper p-6">
            <h2 className="font-display text-3xl">Closed trades</h2>
            <p className="text-sm font-bold text-ink-soft">A trade is one round trip in a meme, from no position back to no position.</p>
            {p.trades.length === 0 ? (
              <p className="mt-2 font-bold text-ink-soft">No round trips yet.</p>
            ) : (
              <ul className="mt-2 divide-y-2 divide-dashed divide-ink/20">
                {p.trades.map((t) => (
                  <li key={`${t.memeId}-${t.openedAt}-${t.closedAt}`} className="flex items-center justify-between gap-3 py-2 font-bold">
                    <span>
                      {t.side === "short" ? "Short" : "Long"} {t.name}
                      <span className="block text-xs text-ink-soft">
                        {fmtInt(t.peakQty)} shares · held {duration(t.closedAt - t.openedAt)} · closed {new Date(t.closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className={`text-right tabular-nums ${t.pnl >= 0 ? "text-mint" : "text-berry"}`}>
                        {t.pnl >= 0 ? "+" : "−"}
                        {fmt(Math.abs(t.pnl))}
                        {t.basis > 0 && <span className="block text-xs">{((t.pnl / t.basis) * 100).toFixed(1)}%</span>}
                      </span>
                      {a && t.basis > 0 && (
                        <ShareButton path={`/c/${a.accountId}/${t.memeId}/${t.closedAt}`} title={t.pnl >= 0 ? `I called ${t.name} on Dankrupt` : `My ${t.name} trade on Dankrupt`} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-ink/20 bg-paper-shade/60 p-3 text-center">
      <p className="text-xs font-black tracking-wide text-ink-soft uppercase">{label}</p>
      <p className="text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}
