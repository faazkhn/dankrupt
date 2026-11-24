/** Hero illustration: candy-striped candlesticks climbing a hand-drawn chart. Decorative. */
const CANDLES = [
  { o: 150, c: 128, h: 118, l: 160 },
  { o: 128, c: 140, h: 120, l: 150 },
  { o: 140, c: 112, h: 102, l: 146 },
  { o: 112, c: 96, h: 84, l: 120 },
  { o: 96, c: 104, h: 88, l: 112 },
  { o: 104, c: 70, h: 58, l: 108 },
  { o: 70, c: 40, h: 26, l: 76 },
];

export function CandyChart({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 190" className={className} role="img" aria-label="A cartoon price chart made of candy-striped candles, going up">
      <defs>
        <pattern id="stripe-up" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="10" height="10" fill="#1d8a4a" />
          <rect width="4.5" height="10" fill="#fffaf0" />
        </pattern>
        <pattern id="stripe-down" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="10" height="10" fill="#d8342c" />
          <rect width="4.5" height="10" fill="#fffaf0" />
        </pattern>
      </defs>
      {/* paper sheet */}
      <path d="M12 14 L290 8 L294 176 L8 182 Z" fill="#fffaf0" stroke="#3a2412" strokeWidth="3" strokeLinejoin="round" />
      {[50, 90, 130].map((y) => (
        <line key={y} x1="20" x2="282" y1={y} y2={y - 2} stroke="#59c3e8" strokeOpacity=".35" strokeWidth="1.5" />
      ))}
      {/* marker trend line */}
      <path d="M26 150 C 70 140, 90 120, 130 112 S 200 90, 270 32" fill="none" stroke="#ff7a2f" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9" />
      {CANDLES.map((k, i) => {
        const x = 40 + i * 36;
        const up = k.c < k.o;
        const top = Math.min(k.o, k.c);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={k.h} y2={k.l} stroke="#3a2412" strokeWidth="3" strokeLinecap="round" />
            <rect x={x - 9} y={top} width="18" height={Math.max(8, Math.abs(k.o - k.c))} rx="6" fill={`url(#stripe-${up ? "up" : "down"})`} stroke="#3a2412" strokeWidth="3" />
          </g>
        );
      })}
    </svg>
  );
}
