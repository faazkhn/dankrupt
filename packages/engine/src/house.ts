/**
 * The house's virtual constant-product curve (PRD §6.1). Prices are coins per share as doubles;
 * callers round coin amounts to micro-coins (ADR-0002).
 */
export type Curve = { price: number; L: number };

export const PRICE_FLOOR = 0.01;

export const depthToL = (depth: number, price: number) => depth / Math.sqrt(price);

/** Coins (before spread) to move the curve from p0 to p1. Positive when price rises. */
export const coinsBetween = (L: number, p0: number, p1: number) => L * (Math.sqrt(p1) - Math.sqrt(p0));

/** Centre price after the house sells `d` shares (d < 0: house buys). */
export function priceAfter({ price, L }: Curve, d: number): number {
  const x = L / Math.sqrt(price);
  return (L / (x - d)) ** 2;
}

/** Most shares the house can sell before cost + fee exceeds `budget` coins. */
export function maxBuyable({ price, L }: Curve, budget: number, half: number, feeRate: number): number {
  const x = L / Math.sqrt(price);
  const sqrtP1 = Math.sqrt(price) + budget / (L * (1 + half) * (1 + feeRate));
  return Math.max(0, Math.floor(x - L / sqrtP1));
}

/** Most shares the house will buy before its price would drop below the floor. */
export function maxSellable({ price, L }: Curve): number {
  return Math.max(0, Math.floor(L / Math.sqrt(PRICE_FLOOR) - L / Math.sqrt(price)));
}
