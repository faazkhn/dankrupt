/** Seeded randomness and rolling statistics for the house drift (PRD §6.1, §6.3). Pure helpers. */

/** FNV-1a: a stable 32-bit seed from a meme id. */
export function seedFrom(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h | 0;
}

/** mulberry32 step. Returns [uniform in [0,1), next state]. */
export function uniform(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** Standard normal via Box–Muller. Returns [z, next state]. */
export function normal(state: number): [number, number] {
  const [u1, s1] = uniform(state);
  const [u2, s2] = uniform(s1);
  return [Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2), s2];
}

/**
 * Realised volatility over the last hour: √(Σ r²) of one-minute log returns. A short history
 * counts as quiet minutes, so one early jump doesn't masquerade as a wild hour.
 */
export function hourlyVol(closes: number[]): number {
  let sum = 0;
  for (let i = Math.max(1, closes.length - 60); i < closes.length; i++) sum += Math.log(closes[i] / closes[i - 1]) ** 2;
  return Math.sqrt(sum);
}
