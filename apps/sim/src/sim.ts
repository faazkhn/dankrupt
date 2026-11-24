import { COIN, DEFAULT_PARAMS, Engine, type EventBody, type Params } from "@dankrupt/engine";
import { computeFeatures, DEFAULT_FEATURE_PARAMS, wikipediaHourly, type FeatureRow } from "@dankrupt/features";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2030, 0, 1); // virtual calendar; real dates don't matter, only the shape of attention

export type History = Record<string, { title: string; start: string; daily: number[] }>;

export type SimConfig = {
  seed: number;
  /** Days of trading after the warm-up. */
  days: number;
  /** Days of attention history before listing, so heat's 30-day statistics are warm. */
  warmup: number;
  randomBots: number;
  trendBots: number;
  params?: Partial<Params>;
};

export type SimResult = {
  seed: number;
  medianDailyMovePct: number;
  longestFlatHours: number;
  medianPriceAttentionCorr: number;
  trendMedianTwr: number;
  randomMedianTwr: number;
  trendBeatsRandom: boolean;
  memes: number;
};

/** Small seeded PRNG for the bots (independent of the engine's own per-meme noise). */
function rng(seed: number) {
  let s = seed | 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * One simulated market: every meme lists at the end of its warm-up, then trades for `days` days of
 * its real Wikipedia attention, at 60-second ticks (drift and noise scale with the step, so the
 * statistics match the 2-second production tick at a fraction of the cost).
 */
export function runSim(history: History, cfg: SimConfig): SimResult {
  const params: Params = { ...DEFAULT_PARAMS, tickMs: 60_000, ...cfg.params };
  const e = new Engine(params);
  const rand = rng(cfg.seed * 7919 + 1);
  let seq = 0;
  let now = T0;
  const submit = (b: EventBody) => e.apply({ ...b, seq: ++seq, time: now } as never);

  const listAt = T0 + cfg.warmup * DAY;
  const hours = cfg.days * 24;
  const memes = Object.entries(history)
    .filter(([, h]) => h.daily.length >= cfg.warmup + cfg.days + 1)
    .map(([id, h]) => {
      const daily: Record<string, number> = {};
      h.daily.forEach((v, i) => (daily[dayKey(T0 + i * DAY)] = v));
      const features = computeFeatures(
        { start: T0, ipoTime: listAt, sources: { wikipedia: wikipediaHourly(daily, T0, listAt + hours * HOUR) } },
        DEFAULT_FEATURE_PARAMS,
      );
      return { id: `${id}.${cfg.seed}`, views: h.daily, features };
    });

  now = listAt;
  for (const m of memes) submit({ type: "meme.list", memeId: m.id, name: m.id, price: 100, depth: 500_000 });
  const bots = [
    ...Array.from({ length: cfg.randomBots }, (_, i) => ({ id: `random${i}`, kind: "random" as const })),
    ...Array.from({ length: cfg.trendBots }, (_, i) => ({ id: `trend${i}`, kind: "trend" as const })),
  ];
  for (const b of bots) submit({ type: "account.open", accountId: b.id });

  const featureAt = (m: (typeof memes)[number], t: number): FeatureRow | undefined => m.features[Math.floor((t - T0) / HOUR)];
  const mids = new Map(memes.map((m) => [m.id, [] as number[]])); // day-end mids
  let longestFlat = 0;
  const flatRun = new Map<string, number>();

  for (let h = 0; h < hours; h++) {
    now = listAt + h * HOUR;
    // Attention pipeline: an hourly features update per meme, as the server does.
    for (const m of memes) {
      const f = featureAt(m, now);
      if (f) submit({ type: "meme.features", memeId: m.id, fairValue: f.fair, heat: f.heat, z: f.z, acc: f.acc });
    }
    // Bots decide once an hour.
    for (const b of bots) {
      const a = e.account(b.id);
      if (b.kind === "random") {
        if (rand() > 0.15) continue;
        const m = memes[Math.floor(rand() * memes.length)];
        const held = a.shares[m.id] ?? 0;
        if (held > 0 && rand() < 0.5) submit({ type: "order.market", accountId: b.id, memeId: m.id, side: "sell", qty: held });
        else {
          const spend = (a.freeCash / COIN) * (0.02 + rand() * 0.04);
          const qty = Math.floor(spend / e.meme(m.id).ask);
          if (qty > 0) submit({ type: "order.market", accountId: b.id, memeId: m.id, side: "buy", qty });
        }
      } else {
        // Trend-spotter: reads the raw attention signal (acceleration and momentum) and gets in early.
        for (const m of memes) {
          const f = featureAt(m, now);
          if (!f) continue;
          const held = a.shares[m.id] ?? 0;
          if (held === 0 && f.acc > 0.02 && f.v > 0 && rand() < 0.5) {
            const qty = Math.floor(((a.equity / COIN) * 0.08) / e.meme(m.id).ask);
            if (qty > 0 && a.freeCash / COIN > qty * e.meme(m.id).ask * 1.01) submit({ type: "order.market", accountId: b.id, memeId: m.id, side: "buy", qty });
          } else if (held > 0 && (f.v < 0 || f.acc < -0.02)) submit({ type: "order.market", accountId: b.id, memeId: m.id, side: "sell", qty: held });
        }
      }
    }
    // Let the hour play out tick by tick, watching for flat stretches.
    const out = e.advance(now + HOUR);
    const range = new Map<string, [number, number]>();
    for (const p of out.prices) {
      const r = range.get(p.memeId);
      range.set(p.memeId, r ? [Math.min(r[0], p.mid), Math.max(r[1], p.mid)] : [p.mid, p.mid]);
    }
    for (const [id, [lo, hi]] of range) {
      const flat = (hi - lo) / lo < 0.001; // moved less than 0.1% all hour
      const run = flat ? (flatRun.get(id) ?? 0) + 1 : 0;
      flatRun.set(id, run);
      longestFlat = Math.max(longestFlat, run);
    }
    if ((h + 1) % 24 === 0) for (const m of memes) mids.get(m.id)!.push(e.meme(m.id).mid);
  }

  // Liveliness: median absolute daily move.
  const moves: number[] = [];
  for (const series of mids.values()) for (let i = 1; i < series.length; i++) moves.push(Math.abs(Math.log(series[i] / series[i - 1])));

  // Price tracks attention: per meme, correlation of daily log price with log views.
  const corrs = memes.map((m) => {
    const xs = mids.get(m.id)!.map(Math.log);
    const ys = xs.map((_, d) => Math.log(1 + m.views[cfg.warmup + d]));
    return pearson(xs, ys);
  });

  const twr = (kind: "random" | "trend") =>
    median(bots.filter((b) => b.kind === kind).map((b) => e.account(b.id).equity / params.startingCash - 1));
  const trend = twr("trend");
  const random = twr("random");
  return {
    seed: cfg.seed,
    medianDailyMovePct: median(moves) * 100,
    longestFlatHours: longestFlat,
    medianPriceAttentionCorr: median(corrs.filter((c) => Number.isFinite(c))),
    trendMedianTwr: trend,
    randomMedianTwr: random,
    trendBeatsRandom: trend > random,
    memes: memes.length,
  };
}

export function median(xs: number[]) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

export function pearson(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}
