"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { CandleChart } from "@/components/CandleChart";
import { OpenOrdersCard } from "@/components/OpenOrdersCard";
import { OrderBookCard } from "@/components/OrderBookCard";
import { OrderTicket } from "@/components/OrderTicket";
import { TradeHeader } from "@/components/TradeHeader";
import { fmt, fmtInt, fmtPct, useBook, useCandles, useMarkets, useMe, type Fill } from "@/lib/market";

export function MemeView({ memeId }: { memeId: string }) {
  const { rows } = useMarkets();
  const candles = useCandles(memeId);
  const book = useBook(memeId);
  const { me, setMe, status } = useMe();
  const [fills, setFills] = useState<(Fill & { at: number })[]>([]);
  const [picked, setPicked] = useState<number | null>(null);

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
  const up = (meme?.change24h ?? 0) >= 0;
  const Trend = up ? TrendUpIcon : TrendDownIcon;

  return (
    <>
      <TradeHeader me={me} />
      <main className="flex-1 pb-16">
        <div className="mx-auto max-w-5xl px-4 pt-6">
          <Link href="/trade" className="btn-candy is-secondary is-small px-5">
            <ArrowLeftIcon weight="bold" className="size-6" aria-hidden="true" /> Markets
          </Link>
        </div>
        <div className="mx-auto grid max-w-5xl gap-6 px-4 pt-6 md:grid-cols-[1.45fr_1fr]">
          <section className="space-y-6">
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
                {meme?.ltp == null ? "No trades yet: showing the mid price" : "Last traded price"}
                {meme && ` · Bid ${fmt(meme.bid)} · Ask ${fmt(meme.ask)}`}
              </p>
              <CandleChart candles={candles} className="mt-4 min-h-48" />
              <p className="mt-1 text-xs font-bold text-ink-soft">The chart follows the mid price between the best bid and ask, one candle per minute.</p>
            </div>
            <OrderBookCard book={book} onPick={setPicked} />
          </section>

          <aside className="space-y-6">
            <div className="paper rotate-[0.4deg] p-5 sm:p-6">
              <h2 className="font-display text-2xl">Place an order</h2>
              <OrderTicket
                memeId={memeId}
                meme={meme}
                me={me}
                signedOut={status === "signed-out"}
                pickedPrice={picked}
                onPlaced={(account, newFills) => {
                  setMe(account);
                  setFills((xs) => [...newFills.map((f) => ({ ...f, at: Date.now() })), ...xs].slice(0, 10));
                }}
              />
            </div>
            {me && <OpenOrdersCard me={me} memeId={memeId} onChange={setMe} />}
            {me && (
              <div className="paper -rotate-[0.6deg] p-5">
                <h2 className="font-display text-2xl">Your position</h2>
                <p className="mt-1 text-3xl font-black tabular-nums">{fmtInt(held)} shares</p>
                {meme && held > 0 && <p className="font-bold text-ink-soft">Worth about {fmt(held * meme.bid)} at the bid</p>}
                {(me.heldShares[memeId] ?? 0) > 0 && <p className="text-sm font-bold text-ink-soft">{fmtInt(me.heldShares[memeId])} held by your sell orders</p>}
              </div>
            )}
            {fills.length > 0 && (
              <div className="paper p-5">
                <h2 className="font-display text-2xl">Your fills this visit</h2>
                <ul className="mt-2 divide-y-2 divide-dashed divide-ink/20">
                  {fills.map((f, i) => (
                    <li key={i} className="flex justify-between gap-2 py-2 font-bold">
                      <span className={f.side === "buy" ? "text-mint" : "text-berry"}>
                        {f.side === "buy" ? "Bought" : "Sold"} {fmtInt(f.qty)}
                        <span className="block text-xs text-ink-soft">{f.source === "book" ? "from a player" : "from the house"}</span>
                      </span>
                      <span className="text-right tabular-nums">avg {fmt(f.cost / f.qty)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
