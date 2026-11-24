"use client";

import Link from "next/link";
import {
  CaretRightIcon,
  TrendDownIcon,
  TrendUpIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Sparkline } from "@/components/Sparkline";
import { TradeHeader } from "@/components/TradeHeader";
import { fmt, fmtInt, fmtPct, useMarkets, useMe } from "@/lib/market";

export default function Markets() {
  const { list, error } = useMarkets();
  const { me, status } = useMe();
  const rows = list?.toSorted((a, b) => b.change24h - a.change24h);

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

          <div className="paper ledger mt-6 -rotate-[0.3deg] overflow-hidden p-0">
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
              {rows?.map((m) => {
                const up = m.change24h >= 0;
                const Trend = up ? TrendUpIcon : TrendDownIcon;
                const held = me?.shares[m.memeId] ?? 0;
                const ltp = m.ltp ?? m.mid;
                return (
                  <li key={m.memeId}>
                    <Link
                      href={`/m/${m.memeId}`}
                      className="group grid min-h-[4.5rem] grid-cols-[1fr_3.5rem_auto_auto] items-center gap-2 pr-3 pl-12 transition-colors hover:bg-[#fff3d6] sm:grid-cols-[1fr_7rem_6.5rem_6rem_1.5rem] sm:gap-3 sm:pl-14"
                    >
                      <span className="min-w-0">
                        <span className="font-display block text-lg leading-tight [overflow-wrap:anywhere] sm:text-2xl">
                          {m.name}
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
                        title={
                          m.ltp === null
                            ? "No trades yet: showing the house mid price"
                            : "Last traded price"
                        }
                      >
                        {fmt(ltp)}
                        {m.ltp === null && (
                          <span className="block text-[10px] font-bold text-ink-soft">
                            no trades yet
                          </span>
                        )}
                      </span>
                      <span
                        className={`flex items-center justify-end gap-1 font-black tabular-nums ${up ? "text-mint" : "text-berry"}`}
                      >
                        <Trend weight="bold" aria-hidden="true" />
                        {fmtPct(m.change24h)}
                      </span>
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
