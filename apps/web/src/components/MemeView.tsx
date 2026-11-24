"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftIcon, MinusIcon, PlusIcon, SpinnerGapIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { Sparkline } from "@/components/Sparkline";
import { TradeHeader } from "@/components/TradeHeader";
import { fmt, placeOrder, useMarket, useMe, type Fill } from "@/lib/market";

const FEE = 0.001;

export function MemeView({ memeId }: { memeId: string }) {
  const { memes, history, refresh } = useMarket(2000);
  const { me, setMe, status } = useMe();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState(10);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [fills, setFills] = useState<Fill[]>([]);

  const meme = memes?.find((m) => m.memeId === memeId);
  if (memes && !meme)
    return (
      <main className="mx-auto max-w-md flex-1 px-4 py-16 text-center">
        <p className="paper p-6 text-xl font-bold">
          No meme called &ldquo;{memeId}&rdquo; is listed. <Link href="/trade" className="underline">Back to markets</Link>
        </p>
      </main>
    );

  const pts = history.get(memeId) ?? [];
  const first = pts[0] ?? meme?.price ?? 0;
  const change = meme && first ? ((meme.price - first) / first) * 100 : 0;
  const held = me?.shares[memeId] ?? 0;
  const estimate = meme ? qty * (side === "buy" ? meme.ask * (1 + FEE) : meme.bid * (1 - FEE)) : 0;

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
        const verb = side === "buy" ? "Bought" : "Sold";
        setResult({ ok: true, text: `${verb} ${f.qty.toLocaleString("en-IN")} at about ${fmt(f.cost / f.qty)} each` });
      }
      refresh();
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const up = change >= 0;
  const Trend = up ? TrendUpIcon : TrendDownIcon;

  return (
    <>
      <TradeHeader me={me} />
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-6 px-4 py-6 md:grid-cols-[1.4fr_1fr]">
        <section className="space-y-5">
          <Link href="/trade" className="inline-flex min-h-11 items-center gap-2 font-extrabold">
            <ArrowLeftIcon weight="bold" aria-hidden="true" /> Markets
          </Link>
          <div className="paper -rotate-[0.4deg] p-5 sm:p-6">
            <h1 className="font-display text-4xl leading-tight sm:text-5xl">{meme?.name ?? "…"}</h1>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="text-5xl font-black" aria-live="polite">
                {meme ? fmt(meme.price) : "--"}
              </p>
              <p className={`flex items-center gap-1 text-xl font-extrabold ${up ? "text-mint" : "text-berry"}`}>
                <Trend weight="bold" aria-hidden="true" />
                {up ? "+" : ""}
                {change.toFixed(2)}%<span className="text-sm font-bold text-ink-soft">this visit</span>
              </p>
            </div>
            <Sparkline points={pts} className="mt-4 h-40 w-full" />
            {meme && (
              <dl className="mt-3 flex gap-6 font-bold text-ink-soft">
                <div>
                  <dt className="inline">Bid </dt>
                  <dd className="inline text-ink">{fmt(meme.bid)}</dd>
                </div>
                <div>
                  <dt className="inline">Ask </dt>
                  <dd className="inline text-ink">{fmt(meme.ask)}</dd>
                </div>
              </dl>
            )}
          </div>
          {fills.length > 0 && (
            <div className="paper p-5">
              <h2 className="font-display text-2xl">Your fills this visit</h2>
              <ul className="mt-2 divide-y-2 divide-dashed divide-ink/20">
                {fills.map((f, i) => (
                  <li key={i} className="flex justify-between py-2 font-bold">
                    <span className={f.side === "buy" ? "text-mint" : "text-berry"}>
                      {f.side === "buy" ? "Bought" : "Sold"} {f.qty.toLocaleString("en-IN")}
                    </span>
                    <span>{fmt(f.cost / f.qty)} each</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="space-y-5 md:pt-14">
          <div className="paper rotate-[0.5deg] p-5 sm:p-6">
            <h2 className="font-display text-2xl">Place an order</h2>
            {status === "signed-out" ? (
              <p className="mt-3 font-bold">
                <Link href="/dev-login" className="underline decoration-2">Sign in</Link> to trade.
              </p>
            ) : (
              <>
                <div role="radiogroup" aria-label="Order side" className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border-[3px] border-ink bg-paper-shade p-1">
                  {(["buy", "sell"] as const).map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={side === s}
                      onClick={() => setSide(s)}
                      className={`font-display min-h-11 cursor-pointer rounded-xl text-xl capitalize transition-colors ${
                        side === s ? (s === "buy" ? "bg-[#4cc26f] shadow-[0_3px_0_var(--ink)]" : "bg-[#ff8a7a] shadow-[0_3px_0_var(--ink)]") : "text-ink-soft"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <label htmlFor="qty" className="mt-4 block text-lg font-extrabold">
                  Shares
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <button type="button" aria-label="Fewer shares" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid size-12 cursor-pointer place-items-center rounded-xl border-[3px] border-ink bg-white shadow-[0_3px_0_var(--ink)]">
                    <MinusIcon weight="bold" aria-hidden="true" />
                  </button>
                  <input
                    id="qty"
                    inputMode="numeric"
                    value={qty}
                    onChange={(e) => setQty(Math.max(0, Math.min(10_000_000, Number(e.target.value.replace(/\D/g, "")) || 0)))}
                    className="min-h-12 w-full rounded-xl border-[3px] border-ink bg-white px-3 text-center text-2xl font-black"
                  />
                  <button type="button" aria-label="More shares" onClick={() => setQty((q) => q + 1)} className="grid size-12 cursor-pointer place-items-center rounded-xl border-[3px] border-ink bg-white shadow-[0_3px_0_var(--ink)]">
                    <PlusIcon weight="bold" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-3 font-bold text-ink-soft">
                  {side === "buy" ? "Costs about" : "Gets you about"} <span className="text-ink">{fmt(estimate)}</span> coins incl. 0.1% fee
                </p>
                <button
                  onClick={submit}
                  disabled={busy || !meme || qty < 1}
                  className={`btn-candy mt-4 w-full ${side === "buy" ? "bg-[#4cc26f]!" : "bg-[#ff8a7a]!"}`}
                >
                  {busy ? <SpinnerGapIcon className="size-6 animate-spin" aria-hidden="true" /> : null}
                  {side === "buy" ? "Buy" : "Sell"} {qty.toLocaleString("en-IN")}
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
              <p className="mt-1 text-3xl font-black">{held.toLocaleString("en-IN")} shares</p>
              {meme && held > 0 && <p className="font-bold text-ink-soft">Worth about {fmt(held * meme.bid)} at the bid</p>}
            </div>
          )}
        </aside>
      </main>
    </>
  );
}
