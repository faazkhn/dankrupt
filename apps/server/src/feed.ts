import type { Server } from "node:http";
import type { Db } from "@dankrupt/db";
import type { EngineEvent, Output, PriceUpdate } from "@dankrupt/engine";
import { WebSocketServer, WebSocket } from "ws";
import { CandleBook, type Candle } from "./candles.ts";

const DAY = 86_400_000;

export type MarketRow = {
  memeId: string;
  name: string;
  /** Last traded price, or null before the first trade. */
  ltp: number | null;
  mid: number;
  bid: number;
  ask: number;
  /** % change of mid versus 24 hours ago (or since listing, if younger). */
  change24h: number;
  /** Up to 60 recent one-minute closes, oldest first. */
  spark: number[];
  /** Data-driven fair value and heat (PRD §5). */
  fair: number;
  heat: number;
  status: string;
  opensAt: number | null;
};

/**
 * Market data projection: 1-minute candles (persisted), last trade prices, 24h change, and a
 * websocket fan-out that sends each client the latest quotes at most once a second.
 * shortcut: runs inside the engine process; moves behind Redis when the gateway is split out (ticket 20).
 */
export class Feed {
  private book = new CandleBook();
  private history = new Map<string, Candle[]>(); // last 24h of closed candles, per meme
  private names = new Map<string, string>();
  private latest = new Map<string, PriceUpdate>();
  private ltp = new Map<string, number>();
  private features = new Map<string, { fair: number; heat: number }>();
  private dirty = new Set<string>();
  private pending: Candle[] = [];
  private persistedThrough: number;
  private db: Db;
  private wss?: WebSocketServer;

  /** Status lookup, injected so rows can say "pre-open" and when the house opens. */
  statusOf: (memeId: string) => { status: string; opensAt: number | null } = () => ({ status: "active", opensAt: null });

  private constructor(db: Db, persistedThrough: number) {
    this.db = db;
    this.persistedThrough = persistedThrough;
  }

  static async create(db: Db) {
    const { rows } = await db.query<{ m: number | null }>("select extract(epoch from max(minute)) * 1000 as m from candles_1m");
    return new Feed(db, Number(rows[0]?.m ?? -1));
  }

  readonly onApplied = (ev: EngineEvent | null, out: Output) => {
    if (ev?.type === "meme.list") {
      this.names.set(ev.memeId, ev.name);
      this.features.set(ev.memeId, { fair: ev.fairValue ?? ev.price, heat: 1 });
    }
    if (ev?.type === "meme.features") {
      this.features.set(ev.memeId, { fair: ev.fairValue, heat: ev.heat });
      this.dirty.add(ev.memeId);
    }
    for (const t of out.trades) {
      this.ltp.set(t.memeId, t.price);
      this.book.fill(t.memeId, t.time, t.qty);
    }
    for (const p of out.prices) {
      this.latest.set(p.memeId, p);
      this.dirty.add(p.memeId);
      for (const c of this.book.price(p)) this.close(c);
    }
  };

  private close(c: Candle) {
    const h = this.history.get(c.memeId) ?? [];
    h.push(c);
    while (h.length && h[0].minute < c.minute - DAY) h.shift();
    this.history.set(c.memeId, h);
    if (c.minute > this.persistedThrough) this.pending.push(c);
  }

  /** Writes closed candles. Called on a timer; replayed history only writes minutes not yet stored. */
  async flush() {
    const batch = this.pending.splice(0);
    for (const c of batch)
      await this.db.query(
        `insert into candles_1m (meme_id, minute, open, high, low, close, volume)
         values ($1, to_timestamp($2 / 1000.0), $3, $4, $5, $6, $7)
         on conflict (meme_id, minute) do update set high = excluded.high, low = excluded.low, close = excluded.close, volume = excluded.volume`,
        [c.memeId, c.minute, c.open, c.high, c.low, c.close, c.volume],
      );
    if (batch.length) this.persistedThrough = Math.max(this.persistedThrough, batch.at(-1)!.minute);
  }

  markets(): MarketRow[] {
    return [...this.latest.values()].map((p) => {
      const h = this.history.get(p.memeId) ?? [];
      const ref = h[0]?.open ?? this.book.current(p.memeId)?.open ?? p.mid;
      const spark = [...h.slice(-59).map((c) => c.close), p.mid];
      return {
        memeId: p.memeId,
        name: this.names.get(p.memeId) ?? p.memeId,
        ltp: this.ltp.get(p.memeId) ?? null,
        mid: p.mid,
        bid: p.bid,
        ask: p.ask,
        change24h: ((p.mid - ref) / ref) * 100,
        spark,
        fair: this.features.get(p.memeId)?.fair ?? p.price,
        heat: this.features.get(p.memeId)?.heat ?? 1,
        ...this.statusOf(p.memeId),
      };
    });
  }

  candles(memeId: string, limit = 180): Candle[] {
    const cur = this.book.current(memeId);
    const h = this.history.get(memeId) ?? [];
    return [...h, ...(cur ? [cur] : [])].slice(-limit);
  }

  /** Websocket fan-out on /ws: a full snapshot on connect, then changed rows at most once a second. */
  attach(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (ws) => ws.send(JSON.stringify({ type: "markets", rows: this.markets() })));
    setInterval(() => {
      if (!this.dirty.size || !this.wss?.clients.size) return this.dirty.clear();
      const rows = this.markets().filter((r) => this.dirty.has(r.memeId));
      this.dirty.clear();
      const msg = JSON.stringify({ type: "markets", rows });
      for (const c of this.wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
    }, 1_000).unref();
    setInterval(() => this.flush().catch((e) => console.error("candle flush failed", e)), 5_000).unref();
  }
}

