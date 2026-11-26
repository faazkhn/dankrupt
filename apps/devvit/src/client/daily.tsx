import { context, navigateTo } from "@devvit/web/client";
import { useEffect, useState } from "react";
import { CalendarCheckIcon, CrownIcon, FireIcon, TimerIcon, TrophyIcon, XIcon } from "@phosphor-icons/react";
import { TradeHeader } from "@/components/TradeHeader";
import { fmt, fmtPct, markResultSeen, useMe, type Day, type DayResult } from "@/lib/market";
import { navigate } from "./router.ts";
import { left, useNow } from "./time.ts";

const tone = (pct: number | null) => (pct === null ? "" : pct >= 0 ? "text-mint" : "text-berry");
const threadUrl = () => (context.postId ? `https://www.reddit.com/comments/${context.postId.replace(/^t3_/, "")}` : "https://www.reddit.com");

/** Always-visible round strip: time left, your return and rank, your streak. Tapping opens the boards. */
export function DailyBar({ day }: { day: Day | null }) {
  const now = useNow();
  if (!day) return null;
  const me = day.me;
  return (
    <button
      type="button"
      onClick={() => navigate("/leaderboard")}
      className="cardboard is-dark fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t-[3px] border-ink px-4 py-2 text-left text-paper"
      aria-label="Today's round: open the standings"
    >
      <span className="font-display text-lg leading-tight">
        Day {day.day}
        <span className="ml-2 inline-flex items-center gap-1 font-sans text-sm font-black">
          <TimerIcon weight="fill" aria-hidden="true" /> {left(day.endsAt, now)} left
        </span>
      </span>
      <span className="flex items-center gap-3 text-sm font-black">
        {me?.played ? (
          <>
            <span className={`sticker px-2 ${tone(me.returnPct)}`}>{fmtPct(me.returnPct ?? 0)}</span>
            <span>#{me.rank} of {day.players}</span>
          </>
        ) : (
          <span>{day.players} trading today</span>
        )}
        {!!me?.streak && (
          <span className="inline-flex items-center gap-0.5 text-candy">
            <FireIcon weight="fill" aria-hidden="true" /> {me.streak}
          </span>
        )}
      </span>
    </button>
  );
}

/** First visit: one card, then straight into the market. */
export function Welcome({ day, onClose }: { day: Day; onClose: () => void }) {
  return (
    <Modal onClose={onClose} label="How today's round works">
      <p className="font-display text-3xl">Market Day #{day.day}</p>
      <p className="mt-2 text-lg font-bold">
        You get <b>{fmt(day.startingCash, 0)}</b> play coins. Buy memes you think are about to blow up, short the ones going stale.
      </p>
      <p className="mt-2 font-bold text-ink-soft">Prices follow real internet attention. Best return when the round closes at 00:00 UTC takes the day, and a flair.</p>
      {day.listing && (
        <p className="sticker mt-3 inline-block px-3 py-1 font-black">
          Today's listing: {day.listing.name}
          {day.listing.status === "preopen" ? " · opening auction" : ""}
        </p>
      )}
      <button type="button" className="btn-candy is-buy mt-5 w-full" onClick={onClose}>
        Start trading
      </button>
    </Modal>
  );
}

/** Yesterday's result, once: rank, return, streak, and a next step. */
export function ResultCard({ day, onClose }: { day: Day; onClose: () => void }) {
  const r = day.yesterday.mine!;
  const close = () => {
    void markResultSeen().catch(() => {});
    onClose();
  };
  return (
    <Modal onClose={close} label={`Day ${day.yesterday.day} result`}>
      <p className="font-display text-2xl">Day {day.yesterday.day} closed</p>
      <p className="font-display mt-1 text-6xl">#{r.rank}</p>
      <p className="font-bold">of {day.yesterday.players} traders</p>
      <p className={`mt-3 text-4xl font-black ${tone(r.returnPct)}`}>{fmtPct(r.returnPct)}</p>
      <p className="font-bold text-ink-soft">{fmt(r.equity, 0)} coins at the close</p>
      {!!day.me?.streak && (
        <p className="mt-3 inline-flex items-center gap-1 font-black text-candy">
          <FireIcon weight="fill" aria-hidden="true" /> {day.me.streak}-day streak
        </p>
      )}
      <div className="mt-5 grid gap-2">
        <button type="button" className="btn-candy is-buy w-full" onClick={close}>
          Play Day {day.day}
        </button>
        <button type="button" className="btn-candy is-secondary w-full" onClick={() => navigateTo(threadUrl())}>
          Tell the thread your call
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="paper pop-in relative w-full max-w-sm p-6 text-center">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 p-1" aria-label="Close">
          <XIcon weight="bold" className="size-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

/** Standings: today live, yesterday final, and your record. */
export function Board({ day }: { day: Day | null }) {
  const { me } = useMe();
  const [tab, setTab] = useState<"today" | "yesterday">("today");
  const rows: DayResult[] = tab === "today" ? day?.leaders ?? [] : day?.yesterday.podium ?? [];
  const [full, setFull] = useState<DayResult[] | null>(null);
  useEffect(() => {
    setFull(null);
    fetch(`/api/leaderboard?window=${tab === "today" ? "daily" : "yesterday"}`)
      .then((r) => r.json())
      .then((xs: { rank: number; accountId: string; twr: number }[]) => setFull(xs.map((x) => ({ rank: x.rank, user: x.accountId, returnPct: x.twr * 100, equity: 0 }))))
      .catch(() => {});
  }, [tab, day?.players]);
  const list = full ?? rows;
  const s = day?.me;
  return (
    <>
      <TradeHeader me={me} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 pt-6 pb-24">
        <h1 className="outline-text font-display text-5xl">Standings</h1>
        {s && (
          <section className="paper grid grid-cols-4 gap-2 p-4 text-center">
            <Stat icon={<FireIcon weight="fill" />} label="Streak" value={s.streak} />
            <Stat icon={<CrownIcon weight="fill" />} label="Best" value={s.bestStreak} />
            <Stat icon={<CalendarCheckIcon weight="fill" />} label="Days" value={s.days} />
            <Stat icon={<TrophyIcon weight="fill" />} label="Wins" value={s.wins} />
          </section>
        )}
        <div className="flex gap-2" role="tablist">
          {(day && day.yesterday.day >= 1 ? (["today", "yesterday"] as const) : (["today"] as const)).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`btn-candy is-small px-4 ${tab === t ? "" : "is-secondary"}`}>
              {t === "today" ? `Day ${day?.day ?? ""} · live` : `Day ${day?.yesterday.day ?? ""} · final`}
            </button>
          ))}
        </div>
        <section className="paper p-4">
          {list.length === 0 ? (
            <p className="font-bold text-ink-soft">{tab === "today" ? "Nobody has traded yet today. First order puts you on the board." : "No round closed yesterday."}</p>
          ) : (
            <ol className="divide-y-2 divide-dashed divide-ink/20">
              {list.map((r) => (
                <li key={r.user} className={`flex min-h-12 items-center justify-between gap-3 py-2 font-bold ${r.user === s?.user ? "bg-[#fff3d6]" : ""}`}>
                  <span className="flex items-center gap-3">
                    <span className="font-display w-10 text-2xl">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : `#${r.rank}`}</span>u/{r.user}
                  </span>
                  <span className={`font-black ${tone(r.returnPct)}`}>{fmtPct(r.returnPct)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <button type="button" className="btn-candy is-secondary w-full" onClick={() => navigateTo(threadUrl())}>
          Talk tactics in the thread
        </button>
      </main>
    </>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div>
      <p className="flex justify-center text-2xl text-candy" aria-hidden="true">{icon}</p>
      <p className="font-display text-2xl">{value}</p>
      <p className="text-xs font-black uppercase">{label}</p>
    </div>
  );
}
