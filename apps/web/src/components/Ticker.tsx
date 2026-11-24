"use client";

import { useState } from "react";
import { PauseIcon, PlayIcon, TrendUpIcon, TrendDownIcon } from "@phosphor-icons/react";

// Sample prices for the landing page only; not market data.
const SAMPLE = [
  { t: "$STONKS", p: 412.07, d: 18.4 },
  { t: "$BRAINROT", p: 96.5, d: -7.2 },
  { t: "$NPC", p: 131.22, d: 3.1 },
  { t: "$RIZZ", p: 288.9, d: 41.6 },
  { t: "$COPE", p: 12.03, d: -22.8 },
  { t: "$GIGA", p: 157.4, d: 5.9 },
  { t: "$TOUCHGRASS", p: 1.04, d: -0.6 },
  { t: "$AURA", p: 233.15, d: 12.2 },
];

export function Ticker() {
  const [paused, setPaused] = useState(false);
  const items = [...SAMPLE, ...SAMPLE];
  return (
    <div className="relative flex items-center gap-2 border-y-[3px] border-ink bg-paper">
      <div className="overflow-hidden py-2" aria-hidden="true">
        <div className="ticker-track flex w-max gap-8 pr-8" data-paused={paused}>
          {items.map((s, i) => {
            const up = s.d >= 0;
            const Icon = up ? TrendUpIcon : TrendDownIcon;
            return (
              <span key={i} className="flex items-center gap-2 whitespace-nowrap font-bold">
                <span className="font-display text-lg">{s.t}</span>
                <span>{s.p.toFixed(2)}</span>
                <span className={`flex items-center gap-1 ${up ? "text-mint" : "text-berry"}`}>
                  <Icon weight="bold" aria-hidden="true" />
                  {up ? "+" : ""}
                  {s.d.toFixed(1)}%
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <p className="sr-only">Sample meme prices, for illustration only.</p>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Play the ticker" : "Pause the ticker"}
        className="absolute right-1 grid size-11 cursor-pointer place-items-center rounded-full border-[3px] border-ink bg-[var(--tape)] shadow-[0_3px_0_var(--ink)]"
      >
        {paused ? <PlayIcon weight="fill" aria-hidden="true" /> : <PauseIcon weight="fill" aria-hidden="true" />}
      </button>
    </div>
  );
}
