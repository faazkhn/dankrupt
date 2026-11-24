import type { PriceUpdate } from "@dankrupt/engine";

export type Candle = { memeId: string; minute: number; open: number; high: number; low: number; close: number; volume: number };

const MINUTE = 60_000;

/** Builds 1-minute candles from house mid prices (the chart follows mid, not last), with volume from fills. */
export class CandleBook {
  private open = new Map<string, Candle>();

  /** Feeds a quote; returns any candles it closed. */
  price(p: PriceUpdate): Candle[] {
    const minute = p.time - (p.time % MINUTE);
    const c = this.open.get(p.memeId);
    if (c && c.minute === minute) {
      c.high = Math.max(c.high, p.price);
      c.low = Math.min(c.low, p.price);
      c.close = p.price;
      return [];
    }
    this.open.set(p.memeId, { memeId: p.memeId, minute, open: p.price, high: p.price, low: p.price, close: p.price, volume: 0 });
    return c ? [c] : [];
  }

  fill(memeId: string, time: number, qty: number) {
    const c = this.open.get(memeId);
    if (c && c.minute === time - (time % MINUTE)) c.volume += qty;
  }

  current(memeId: string): Candle | undefined {
    const c = this.open.get(memeId);
    return c && { ...c };
  }
}
