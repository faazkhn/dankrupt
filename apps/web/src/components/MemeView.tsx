"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftIcon, MinusIcon, PlusIcon, SpinnerGapIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { CandleChart } from "@/components/CandleChart";
import { TornPaper } from "@/components/TornPaper";
import { TradeHeader } from "@/components/TradeHeader";
import { fmt, fmtInt, fmtPct, placeOrder, useCandles, useMarkets, useMe, type Fill } from "@/lib/market";

const FEE = 0.001;

export function MemeView({ memeId }: { memeId: string }) {
  const { rows } = useMarkets();
  const candles = useCandles(memeId);
  const { me, setMe, status } = useMe();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState(10);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [fills, setFills] = useState<Fill[]>([]);

  const meme = rows?.get(memeId);
  if (rows && !meme)
    return (
      <>
        <TradeHeader me={me} />
        <main className="mx-auto max-w-md flex-1 px-4 py-16 text-center">
          <p className="paper p-6 text-xl font-bold">
            No meme called &ldquo;{memeId}&rdquo; is listed.{" "}
            <Link href="/trade" className="underline">
              Back to markets
            </Link>
          </p>
        </main>
      </>
    );

  const held = me?.shares[memeId] ?? 0;
  const estimate = meme ? qty * (side === "buy" ? meme.ask * (1 + FEE) : meme.bid * (1 - FEE)) : 0;
  const up = (meme?.change24h ?? 0) >= 0;
  const Trend = up ? TrendUpIcon : TrendDownIcon;

  async function submit() {
    if (!meme || qty < 1) return;
    setBusy(true);
    setResult(null);
    try {
      const out = await placeOrder(memeId, side, qty);
      setMe((m) => (m ? { ...m, ...out.account } : m));
      if (out.rejects.length) setResult({ ok: false, text: out.rejects[0].reason });
      else {
        const f = out.fills[0];
        setFills((xs) => [f, ...xs].slice(0, 8));
        setResult({ ok: true, text: `${side === "buy" ? "Bought" : "Sold"} ${fmtInt(f.qty)} at about ${fmt(f.cost / f.qty)} each` });
      }
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TradeHeader me={me} />
      <main className="flex-1 pb-16">
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <Link href="/trade" className="font-display inline-flex min-h-11 items-center gap-2 text-lg text-paper [text-shadow:0_2px_0_var(--ink)]">
            <ArrowLeftIcon weight="bold" aria-hidden="true" /> Markets
          </Link>
        </div>
        <TornPaper>
          <div className="mx-auto grid max-w-5xl gap-6 px-4 pt-12 pb-14 md:grid-cols-[1.45fr_1fr]">
            <section className="space-y-5">
              <div className="paper -rotate-[0.3deg] p-5 sm:p-6">
                <h1 className="font-display text-4xl leading-tight sm:text-5xl">{meme?.name ?? "…"}</h1>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <p className="text-5xl font-black tabular-nums">{meme ? fmt(meme.ltp ?? meme.mid) : "--"}</p>
                  <p className={`flex items-center gap-1 text-xl font-black ${up ? "text-mint" : "text-berry"}`}>
                    <Trend weight="bold" aria-hidden="true" />
                    {fmtPct(meme?.change24h ?? 0)}
                    <span className="text-sm font-bold text-ink-soft">24h</span>
                  </p>
                </div>
                <p className="text-sm font-bold text-ink-soft">
                  {meme?.ltp == null ? "No trades yet: showing the house mid price" : "Last traded price"}
                  {meme && ` · Bid ${fmt(meme.bid)} · Ask ${fmt(meme.ask)}`}
                </p>
                <CandleChart candles={candles} className="mt-4 min-h-48" />
              </div>
              {fills.length > 0 && (
                <div className="paper p-5">
                  <h2 className="font-display text-2xl">Your fills this visit</h2>
                  <ul className="mt-2 divide-y-2 divide-dashed divide-ink/20">
                    {fills.map((f, i) => (
                      <li key={i} className="flex justify-between py-2 font-bold">
                        <span className={f.side === "buy" ? "text-mint" : "text-berry"}>
                          {f.side === "buy" ? "Bought" : "Sold"} {fmtInt(f.qty)}
                        </span>
                        <span className="tabular-nums">{fmt(f.cost / f.qty)} each</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <aside className="space-y-5">
              <div className="paper rotate-[0.4deg] p-5 sm:p-6">
                <h2 className="font-display text-2xl">Place an order</h2>
                {status === "signed-out" ? (
                  <p className="mt-3 font-bold">
                    <Link href="/dev-login" className="underline decoration-2">
                      Sign in
                    </Link>{" "}
                    to trade.
                  </p>
                ) : (
                  <>
                    <div role="radiogroup" aria-label="Order side" className="mt-4 grid grid-cols-2 gap-3">
                      {(["buy", "sell"] as const).map((s) => (
                        <button
                          key={s}
                          role="radio"
                          aria-checked={side === s}
                          onClick={() => setSide(s)}
                          className={`btn-candy is-small capitalize ${side === s ? `is-${s}` : "is-muted"}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <label htmlFor="qty" className="mt-5 block text-lg font-extrabold">
                      Shares
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <button type="button" aria-label="Fewer shares" onClick={() => setQty((q) => Math.max(1, q - 1))} className="btn-candy is-small is-secondary">
                        <MinusIcon weight="bold" aria-hidden="true" />
                      </button>
                      <input
                        id="qty"
                        inputMode="numeric"
                        value={fmtInt(qty)}
                        onChange={(e) => setQty(Math.max(0, Math.min(10_000_000, Number(e.target.value.replace(/\D/g, "")) || 0)))}
                        className="min-h-12 w-full min-w-0 rounded-[14px] border-[3px] border-ink bg-white px-3 text-center text-2xl font-black tabular-nums shadow-[inset_0_3px_0_var(--paper-shade)]"
                      />
                      <button type="button" aria-label="More shares" onClick={() => setQty((q) => q + 1)} className="btn-candy is-small is-secondary">
                        <PlusIcon weight="bold" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="mt-3 font-bold text-ink-soft">
                      {side === "buy" ? "Costs about" : "Gets you about"} <span className="text-ink tabular-nums">{fmt(estimate)}</span> coins incl. 0.1% fee
                    </p>
                    <button onClick={submit} disabled={busy || !meme || qty < 1} className={`btn-candy is-${side} mt-4 w-full`}>
                      {busy && <SpinnerGapIcon className="size-6 animate-spin" aria-hidden="true" />}
                      {side === "buy" ? "Buy" : "Sell"} {fmtInt(qty)} at market
                    </button>
                    <p role="status" className={`mt-3 min-h-6 font-bold ${result?.ok ? "text-mint" : "text-berry"}`}>
                      {result?.text}
                    </p>
                  </>
                )}
              </div>
              {me && (
                <div className="paper -rotate-[0.6deg] p-5">
                  <h2 className="font-display text-2xl">Your position</h2>
                  <p className="mt-1 text-3xl font-black tabular-nums">{fmtInt(held)} shares</p>
                  {meme && held > 0 && <p className="font-bold text-ink-soft">Worth about {fmt(held * meme.bid)} at the bid</p>}
                </div>
              )}
            </aside>
          </div>
        </TornPaper>
      </main>
    </>
  );
}
