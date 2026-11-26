"use client";

import { LiveQuoteChart } from "@/components/LiveQuoteChart";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, StarIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { AttentionCard } from "@/components/AttentionCard";
import { CandleChart } from "@/components/CandleChart";
import { Countdown } from "@/components/Countdown";
import { OpenOrdersCard } from "@/components/OpenOrdersCard";
import { OrderBookCard } from "@/components/OrderBookCard";
import { OrderTicket } from "@/components/OrderTicket";
import { PositionCard } from "@/components/PositionCard";
import { TradeHeader } from "@/components/TradeHeader";
import { fmt, fmtPct, getMemeMeta, getWatchlist, pingView, setStar, useBook, useCandles, useMarkets, useMe } from "@/lib/market";

export function MemeView({ memeId }: { memeId: string }) {
  const { rows, dank } = useMarkets();
  const candles = useCandles(memeId);
  const book = useBook(memeId);
  const { me, setMe, status } = useMe();
  const [showOrders, setShowOrders] = useState(false);
  const [picked, setPicked] = useState<{ price: number } | null>(null);
  const [meta, setMeta] = useState<{ description: string; links: string[]; videos: string[] } | null>(null);
  const [starred, setStarred] = useState<boolean | null>(null);
  useEffect(() => {
    getMemeMeta(memeId).then(setMeta).catch(() => {});
    getWatchlist()
      .then((w) => setStarred(w.includes(memeId)))
      .catch(() => setStarred(null));
    void pingView(memeId); // in-game attention: page views feed this meme's fair value
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
              The auction clears in <Countdown to={meme.opensAt} />. Submit a limit to participate. The price matches the most shares across eligible bids and asks.
            </p>
          </div>
        )}
        <div className="mx-auto grid max-w-5xl gap-6 px-4 pt-6 md:grid-cols-[1.45fr_1fr]">
          <section className="space-y-6">
            <div className="paper -rotate-[0.3deg] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <h1 className="font-display text-4xl leading-tight sm:text-5xl">{meme?.name ?? "…"}</h1>
                {starred !== null && (
                  <button
                    type="button"
                    aria-pressed={starred}
                    aria-label={starred ? "Remove from your watchlist" : "Add to your watchlist"}
                    onClick={() => setStar(memeId, !starred).then((w) => setStarred(w.includes(memeId))).catch(() => {})}
                    className={`btn-candy is-small px-3 ${starred ? "" : "is-muted"}`}
                  >
                    <StarIcon weight={starred ? "fill" : "bold"} className="size-6" aria-hidden="true" />
                  </button>
                )}
              </div>
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
                <p className="text-5xl font-black tabular-nums">{meme ? fmt(meme.mid) : "--"}</p>
                <p className={`flex items-center gap-1 text-xl font-black ${up ? "text-mint" : "text-berry"}`}>
                  <Trend weight="bold" aria-hidden="true" />
                  {fmtPct(meme?.change24h ?? 0)}
                  <span className="text-sm font-bold text-ink-soft">24h</span>
                </p>
              </div>
              <p className="text-sm font-bold text-ink-soft">
                Live midpoint
                {meme && ` · Bid ${fmt(meme.bid)} · Ask ${fmt(meme.ask)}`}
              </p>
              {dank && meme && <>
                <LiveQuoteChart key={memeId} time={dank.time} price={meme.mid}
                  levels={showOrders ? [{ label: "Bid", price: meme.bid }, { label: "Ask", price: meme.ask },
                    ...(me?.orders ?? []).filter(o => o.memeId === memeId && o.kind === "limit").map(o => ({label: "My limit", price: o.price}))].filter(l => l.price > 0) : []}
                  fills={showOrders ? (me?.receipts ?? []).filter(r => r.memeId === memeId).flatMap(r => r.fills.filter(f => f.time > dank.time - 60000).map(f => ({ time: f.time, price: f.cost / f.qty }))) : []}/>
                <label className="text-sm font-bold"><input type="checkbox" checked={showOrders} onChange={e => setShowOrders(e.target.checked)} /> Show bid, ask and my orders</label>
              </>}
              <CandleChart candles={candles} fair={meme?.fair} className="mt-4 min-h-48" />
              <p className="mt-1 text-xs font-bold text-ink-soft">The chart follows the mid price between the best bid and ask, one candle per minute.</p>
            </div>
            {meta?.videos.length ? (
              <div className="paper p-5">
                <h2 className="font-display text-2xl">Watch it</h2>
                <div className="mt-3 grid gap-3">
                  {meta.videos.slice(0, 2).map((v) => (
                    <iframe
                      key={v}
                      className="aspect-video w-full rounded-xl border-[3px] border-ink"
                      src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}`}
                      title={`${meme?.name ?? "Meme"} on YouTube`}
                      loading="lazy"
                      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs font-bold text-ink-soft">
                  Videos play from YouTube under the{" "}
                  <a className="underline" href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
                    YouTube Terms of Service
                  </a>{" "}
                  and{" "}
                  <a className="underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
                    Google Privacy Policy
                  </a>
                  .
                </p>
              </div>
            ) : null}
            <AttentionCard memeId={memeId} fair={meme?.fair} />
            <OrderBookCard book={book} onPick={(price) => setPicked({ price })} />
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
                onPlaced={setMe}
              />
            </div>
            {me && <OpenOrdersCard me={me} memeId={memeId} onChange={setMe} />}
            {me && <PositionCard me={me} memeId={memeId} />}
            {me && <section className="paper p-5">
              <h2 className="font-display text-2xl">Order receipts</h2>
              {(me.receipts ?? []).filter(r => r.memeId === memeId).map(r => {
                const qty = r.fills.reduce((n, f) => n + f.qty, 0);
                const cost = r.fills.reduce((n, f) => n + f.cost, 0);
                const fee = r.fills.reduce((n, f) => n + f.fee, 0);
                return <details key={r.id} className="border-b border-ink/15 py-2 text-sm">
                  <summary className="cursor-pointer font-bold">{r.side} {qty}/{r.qty} · {qty === r.qty ? "filled" : r.status === "open" && qty ? "partially filled" : r.status} · #{r.id}</summary>
                  <p>{qty ? `Average ${fmt(cost / qty)} · Fee ${fmt(fee)} · Total ${fmt(cost + (r.side === "buy" ? fee : -fee))}` : "No executions"}</p>
                  {r.fills.map((f,i) => <p key={i}>{new Date(f.time).toLocaleTimeString()} · {f.qty} at {fmt(f.cost / f.qty)}</p>)}
                </details>;
              })}
            </section>}
          </aside>
        </div>
      </main>
    </>
  );
}
