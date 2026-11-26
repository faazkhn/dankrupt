import { Engine, type EngineEvent, type EventBody, type Output, type PriceUpdate } from "@dankrupt/engine";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type Candle = { memeId: string; minute: number; open: number; high: number; low: number; close: number; volume: number };

/** Market-data read model kept next to the engine snapshot (the web server's Feed, made serialisable). */
type Feed = {
  names: Record<string, string>;
  features: Record<string, { fair: number; heat: number }>;
  latest: Record<string, PriceUpdate>;
  ltp: Record<string, number>;
  /** The minute candle still forming, per meme. */
  open: Record<string, Candle>;
  /** Last 59 closed one-minute closes, per meme. */
  spark: Record<string, number[]>;
  /** Hourly opens over the last day, oldest first: the 24h-change reference. */
  hours: Record<string, { hour: number; open: number }[]>;
  dank: { time: number; price: number }[];
};

export type MarketRow = {
  memeId: string; name: string; ltp: number | null; mid: number; bid: number; ask: number; change24h: number;
  spark: number[]; fair: number; heat: number; status: string; opensAt: number | null; comebackAt: number | null;
};

/** One applied input (null for clock ticks) and what it did, for the Redis projections. */
export type Applied = { ev: EngineEvent | null; out: Output };

/**
 * The engine plus its market-data feed, loaded from and saved to one JSON blob. Every change goes
 * through `advance` or `submit`, which record what happened in `log` for the caller to persist.
 */
export class World {
  readonly engine: Engine;
  private feed: Feed;
  readonly log: Applied[] = [];
  readonly closedCandles: Candle[] = [];

  private constructor(engine: Engine, feed: Feed) {
    this.engine = engine;
    this.feed = feed;
  }

  static load(raw: string | undefined | null): World {
    if (!raw) return new World(new Engine(), { names: {}, features: {}, latest: {}, ltp: {}, open: {}, spark: {}, hours: {}, dank: [] });
    const { engine, feed } = JSON.parse(raw) as { engine: string; feed: Feed };
    return new World(Engine.fromSnapshot(engine), feed);
  }

  save(): string {
    return JSON.stringify({ engine: this.engine.snapshot(), feed: this.feed });
  }

  get time() {
    return this.engine.time;
  }

  /** Runs the house clock up to `now`, a minute at a time so a long idle gap never builds one huge output. */
  advance(now: number) {
    if (!this.engine.seq) return;
    while (now - this.engine.time > MINUTE) this.record(null, this.engine.advance(this.engine.time + MINUTE));
    if (now > this.engine.time) this.record(null, this.engine.advance(now));
  }

  submit(body: EventBody, now: number): Output {
    this.advance(now);
    const ev = { ...body, seq: this.engine.seq + 1, time: Math.max(now, this.engine.time) } as EngineEvent;
    const out = this.engine.apply(ev);
    this.record(ev, out);
    return out;
  }

  private record(ev: EngineEvent | null, out: Output) {
    this.log.push({ ev, out });
    const f = this.feed;
    if (out.dankTicks?.length) f.dank = f.dank.concat(out.dankTicks).slice(-600);
    if (ev?.type === "meme.list" && !out.rejects.length) {
      f.names[ev.memeId] = ev.name;
      f.features[ev.memeId] = { fair: ev.fairValue ?? ev.price, heat: 1 };
    }
    if (ev?.type === "meme.features") f.features[ev.memeId] = { fair: ev.fairValue, heat: ev.heat };
    for (const t of out.trades) {
      f.ltp[t.memeId] = t.price;
      const c = f.open[t.memeId];
      if (c && c.minute === t.time - (t.time % MINUTE)) c.volume += t.qty;
    }
    for (const p of out.prices) {
      f.latest[p.memeId] = p;
      const minute = p.time - (p.time % MINUTE);
      const c = f.open[p.memeId];
      if (c && c.minute === minute) {
        c.high = Math.max(c.high, p.mid);
        c.low = Math.min(c.low, p.mid);
        c.close = p.mid;
        continue;
      }
      f.open[p.memeId] = { memeId: p.memeId, minute, open: p.mid, high: p.mid, low: p.mid, close: p.mid, volume: 0 };
      if (c) this.close(c);
    }
  }

  private close(c: Candle) {
    const f = this.feed;
    this.closedCandles.push(c);
    f.spark[c.memeId] = (f.spark[c.memeId] ?? []).concat(c.close).slice(-59);
    const hour = c.minute - (c.minute % HOUR);
    const h = (f.hours[c.memeId] ?? []).filter((x) => x.hour >= c.minute - DAY);
    if (h.at(-1)?.hour !== hour) h.push({ hour, open: c.open });
    f.hours[c.memeId] = h;
  }

  /** The forming candle, so charts can show the current minute. */
  openCandle(memeId: string): Candle | undefined {
    return this.feed.open[memeId];
  }

  dankHistory() {
    return this.feed.dank;
  }

  markets(): MarketRow[] {
    const f = this.feed;
    return Object.values(f.latest).map((p) => {
      const m = this.engine.meme(p.memeId);
      const ref = f.hours[p.memeId]?.[0]?.open ?? f.open[p.memeId]?.open ?? p.mid;
      return {
        memeId: p.memeId,
        name: f.names[p.memeId] ?? m.name,
        ltp: f.ltp[p.memeId] ?? null,
        mid: p.mid,
        bid: p.bid,
        ask: p.ask,
        change24h: ((p.mid - ref) / ref) * 100,
        spark: [...(f.spark[p.memeId] ?? []), p.mid],
        heat: f.features[p.memeId]?.heat ?? 1,
        fair: m.fairValue ?? f.features[p.memeId]?.fair ?? p.price,
        status: m.status,
        opensAt: m.opensAt,
        comebackAt: m.comebackAt,
      };
    });
  }
}
