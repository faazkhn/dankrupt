"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { AttentionCard } from "@/components/AttentionCard";
import { CandleChart } from "@/components/CandleChart";
import { Countdown } from "@/components/Countdown";
import { OpenOrdersCard } from "@/components/OpenOrdersCard";
import { OrderBookCard } from "@/components/OrderBookCard";
import { OrderTicket } from "@/components/OrderTicket";
import { PositionCard } from "@/components/PositionCard";
import { TradeHeader } from "@/components/TradeHeader";
import { fmt, fmtInt, fmtPct, getMemeMeta, useBook, useCandles, useMarkets, useMe, type Fill } from "@/lib/market";

export function MemeView({ memeId }: { memeId: string }) {
  const { rows } = useMarkets();
  const candles = useCandles(memeId);
  const book = useBook(memeId);
  const { me, setMe, status } = useMe();
  const [fills, setFills] = useState<(Fill & { at: number })[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [meta, setMeta] = useState<{ description: string; links: string[] } | null>(null);
  useEffect(() => {
    getMemeMeta(memeId).then(setMeta).catch(() => {});
  }, [memeId]);

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
        {meme?.status === "dormant" && (
          <div className="mx-auto mt-5 max-w-5xl px-4">
            <p className="rounded-2xl border-[3px] border-ink bg-ink/80 px-4 py-2 font-bold text-paper">
              <span className="font-display mr-2 text-lg">IN THE GRAVEYARD</span>
              Attention has been cold for a week, so fair value decays by half every 7 days. Still tradable: holders keep their shares, and a
              spike in attention brings it back. Borrow costs 5× here.
            </p>
          </div>
        )}
        {meme?.status === "halted" && (
          <div className="mx-auto mt-5 max-w-5xl px-4">
            <p className="paper px-4 py-2 font-bold text-berry">This meme was pulled. Every position was settled at the mark, and trading has stopped.</p>
          </div>
        )}
        {meme?.comebackAt && meme.status === "active" && (
          <div className="mx-auto mt-5 max-w-5xl px-4">
            <p className="sticker rounded-2xl px-4 py-2 font-bold">
              <span className="font-display mr-2 text-lg">COMEBACK!</span>
              Back from the Graveyard: attention spiked, the decay is gone and the house is climbing toward the new fair value.
            </p>
          </div>
        )}
        {meme?.status === "preopen" && meme.opensAt && (
          <div className="mx-auto mt-5 max-w-5xl px-4">
            <p className="sticker rounded-2xl px-4 py-2 font-bold">
              <span className="font-display mr-2 text-lg">PRE-OPEN</span>
              The house opens at 100 in <Countdown to={meme.opensAt} />. Until then, trade with other players using limit orders: the opening
              price comes from your bids.
            </p>
          </div>
        )}
        <div className="mx-auto grid max-w-5xl gap-6 px-4 pt-6 md:grid-cols-[1.45fr_1fr]">
          <section className="space-y-6">
            <div className="paper -rotate-[0.3deg] p-5 sm:p-6">
              <h1 className="font-display text-4xl leading-tight sm:text-5xl">{meme?.name ?? "…"}</h1>
              {meta?.description && <p className="mt-1 font-semibold text-ink-soft">{meta.description}</p>}
              {meta?.links.length ? (
                <p className="mt-1 flex flex-wrap gap-3 text-sm font-bold">
                  {meta.links.map((l) => (
                    <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="underline decoration-2 underline-offset-2">
                      {new URL(l).hostname.replace(/^www\./, "")}
                    </a>
                  ))}
                </p>
              ) : null}
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
              <CandleChart candles={candles} fair={meme?.fair} className="mt-4 min-h-48" />
              <p className="mt-1 text-xs font-bold text-ink-soft">The chart follows the mid price between the best bid and ask, one candle per minute.</p>
            </div>
            <AttentionCard memeId={memeId} fair={meme?.fair} />
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
            {me && <PositionCard me={me} memeId={memeId} />}
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
