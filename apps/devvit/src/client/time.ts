import { useEffect, useState } from "react";

/** "3h 12m" until `endsAt`. */
export const left = (endsAt: number, now: number) => {
  const m = Math.max(0, Math.floor((endsAt - now) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
