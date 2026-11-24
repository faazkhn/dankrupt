"use client";

import { FlameIcon, TrendDownIcon, TrendUpIcon, WarningIcon } from "@phosphor-icons/react";
import { fmt, fmtInt, useAttention } from "@/lib/market";

/** What the internet is paying attention to: daily Wikipedia views, heat and the fair value they imply. */
export function AttentionCard({ memeId, fair }: { memeId: string; fair: number | undefined }) {
  const a = useAttention(memeId);
  const days = a?.wikipediaDaily ?? [];
  const max = Math.max(1, ...days.map((d) => d.views));
  const heat = a?.heat ?? null;
  const rising = (a?.momentum ?? 0) >= 0;
  const Trend = rising ? TrendUpIcon : TrendDownIcon;
  return (
    <div className="paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-display text-2xl">Attention</h2>
        {a?.delayed && (
          <span className="sticker flex items-center gap-1 px-2.5 py-0.5 text-sm font-black">
            <WarningIcon weight="fill" aria-hidden="true" /> Data delayed
          </span>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border-2 border-ink/20 bg-paper-shade/60 p-2">
          <dt className="text-xs font-black tracking-wide text-ink-soft uppercase">Heat</dt>
          <dd className="flex items-center justify-center gap-1 text-xl font-black">
            <FlameIcon weight="fill" className={heat !== null && heat > 1.5 ? "text-candy" : "text-ink-soft"} aria-hidden="true" />
            {heat === null ? "–" : heat.toFixed(2)}
          </dd>
        </div>
        <div className="rounded-xl border-2 border-ink/20 bg-paper-shade/60 p-2">
          <dt className="text-xs font-black tracking-wide text-ink-soft uppercase">Momentum</dt>
          <dd className={`flex items-center justify-center gap-1 text-xl font-black ${rising ? "text-mint" : "text-berry"}`}>
            <Trend weight="bold" aria-hidden="true" /> {rising ? "Rising" : "Fading"}
          </dd>
        </div>
        <div className="rounded-xl border-2 border-ink/20 bg-paper-shade/60 p-2">
          <dt className="text-xs font-black tracking-wide text-ink-soft uppercase">Fair value</dt>
          <dd className="text-xl font-black tabular-nums">{fair === undefined ? "–" : fmt(fair)}</dd>
        </div>
      </dl>
      <figure className="mt-4">
        <figcaption className="text-sm font-bold text-ink-soft">Wikipedia views per day, last {days.length} days</figcaption>
        {days.length ? (
          <div className="mt-2 flex h-24 items-end gap-[3px]" role="img" aria-label={`Wikipedia views per day; latest ${fmtInt(days.at(-1)!.views)}`}>
            {days.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${fmtInt(d.views)} views`}
                className="flex-1 rounded-t-sm border-2 border-b-0 border-ink bg-sky"
                style={{ height: `${Math.max(4, (d.views / max) * 100)}%` }}
              />
            ))}
          </div>
        ) : (
          <p className="mt-2 font-bold text-ink-soft">Loading the attention data…</p>
        )}
      </figure>
      <p className="mt-3 text-sm font-bold text-ink-soft">
        Fair value is what attention says this meme is worth. The house price drifts toward it, half the gap every 6 hours, while trades push it around.
      </p>
    </div>
  );
}
