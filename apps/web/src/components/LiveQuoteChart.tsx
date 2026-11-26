"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/market";

type Point = { time: number; price: number };

/** Keep a timestamped minute of observed quotes, including gaps between updates. */
export function LiveQuoteChart({ time, price, dankHistory = false, levels = [], fills = [] }: Point & { dankHistory?: boolean; levels?: {label: string; price: number}[]; fills?: Point[] }) {
  const [points, setPoints] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [gap, setGap] = useState(0);
  useEffect(() => {
    if (!dankHistory) return;
    const controller = new AbortController();
    fetch("/api/engine/dank?history=1", { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return;
        const history: Point[] = await r.json();
        if (!Array.isArray(history) || !history.length || controller.signal.aborted) return;
        setPoints((current) => {
          const merged = new Map([...history, ...current].map((point) => [point.time, point]));
          return [...merged.values()].sort((a, b) => a.time - b.time).slice(-600);
        });
      }).catch(() => {});
    return () => controller.abort();
  }, [dankHistory, gap]);
  const last = points.at(-1);
  if (!last || time > last.time) {
    if (dankHistory && last && time - last.time >= 3000) setGap(time);
    setPoints([...points.filter((p) => p.time > time - 60_000), { time, price }]);
  }
  if (!last) return null;
  const prices = [...points, ...levels, ...fills].map(p => p.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const span = Math.max(high - low, price * 0.0003);
  const x = (p: Point) => 600 - (last.time - p.time) / 100;
  const y = (p: Point) => 60 - (p.price - (high + low) / 2) / span * 108;
  const d = points.map((p, i) => `${i && p.time - points[i - 1].time < 3000 ? "L" : "M"}${x(p)},${y(p)}`).join(" ");
  const selected = cursor === null ? last : points.reduce((a, b) => Math.abs(x(a) - cursor) < Math.abs(x(b) - cursor) ? a : b);
  return (
    <figure className="mt-3">
      <svg viewBox="0 0 660 120" className="w-full" role="img" aria-label="Live quote over the past minute"
        onPointerLeave={() => setCursor(null)} onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setCursor(660 * (event.clientX - rect.left) / rect.width);
        }}>
        {[6, 60, 114].map((py) => <g key={py}>
          <line x1={0} x2={600} y1={py} y2={py} stroke="currentColor" opacity=".12" />
          <text x={607} y={py + 4} fontSize={12} fill="currentColor">{fmt((high + low) / 2 + (60 - py) * span / 108)}</text>
        </g>)}
        <path d={d} fill="none" stroke={last.price >= points[0].price ? "var(--mint)" : "var(--berry)"} strokeWidth="2" />
        {levels.map((level,i) => <g key={i}><line x2={600} y1={y({time, price:level.price})} y2={y({time, price:level.price})} stroke="#846422" strokeDasharray="4 3"/><text x={i % 3 * 90 + 4} y={Math.max(12,y({time, price:level.price}) - 2)} fontSize="11">{level.label} {fmt(level.price)}</text></g>)}
        {fills.map((f,i) => <circle key={i} cx={x(f)} cy={y(f)} r="4" fill="#185788"><title>Fill {fmt(f.price)}</title></circle>)}
        <circle cx={x(selected)} cy={y(selected)} r="3" fill="currentColor" />
      </svg>
      <figcaption className="flex justify-between text-xs font-bold tabular-nums"><span>Last 60 seconds</span><span>{new Date(selected.time).toLocaleTimeString()} · {fmt(selected.price)}</span></figcaption>
    </figure>
  );
}
