import type { ReactNode } from "react";

/** A clip-path with ragged top and bottom edges. Deterministic, so server and client agree. */
function ragged(seed: number, depth: number, base: number) {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let x = 0; x <= 100; x += 0.8 + rand() * 1.8) top.push(`${x.toFixed(2)}% ${(base + rand() * depth).toFixed(1)}px`);
  for (let x = 100; x >= 0; x -= 0.8 + rand() * 1.8)
    bottom.push(`${x.toFixed(2)}% calc(100% - ${(base + rand() * depth).toFixed(1)}px)`);
  return `polygon(0% ${base + depth}px, ${top.join(", ")}, 100% ${base + depth}px, 100% calc(100% - ${base + depth}px), ${bottom.join(", ")}, 0% calc(100% - ${base}px))`;
}

const UNDER = ragged(7, 22, 0);
const OVER = ragged(19, 22, 8);

/** Patterned paper torn at top and bottom, with a darker torn layer peeking out underneath. */
export function TornPaper({ children, className = "polka", underClass = "bg-[#5f9a1e]" }: { children: ReactNode; className?: string; underClass?: string }) {
  return (
    <div className="relative [filter:drop-shadow(0_6px_0_rgba(58,36,18,0.25))_drop-shadow(0_-6px_0_rgba(58,36,18,0.25))]">
      <div aria-hidden="true" className={`absolute inset-0 ${underClass}`} style={{ clipPath: UNDER }} />
      <div className={`relative ${className}`} style={{ clipPath: OVER }}>
        {children}
      </div>
    </div>
  );
}
