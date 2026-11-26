"use client";

import { useState } from "react";
import type { Candle } from "@/lib/market";
import { fmt, fmtInt } from "@/lib/market";

const W = 640;
const H = 260;
const PAD = { l: 8, r: 56, t: 12, b: 22 };

/**
 * Candy-striped 1-minute candlesticks of the mid price. Tap or hover a candle to read its numbers.
 * Up candles are green-striped, down candles red-striped; the readout states it in words too.
 */
export function CandleChart({ candles, fair, className = "" }: { candles: Candle[]; fair?: number; className?: string }) {
  const [minutes, setMinutes] = useState(30);
  const [pick, setPick] = useState<number | null>(null);
  if (candles.length < 2)
    return (
      <div className={`grid place-items-center text-center font-bold text-ink-soft ${className}`}>
        The chart fills in as the minutes tick by.
      </div>
    );

  const data = candles.slice(-minutes);
  const low = Math.min(...data.map((c) => c.low));
  const high = Math.max(...data.map((c) => c.high));
  const padding = Math.max((high - low) * 0.05, 0.01);
  const lo = Math.max(0, low - padding);
  const hi = high + padding;
  const span = hi - lo;
  const near = fair !== undefined && fair >= lo && fair <= hi;
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);
  const step = (W - PAD.l - PAD.r) / data.length;
  const bodyW = Math.max(2, step * 0.62);
  const ticks = [lo, lo + span / 2, hi];
  const shown = data[Math.min(pick ?? data.length - 1, data.length - 1)];
  const up = shown.close >= shown.open;

  return (
    <figure className={className}>
      <div className="mb-2 flex items-center gap-2 text-sm font-bold">
        <span>Candle range</span>
        {[30, 90].map((n) => <button key={n} type="button" aria-pressed={minutes === n}
          className="min-h-9 rounded-lg border-2 border-ink px-3 aria-pressed:bg-paper-shade"
          onClick={() => { setMinutes(n); setPick(null); }}>{n} min</button>)}
      </div>
      <figcaption className="mb-1 flex flex-wrap gap-x-3 text-sm font-bold text-ink-soft" aria-live="polite">
        <span>{new Date(shown.minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
        <span>O {fmt(shown.open)}</span>
        <span>H {fmt(shown.high)}</span>
        <span>L {fmt(shown.low)}</span>
        <span>C {fmt(shown.close)}</span>
        <span className={up ? "text-mint" : "text-berry"}>{up ? "up" : "down"}</span>
        {!near && fair !== undefined && <span className="text-ink-soft">Fair value {fmt(fair)}</span>}
        {shown.volume > 0 && <span>Vol {fmtInt(shown.volume)}</span>}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`Price chart, last ${data.length} minutes, from ${fmt(data[0].open)} to ${fmt(data.at(-1)!.close)}`}
        onPointerLeave={() => setPick(null)}
      >
        <defs>
          <pattern id="cc-up" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="8" height="8" fill="#1d8a4a" />
            <rect width="3.5" height="8" fill="#fffaf0" />
          </pattern>
          <pattern id="cc-down" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="8" height="8" fill="#d8342c" />
            <rect width="3.5" height="8" fill="#fffaf0" />
          </pattern>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#59c3e8" strokeOpacity=".35" strokeWidth="1.5" />
            <text x={W - PAD.r + 6} y={y(v) + 4} fontSize="12" fontWeight="700" fill="#5c3d22">
              {fmt(v)}
            </text>
          </g>
        ))}
        {near && fair !== undefined && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(fair)} y2={y(fair)} stroke="#ff7a2f" strokeWidth="2.5" strokeDasharray="3 7" strokeLinecap="round" />
            <text x={PAD.l + 4} y={y(fair) < 28 ? y(fair) + 16 : y(fair) - 6} fontSize="12" fontWeight="800" fill="#d9561a">
              fair value {fmt(fair)}
            </text>
          </g>
        )}
        {data.map((c, i) => {
          const x = PAD.l + i * step + step / 2;
          const isUp = c.close >= c.open;
          const top = y(Math.max(c.open, c.close));
          const h = Math.max(2, Math.abs(y(c.open) - y(c.close)));
          return (
            <g key={c.minute} onPointerEnter={() => setPick(i)} onPointerDown={() => setPick(i)}>
              <rect x={x - step / 2} y={0} width={step} height={H} fill="transparent" />
              <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke="#3a2412" strokeWidth="1.8" strokeLinecap="round" />
              <rect
                x={x - bodyW / 2}
                y={top}
                width={bodyW}
                height={h}
                rx={Math.min(3, bodyW / 3)}
                fill={`url(#cc-${isUp ? "up" : "down"})`}
                stroke="#3a2412"
                strokeWidth={pick === i ? 2.6 : 1.6}
              />
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
