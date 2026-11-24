/** Tiny marker-drawn line of recent prices. Decorative: the price itself is shown as text nearby. */
export function Sparkline({ points, up: upProp, className = "" }: { points: number[]; up?: boolean; className?: string }) {
  if (points.length < 2) return <div className={className} aria-hidden="true" />;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * 100).toFixed(2)},${(36 - ((p - lo) / span) * 32).toFixed(2)}`)
    .join(" ");
  const up = upProp ?? points.at(-1)! >= points[0];
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d={d} fill="none" stroke={up ? "var(--mint)" : "var(--berry)"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
