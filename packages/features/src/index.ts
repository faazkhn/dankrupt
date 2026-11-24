/**
 * Attention → heat → fair value (PRD §5), as one pure function over hourly series.
 * Recomputed from stored raw counts on every refresh: deterministic, no hidden state.
 */

export type Source = "wikipedia" | "youtube" | "trends" | "ingame" | "reddit";

export type FeatureParams = {
  /** Blend weights w_k. A source with weight 0 is ignored. */
  weights: Record<Source, number>;
  /**
   * Fixed per-source centring, in ln(1 + per-hour count) units (spec deviation from the live median,
   * so one meme's fair value depends only on its own attention).
   */
  baselines: Record<Source, number>;
  ipoPrice: number;
  kappa: number;
  lambda: number;
  beta: number;
  epsilon: number;
  minFair: number;
};

export const DEFAULT_FEATURE_PARAMS: FeatureParams = {
  weights: { wikipedia: 0.4, youtube: 0, trends: 0, ingame: 0.1, reddit: 0 },
  baselines: { wikipedia: Math.log(1 + 20), youtube: Math.log(1 + 2_000), trends: Math.log(1 + 50), ingame: Math.log(1 + 5), reddit: Math.log(1 + 10) },
  ipoPrice: 100,
  kappa: 0.6,
  lambda: 0.25,
  beta: 2,
  epsilon: 0.05,
  minFair: 1,
};

export type FeatureRow = {
  time: number;
  /** Blended attention index A (frozen while every source is stale). */
  A: number;
  a6: number;
  a24: number;
  a72: number;
  /** Momentum v = Ā6h − Ā72h. */
  v: number;
  /** Acceleration a = v − v(24h ago). */
  acc: number;
  /** Heat z-score against the meme's own last 30 days. */
  z: number;
  heat: number;
  fair: number;
  delayed: boolean;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MONTH_HOURS = 30 * 24;

/**
 * @param input.sources hourly per-hour counts aligned to `start` (index i = start + i hours); null = stale
 * @param input.ipoTime the meme's listing time; fair value is anchored to Ā24h there (or at `start` if earlier)
 */
export function computeFeatures(
  input: { start: number; ipoTime: number; sources: Partial<Record<Source, (number | null)[]>>; decay?: (time: number) => number },
  P: FeatureParams = DEFAULT_FEATURE_PARAMS,
): FeatureRow[] {
  const entries = (Object.entries(input.sources) as [Source, (number | null)[]][]).filter(([k]) => P.weights[k] > 0);
  const n = Math.max(0, ...entries.map(([, v]) => v.length));
  const rows: FeatureRow[] = [];
  const k = (h: number) => 1 - 2 ** (-1 / h);
  let A = 0;
  let a6 = 0;
  let a24 = 0;
  let a72 = 0;
  let started = false;
  let anchor: number | null = null;
  const a24hist: number[] = [];

  for (let i = 0; i < n; i++) {
    const time = input.start + i * HOUR;
    let num = 0;
    let den = 0;
    for (const [src, vals] of entries) {
      const s = vals[i];
      if (s === null || s === undefined) continue;
      num += P.weights[src] * (Math.log(1 + Math.max(0, s)) - P.baselines[src]);
      den += P.weights[src];
    }
    const delayed = den === 0;
    if (!delayed) A = num / den;
    if (!started) {
      if (delayed) continue; // nothing to anchor on yet
      a6 = a24 = a72 = A;
      started = true;
    } else {
      a6 += k(6) * (A - a6);
      a24 += k(24) * (A - a24);
      a72 += k(72) * (A - a72);
    }
    if (anchor === null && time >= input.ipoTime) anchor = a24;
    a24hist.push(a24);
    const window = a24hist.slice(-MONTH_HOURS);
    const mu = window.reduce((s, x) => s + x, 0) / window.length;
    const sigma = Math.sqrt(window.reduce((s, x) => s + (x - mu) ** 2, 0) / window.length);
    const v = a6 - a72;
    const v24 = rows.length >= 24 ? rows[rows.length - 24].v : 0;
    const z = (a24 - mu) / (sigma + P.epsilon);
    const heat = Math.log1p(Math.exp(z + P.beta * v));
    const base = anchor ?? a24;
    const lnF = Math.log(P.ipoPrice) + P.kappa * (a24 - base) + P.lambda * Math.max(-1, Math.min(1, v)) + Math.log(input.decay?.(time) ?? 1);
    rows.push({ time, A, a6, a24, a72, v, acc: v - v24, z, heat, fair: Math.max(P.minFair, Math.exp(lnF)), delayed });
  }
  return rows;
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Wikipedia publishes day D's count the next day, so hour t uses yesterday's count / 24. If
 * yesterday hasn't loaded yet it falls back one more day; with neither, the source is stale.
 * (A day only counts as missing once it is two days late; see ticket 04.)
 */
export function wikipediaHourly(daily: Record<string, number>, start: number, end: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let t = start; t < end; t += HOUR) {
    const y1 = daily[dayKey(t - DAY)];
    const y2 = daily[dayKey(t - 2 * DAY)];
    out.push(y1 !== undefined ? y1 / 24 : y2 !== undefined ? y2 / 24 : null);
  }
  return out;
}
