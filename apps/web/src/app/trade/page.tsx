"use client";

import { LiveQuoteChart } from "@/components/LiveQuoteChart";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CaretRightIcon,
  FlameIcon,
  TrendDownIcon,
  TrendUpIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Countdown } from "@/components/Countdown";
import { Sparkline } from "@/components/Sparkline";
import { TradeHeader } from "@/components/TradeHeader";
import { fmt, fmtInt, fmtPct, getWatchlist, useMarkets, useMe } from "@/lib/market";

export default function Markets() {
  const { list, error, dank } = useMarkets();
  const { me, status } = useMe();
  const [sort, setSort] = useState<"trending" | "movers" | "watchlist" | "graveyard">("trending");
  const [watched, setWatched] = useState<string[]>([]);
  useEffect(() => {
    getWatchlist().then(setWatched).catch(() => {});
  }, []);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);
  const comeback = (m: { comebackAt: number | null }) => now > 0 && m.comebackAt !== null && now - m.comebackAt < 86_400_000;
  const rows = list
    ?.filter((m) =>
      sort === "graveyard"
        ? m.status === "dormant"
        : sort === "watchlist"
          ? watched.includes(m.memeId) && m.status !== "halted"
          : m.status !== "dormant" && m.status !== "halted",
    )
    .toSorted((a, b) =>
      sort === "movers"
        ? Math.abs(b.change24h) - Math.abs(a.change24h)
        : Number(comeback(b)) - Number(comeback(a)) || b.heat - a.heat, // comebacks get pushed to the top of trending
    );

  return (
    <>
      <TradeHeader me={me} />
      <main className="flex-1 pt-8 pb-16">
        <div className="mx-auto max-w-4xl px-3 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="outline-text font-display text-5xl sm:text-6xl">
              Markets
            </h1>
            <p className="sticker font-display px-3 py-1 text-base">
              Live · {list?.length ?? "–"} memes trading
            </p>
          </div>

          {dank && <section className="paper mt-5 p-5">
            <h2 className="font-display text-2xl">Dank Index</h2>
            <p className="text-sm font-bold">Equal-weighted · {list?.filter(m => m.status === "active").length ?? 0} active memes</p>
            <p className="text-4xl font-black tabular-nums">{fmt(dank.level)} <span className="text-sm">points</span></p>
            <LiveQuoteChart dankHistory time={dank.time} price={dank.level} />
          </section>}

          {status === "signed-out" && (
            <p className="paper mt-4 p-4 font-bold">
              You&apos;re browsing.{" "}
              <Link href="/dev-login" className="underline decoration-2">
                Sign in
              </Link>{" "}
              to trade.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="paper mt-4 flex items-center gap-2 p-4 font-bold text-berry"
            >
              <WarningCircleIcon
                weight="fill"
                className="size-6"
                aria-hidden="true"
              />{" "}
              {error}
            </p>
          )}

          <div role="tablist" aria-label="Sort markets" className="mt-6 flex gap-3">
            {(
              [
                ["trending", "Trending"],
                ["movers", "Top movers"],
                ["watchlist", "Watchlist"],
                ["graveyard", "Graveyard"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={sort === k}
                onClick={() => setSort(k)}
                className={`btn-candy is-small px-4 ${sort === k ? "" : "is-muted"}`}
              >
                {k === "trending" && <FlameIcon weight="fill" aria-hidden="true" />} {label}
              </button>
            ))}
          </div>

          <div className="paper ledger mt-4 -rotate-[0.3deg] overflow-hidden p-0">
            <div className="grid grid-cols-[1fr_3.5rem_auto_auto] items-center gap-2 border-b-[3px] border-ink bg-paper-shade py-2 pr-3 pl-12 text-sm font-black tracking-wide text-ink-soft uppercase sm:grid-cols-[1fr_7rem_6.5rem_6rem_1.5rem] sm:gap-3 sm:pl-14">
              <span>Meme</span>
              <span className="sr-only sm:not-sr-only">24h chart</span>
              <span className="text-right">LTP</span>
              <span className="text-right">24h</span>
              <span className="hidden sm:block" />
            </div>
            <ul>
              {rows === undefined &&
                [0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="h-[4.5rem] animate-pulse border-b-2 border-dashed border-ink/15"
                    aria-hidden="true"
                  />
                ))}
              {rows?.length === 0 && (
                <li className="p-5 font-bold text-ink-soft">
                  {sort === "graveyard"
                    ? "The Graveyard is empty. Memes rest here after 7 cold days, still tradable, waiting for a comeback."
                    : sort === "watchlist"
                      ? "Nothing starred yet. Tap the star on any meme to keep it here."
                      : "No memes trading yet."}
                </li>
              )}
              {rows?.map((m) => {
                const up = m.change24h >= 0;
                const Trend = up ? TrendUpIcon : TrendDownIcon;
                const held = me?.shares[m.memeId] ?? 0;
                return (
                  <li key={m.memeId}>
                    <Link
                      href={`/m/${m.memeId}`}
                      className="group grid min-h-[4.5rem] grid-cols-[1fr_3.5rem_auto_auto] items-center gap-2 pr-3 pl-12 transition-colors hover:bg-[#fff3d6] sm:grid-cols-[1fr_7rem_6.5rem_6rem_1.5rem] sm:gap-3 sm:pl-14"
                    >
                      <span className="min-w-0">
                        <span className="font-display flex items-center gap-1.5 text-lg leading-tight [overflow-wrap:anywhere] sm:text-2xl">
                          {m.name}
                          {m.heat > 1.5 && <FlameIcon weight="fill" className="size-5 shrink-0 text-candy" aria-label="Hot right now" />}
                          {comeback(m) && <span className="sticker px-2 py-0.5 font-sans text-[11px] font-black">COMEBACK!</span>}
                          {m.status === "dormant" && <span className="rounded bg-ink/70 px-1.5 py-0.5 font-sans text-[11px] font-black text-paper">DORMANT</span>}
                        </span>
                        <span
                          className={`text-xs font-bold text-ink-soft ${held > 0 ? "block" : "hidden sm:block"}`}
                        >
                          {held > 0
                            ? `You hold ${fmtInt(held)}`
                            : `Bid ${fmt(m.bid)} · Ask ${fmt(m.ask)}`}
                        </span>
                      </span>
                      <Sparkline
                        points={m.spark}
                        up={up}
                        className="h-8 w-14 sm:h-9 sm:w-28"
                      />
                      <span
                        className="text-right text-lg font-black tabular-nums"
                        title="Live midpoint"
                      >
                        {fmt(m.mid)}

                      </span>
                      {m.status === "preopen" && m.opensAt ? (
                        <span className="sticker px-2 py-0.5 text-center text-xs font-black">
                          OPENS IN
                          <br />
                          <Countdown to={m.opensAt} />
                        </span>
                      ) : (
                        <span
                          className={`flex items-center justify-end gap-1 font-black tabular-nums ${up ? "text-mint" : "text-berry"}`}
                        >
                          <Trend weight="bold" aria-hidden="true" />
                          {fmtPct(m.change24h)}
                        </span>
                      )}
                      <CaretRightIcon
                        weight="bold"
                        className="hidden size-5 transition-transform group-hover:translate-x-1 sm:block"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}
