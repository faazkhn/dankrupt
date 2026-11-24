import { TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react/ssr";

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

/** Scrolling ticker tape. Pauses on hover; stands still under reduced motion. */
export function Ticker() {
  const items = [...SAMPLE, ...SAMPLE];
  return (
    <div className="ticker border-y-[3px] border-ink bg-paper">
      <p className="sr-only">Sample meme prices, for illustration only.</p>
      <div className="overflow-hidden py-2" aria-hidden="true">
        <div className="ticker-track flex w-max gap-8 pr-8">
          {items.map((s, i) => {
            const up = s.d >= 0;
            const Icon = up ? TrendUpIcon : TrendDownIcon;
            return (
              <span key={i} className="flex items-center gap-2 whitespace-nowrap font-bold">
                <span className="font-display text-lg">{s.t}</span>
                <span>{s.p.toFixed(2)}</span>
                <span className={`flex items-center gap-1 ${up ? "text-mint" : "text-berry"}`}>
                  <Icon weight="bold" />
                  {up ? "+" : ""}
                  {s.d.toFixed(1)}%
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
