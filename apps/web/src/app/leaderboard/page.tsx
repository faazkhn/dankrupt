"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, CrownIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { TradeHeader } from "@/components/TradeHeader";
import { getLeaderboard, useMe, type BoardRow } from "@/lib/market";

const WINDOWS = [
  ["daily", "Today"],
  ["weekly", "This week"],
  ["alltime", "All time"],
] as const;
const STYLES = [
  [null, "Everyone"],
  ["scalper", "Scalpers"],
  ["swing", "Swing"],
  ["trend", "Trend-spotters"],
] as const;
const STYLE_LABEL = { scalper: "Scalper", swing: "Swing", trend: "Trend-spotter" };

export default function LeaderboardPage() {
  const { me } = useMe();
  const [win, setWin] = useState<(typeof WINDOWS)[number][0]>("daily");
  const [style, setStyle] = useState<(typeof STYLES)[number][0]>(null);
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      getLeaderboard(win, style)
        .then((r) => live && (setRows(r), setError(null)))
        .catch((e: Error) => live && setError(e.message));
    const first = setTimeout(load, 0);
    const id = setInterval(load, 60_000);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [win, style]);

  const mine = rows?.find((r) => r.accountId === me?.accountId);
  return (
    <>
      <TradeHeader me={me} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-16">
        <Link href="/trade" className="btn-candy is-secondary is-small px-5">
          <ArrowLeftIcon weight="bold" className="size-6" aria-hidden="true" /> Markets
        </Link>
        <h1 className="outline-text font-display mt-6 text-5xl sm:text-6xl">Leaderboards</h1>
        <p className="font-display mt-2 text-lg text-paper [text-shadow:0_2px_0_var(--ink)]">
          Ranked by time-weighted return. Resets don&apos;t help. 5 closed trades to qualify.
        </p>

        <div role="tablist" aria-label="Time window" className="mt-5 flex flex-wrap gap-3">
          {WINDOWS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={win === k} onClick={() => setWin(k)} className={`btn-candy is-small px-4 ${win === k ? "" : "is-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        <div role="tablist" aria-label="Trading style" className="mt-3 flex flex-wrap gap-2">
          {STYLES.map(([k, label]) => (
            <button
              key={label}
              role="tab"
              aria-selected={style === k}
              onClick={() => setStyle(k)}
              className={`btn-candy is-small px-3 text-base ${style === k ? "is-secondary" : "is-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {mine && (
          <p className="sticker mt-5 inline-flex px-4 py-1.5 font-black">
            You&apos;re #{mine.rank} with {(mine.twr * 100).toFixed(2)}%
          </p>
        )}

        <div className="paper ledger mt-5 overflow-hidden p-0">
          <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 border-b-[3px] border-ink bg-paper-shade py-2 pr-4 pl-3 text-sm font-black tracking-wide text-ink-soft uppercase sm:grid-cols-[3rem_1fr_8rem_6rem]">
            <span>#</span>
            <span>Player</span>
            <span className="hidden sm:block">Style</span>
            <span className="text-right">Return</span>
          </div>
          {error && <p className="p-5 font-bold text-berry">{error}</p>}
          {rows === null && !error && <p className="p-5 font-bold text-ink-soft">Counting the coins…</p>}
          {rows?.length === 0 && (
            <p className="p-5 font-bold text-ink-soft">Nobody has 5 closed trades in this window yet. Five round trips and you&apos;re on the board.</p>
          )}
          <ol>
            {rows?.map((r) => {
              const up = r.twr >= 0;
              const Trend = up ? TrendUpIcon : TrendDownIcon;
              return (
                <li
                  key={r.accountId}
                  className={`grid min-h-[4.5rem] grid-cols-[3rem_1fr_auto] items-center gap-3 pr-4 pl-3 sm:grid-cols-[3rem_1fr_8rem_6rem] ${r.accountId === me?.accountId ? "bg-[#fff3d6]" : ""}`}
                >
                  <span className="font-display flex items-center text-2xl">
                    {r.rank === 1 ? <CrownIcon weight="fill" className="size-7 text-[#e0a800]" aria-label="1" /> : r.rank}
                  </span>
                  <span className="min-w-0">
                    <span className="font-display block truncate text-xl">@{r.accountId}</span>
                    <span className="block text-xs font-bold text-ink-soft">
                      {r.trades} trades{r.resets ? ` · ${r.resets} reset${r.resets > 1 ? "s" : ""}` : ""}
                      <span className="sm:hidden"> · {STYLE_LABEL[r.style]}</span>
                    </span>
                  </span>
                  <span className="hidden font-bold sm:block">{STYLE_LABEL[r.style]}</span>
                  <span className={`flex items-center justify-end gap-1 text-lg font-black tabular-nums ${up ? "text-mint" : "text-berry"}`}>
                    <Trend weight="bold" aria-hidden="true" />
                    {up ? "+" : ""}
                    {(r.twr * 100).toFixed(2)}%
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </main>
    </>
  );
}
