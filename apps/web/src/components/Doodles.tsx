/**
 * Marker doodles scribbled on the cardboard behind app pages: rockets, moons, arrows, coins.
 * Decorative only (aria-hidden), fixed in the side gutters so they never sit under content on desktop,
 * and faint on phones so text stays readable.
 */
type Doodle = { d: string[]; color: string; at: string; size: string; rot: number; fill?: string; text?: string };

const INK = "#3a2412";
const RED = "#d8342c";
const SKY = "#2b8fbf";
const WHITE = "#fffaf0";

const SHAPES = {
  rocket: [
    "M50 10 C64 22 68 42 64 62 L36 62 C32 42 36 22 50 10 Z",
    "M36 50 L24 66 L37 64",
    "M64 50 L76 66 L63 64",
    "M43 62 L41 74 M50 62 L50 80 M57 62 L59 74",
    "M50 30 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0",
  ],
  moon: ["M62 18 C40 22 30 44 38 62 C46 80 68 84 82 74 C60 74 46 56 52 38 C55 28 58 22 62 18 Z", "M20 24 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z", "M28 72 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2 Z"],
  arrow: ["M10 82 C24 70 30 74 40 60 C48 48 56 56 66 40 C72 30 78 24 86 14", "M70 14 L87 12 L84 30"],
  coin: ["M50 50 m-32 0 a32 30 0 1 0 64 0 a32 30 0 1 0 -64 0", "M50 50 m-24 0 a24 22 0 1 0 48 0 a24 22 0 1 0 -48 0", "M58 40 C52 34 40 36 40 50 C40 64 52 66 58 60"],
  diamond: ["M28 36 L40 22 L60 22 L72 36 L50 78 Z", "M28 36 L72 36", "M40 22 L46 36 L50 78 M60 22 L54 36"],
  star: ["M50 12 L60 38 L88 40 L66 58 L74 86 L50 70 L26 86 L34 58 L12 40 L40 38 Z"],
  bolt: ["M56 8 L28 54 L48 54 L40 92 L72 40 L52 40 Z"],
  crown: ["M16 70 L22 30 L38 52 L50 24 L62 52 L78 30 L84 70 Z", "M16 80 L84 80"],
  candles: ["M24 20 L24 80", "M18 34 h12 v30 h-12 z", "M50 14 L50 70", "M44 22 h12 v22 h-12 z", "M76 30 L76 88", "M70 44 h12 v34 h-12 z"],
  spiral: ["M50 50 c4 0 6 4 4 8 c-3 6 -14 4 -16 -4 c-3 -12 12 -20 22 -14 c14 8 10 30 -6 34 c-20 5 -34 -12 -30 -30 c4 -22 32 -32 50 -18"],
  smile: ["M50 50 m-34 0 a34 34 0 1 0 68 0 a34 34 0 1 0 -68 0", "M36 42 v6 M64 42 v6", "M32 60 C40 76 60 76 68 60"],
  burst: ["M50 8 L58 34 L86 22 L66 46 L92 58 L62 62 L70 90 L50 68 L30 90 L38 62 L8 58 L34 46 L14 22 L42 34 Z"],
};

const DOODLES: Doodle[] = [
  { d: SHAPES.rocket, color: INK, at: "left-[2%] top-[18%]", size: "size-24", rot: -18 },
  { d: SHAPES.moon, color: WHITE, at: "left-[5%] top-[42%]", size: "size-20", rot: 8 },
  { d: SHAPES.arrow, color: RED, at: "left-[1%] top-[62%]", size: "size-28", rot: 0 },
  { d: SHAPES.coin, color: INK, at: "left-[6%] top-[82%]", size: "size-16", rot: -10 },
  { d: SHAPES.diamond, color: SKY, at: "right-[3%] top-[20%]", size: "size-20", rot: 12 },
  { d: SHAPES.candles, color: INK, at: "right-[6%] top-[40%]", size: "size-20", rot: -6 },
  { d: SHAPES.bolt, color: RED, at: "right-[2%] top-[60%]", size: "size-16", rot: 14 },
  { d: SHAPES.crown, color: WHITE, at: "right-[5%] top-[78%]", size: "size-20", rot: -12 },
  { d: SHAPES.star, color: WHITE, at: "left-[14%] top-[10%]", size: "size-10", rot: 10 },
  { d: SHAPES.spiral, color: INK, at: "right-[14%] top-[12%]", size: "size-14", rot: 0 },
  { d: SHAPES.smile, color: INK, at: "left-[12%] top-[92%]", size: "size-14", rot: 6 },
  { d: SHAPES.burst, color: RED, at: "right-[13%] top-[90%]", size: "size-12", rot: -8 },
];

const WORDS = [
  { text: "HODL!", at: "left-[3%] top-[30%]", rot: -12, color: RED },
  { text: "to the moon", at: "right-[2%] top-[31%]", rot: 9, color: INK },
  { text: "buy high?", at: "left-[2%] top-[73%]", rot: 7, color: INK },
  { text: "stonks ↑", at: "right-[3%] top-[70%]", rot: -9, color: SKY },
];

export function Doodles() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-30 lg:opacity-60">
      {DOODLES.map((x, i) => (
        <svg key={i} viewBox="0 0 100 100" className={`absolute ${x.at} ${x.size}`} style={{ transform: `rotate(${x.rot}deg)` }}>
          {x.d.map((d, j) => (
            <path key={j} d={d} fill="none" stroke={x.color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      ))}
      {WORDS.map((w) => (
        <span
          key={w.text}
          className={`font-display absolute ${w.at} hidden text-2xl tracking-wide lg:block`}
          style={{ transform: `rotate(${w.rot}deg)`, color: w.color }}
        >
          {w.text}
        </span>
      ))}
    </div>
  );
}
