"use client";

import { useEffect, useState } from "react";

/** "12:34" until `to` (epoch ms), ticking each second; "now" once reached. */
export function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1_000);
    return () => (clearTimeout(first), clearInterval(id));
  }, []);
  if (now === null) return <span>…</span>;
  const left = Math.max(0, Math.round((to - now) / 1_000));
  if (!left) return <span>now</span>;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span className="tabular-nums" aria-label={`${m} minutes ${s} seconds`}>
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}
