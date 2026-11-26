import "./index.css";
import { context, requestExpandedMode } from "@devvit/web/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { Logo } from "@/components/Logo";
import { fmt, fmtPct } from "@/lib/market";

type Card = { user: string; name: string; side: "long" | "short"; returnPct: number; avgIn: number; avgOut: number; openedAt: number; closedAt: number; day: number };

const held = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
};

/** A shared closed trade, as its own post: the call, the result, and a way in. */
function TradeCard() {
  const c = context.postData as Card | undefined;
  if (!c) return <main className="cardboard grid h-screen place-items-center font-bold">This trade card is missing its data.</main>;
  const up = c.returnPct >= 0;
  return (
    <main className="cardboard flex h-screen flex-col items-center justify-center gap-3 overflow-hidden p-4 text-center">
      <Logo className="w-36" />
      <section className="paper w-full max-w-md -rotate-[0.6deg] p-5">
        <p className="font-bold">
          u/{c.user} went <b className={c.side === "long" ? "text-mint" : "text-berry"}>{c.side.toUpperCase()}</b> · Market Day #{c.day}
        </p>
        <p className="font-display mt-1 text-3xl leading-tight">{c.name}</p>
        <p className={`font-display mt-1 inline-flex items-center gap-2 text-6xl ${up ? "text-mint" : "text-berry"}`}>
          {up ? <TrendUpIcon weight="bold" aria-hidden="true" /> : <TrendDownIcon weight="bold" aria-hidden="true" />}
          {fmtPct(c.returnPct)}
        </p>
        {!up && <p className="sticker mx-auto mt-1 w-fit px-3 font-display">LESSON LEARNED</p>}
        <p className="mt-2 text-sm font-bold text-ink-soft">
          In at {fmt(c.avgIn)} · out at {fmt(c.avgOut)} · held {held(c.closedAt - c.openedAt)}
        </p>
      </section>
      <button type="button" className="btn-candy is-buy w-full max-w-md text-xl" onClick={(e) => requestExpandedMode(e.nativeEvent, "game")}>
        Trade it yourself
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TradeCard />
  </StrictMode>,
);
