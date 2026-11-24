"use client";

import Link from "next/link";
import { CaretRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Sparkline } from "@/components/Sparkline";
import { TradeHeader } from "@/components/TradeHeader";
import { fmt, useMarket, useMe } from "@/lib/market";

export default function Markets() {
  const { memes, error, history } = useMarket();
  const { me, status } = useMe();

  return (
    <>
      <TradeHeader me={me} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="outline-text font-display text-5xl">Markets</h1>
        {status === "signed-out" && (
          <p className="paper mt-4 p-4 font-bold">
            You&apos;re browsing. <Link href="/dev-login" className="underline decoration-2">Sign in</Link> to trade.
          </p>
        )}
        {error && (
          <p role="alert" className="paper mt-4 flex items-center gap-2 p-4 font-bold text-berry">
            <WarningCircleIcon weight="fill" className="size-6" aria-hidden="true" /> {error}
          </p>
        )}
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {memes === null &&
            [0, 1, 2].map((i) => <li key={i} className="paper h-36 animate-pulse opacity-70" aria-hidden="true" />)}
          {memes?.map((m, i) => {
            const pts = history.get(m.memeId) ?? [];
            const held = me?.shares[m.memeId] ?? 0;
            return (
              <li key={m.memeId} className={i % 2 ? "rotate-[0.6deg]" : "-rotate-[0.5deg]"}>
                <Link
                  href={`/m/${m.memeId}`}
                  className="paper group block p-5 transition-transform duration-150 hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-2xl leading-tight">{m.name}</h2>
                    <CaretRightIcon weight="bold" className="mt-1 size-6 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </div>
                  <p className="mt-1 text-3xl font-black">{fmt(m.price)}</p>
                  <Sparkline points={pts} className="mt-2 h-10 w-full" />
                  <p className="mt-2 text-sm font-bold text-ink-soft">
                    {held > 0 ? `You hold ${held.toLocaleString("en-IN")}` : `Bid ${fmt(m.bid)} · Ask ${fmt(m.ask)}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
