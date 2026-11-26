import "./index.css";
import { requestExpandedMode } from "@devvit/web/client";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { FireIcon, TimerIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { Logo } from "@/components/Logo";
import type { Day } from "@/lib/market";

// Kept local so the feed card doesn't load the game's API layer (realtime, hooks).
const fmt = (n: number, digits = 2) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const getDay = (): Promise<Day> => fetch("/api/day").then((r) => r.json());
import { left, useNow } from "./time.ts";

/** The in-feed card: what today's round is, who's winning, and one button in. */
function Splash() {
  const [day, setDay] = useState<Day | null>(null);
  const now = useNow();
  useEffect(() => {
    getDay().then(setDay).catch(() => {});
  }, []);
  const movers = day?.movers ?? [];
  const me = day?.me;
  const leader = day?.leaders[0];
  return (
    <main className="cardboard flex h-screen flex-col items-center justify-between gap-3 overflow-hidden p-4 text-center">
      <Logo className="w-48" />
      <section className="paper w-full max-w-md p-4">
        <p className="font-display text-3xl leading-none">Market Day #{day?.day ?? "…"}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-sm font-black">
          <TimerIcon weight="fill" aria-hidden="true" /> {day ? `${left(day.endsAt, now)} left · ${day.players} trading` : "opening the market"}
        </p>
        {day?.listing && <p className="sticker mx-auto mt-2 w-fit px-3 text-sm font-black">New today: {day.listing.name}</p>}
        <ul className="mt-3 space-y-1 text-left">
          {movers.map((m) => (
            <li key={m.memeId} className="flex items-center justify-between font-bold">
              <span className="truncate">{m.name}</span>
              <span className={`inline-flex items-center gap-1 font-black ${m.change24h >= 0 ? "text-mint" : "text-berry"}`}>
                {m.change24h >= 0 ? <TrendUpIcon weight="bold" aria-hidden="true" /> : <TrendDownIcon weight="bold" aria-hidden="true" />}
                {fmt(m.mid)} · {fmtPct(m.change24h)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm font-bold text-ink-soft">
          {me?.played
            ? `You're #${me.rank} at ${fmtPct(me.returnPct ?? 0)}`
            : leader
              ? `u/${leader.user} leads at ${fmtPct(leader.returnPct)}`
              : `Everyone starts with ${fmt(day?.startingCash ?? 100_000, 0)} play coins`}
          {!!me?.streak && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-candy">
              <FireIcon weight="fill" aria-hidden="true" /> {me.streak}
            </span>
          )}
        </p>
      </section>
      <button type="button" className="btn-candy is-buy w-full max-w-md text-xl" onClick={(e) => requestExpandedMode(e.nativeEvent, "game")}>
        {me?.played ? "Back to the floor" : "Start trading"}
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Splash />
  </StrictMode>,
);
