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
export function CandleChart({ candles, className = "" }: { candles: Candle[]; className?: string }) {
  const [pick, setPick] = useState<number | null>(null);
  if (candles.length < 2)
    return (
      <div className={`grid place-items-center text-center font-bold text-ink-soft ${className}`}>
        The chart fills in as the minutes tick by.
      </div>
    );

  const data = candles.slice(-90);
  const lo = Math.min(...data.map((c) => c.low));
  const hi = Math.max(...data.map((c) => c.high));
  const span = hi - lo || hi * 0.01 || 1;
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);
  const step = (W - PAD.l - PAD.r) / data.length;
  const bodyW = Math.max(2, step * 0.62);
  const ticks = [lo, lo + span / 2, hi];
  const shown = data[pick ?? data.length - 1];
  const up = shown.close >= shown.open;

  return (
    <figure className={className}>
      <figcaption className="mb-1 flex flex-wrap gap-x-3 text-sm font-bold text-ink-soft" aria-live="polite">
        <span>{new Date(shown.minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
        <span>O {fmt(shown.open)}</span>
        <span>H {fmt(shown.high)}</span>
        <span>L {fmt(shown.low)}</span>
        <span>C {fmt(shown.close)}</span>
        <span className={up ? "text-mint" : "text-berry"}>{up ? "up" : "down"}</span>
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
