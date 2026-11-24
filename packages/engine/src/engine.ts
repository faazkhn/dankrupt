import { hourlyVol, normal, seedFrom } from "./drift.ts";
import { coinsBetween, depthToL, maxBuyable, priceAfter, PRICE_FLOOR, type Curve } from "./house.ts";
import { COIN, emptyOutput, PRICE_STEP, type EngineEvent, type Output, type PriceUpdate, type Side } from "./types.ts";

export type Params = {
  startingCash: number; // µc
  takerFeeBps: number;
  spreadBase: number; // s0, as a fraction (0.003 = 0.3%)
  spreadVolCoef: number; // s1
  spreadMax: number;
  tickMs: number;
  driftHalfLifeHours: number; // τ
  vwapWeight: number; // ω
  noisePerSqrtHour: number; // σn
};

export const DEFAULT_PARAMS: Params = {
  startingCash: 100_000 * COIN,
  takerFeeBps: 10,
  spreadBase: 0.003,
  spreadVolCoef: 0.5,
  spreadMax: 0.03,
  tickMs: 2_000,
  driftHalfLifeHours: 6,
  vwapWeight: 0.3,
  noisePerSqrtHour: 0.003,
};

const MINUTE = 60_000;
const clipHeat = (h: number) => Math.min(5, Math.max(0.2, h));
const DAY = 86_400_000;
const INF = Number.POSITIVE_INFINITY;

type Order = {
  orderId: number;
  accountId: string;
  memeId: string;
  side: Side;
  /** Limit price in µc, a multiple of the 0.01 price step. */
  px: number;
  qty: number;
  /** Buys: µc held back per remaining share (limit price + worst-case taker fee). */
  holdPerShare: number;
  expiresAt: number | null;
};

/** A stop-market order waiting for the mid to reach its trigger. Holds nothing until it fires. */
type Stop = { orderId: number; accountId: string; memeId: string; side: Side; stop: number; qty: number };

type Meme = {
  memeId: string;
  name: string;
  curve: Curve;
  spread: number;
  /** Data-driven fair value F, from `meme.features` events (the listing price until the first one). */
  fairValue: number;
  /** Heat H (PRD §5 step 4); 1 until the first features update. Scales depth and noise. */
  heat: number;
  /** Y₀: depth in coins at heat 1, from the listing. */
  depth0: number;
  listedAt: number;
  rng: number;
  /** Last 61 one-minute closes of the house price, for realised volatility. */
  closes: number[];
  /** Trades bucketed per minute for the 24h VWAP: [minuteStart, Σ price·qty, Σ qty]. */
  vwap: [number, number, number][];
  /** Best first: bids by price desc, asks by price asc; time priority (orderId) within a price. */
  bids: Order[];
  asks: Order[];
  stops: Stop[];
};

type Account = {
  accountId: string;
  cash: number;
  /** Cash held back by resting buy orders. */
  heldCash: number;
  shares: Record<string, number>;
  /** Shares held back by resting sell orders. */
  heldShares: Record<string, number>;
};

type State = {
  seq: number;
  time: number;
  /** Grid time of the last applied tick. */
  tick: number;
  params: Params;
  memes: Record<string, Meme>;
  accounts: Record<string, Account>;
  /** orderId → memeId for every resting order. */
  orderIndex: Record<string, string>;
};

/** Where journal lines, fills and quotes go while one event or tick is being applied. */
class Emitter {
  n = 0;
  readonly out: Output;
  readonly cause: string;
  readonly seq: number;
  readonly time: number;
  constructor(out: Output, cause: string, seq: number, time: number) {
    this.out = out;
    this.cause = cause;
    this.seq = seq;
    this.time = time;
  }
  post(account: string, commodity: string, amount: number) {
    if (!Number.isSafeInteger(amount)) throw new Error(`non-integer journal amount ${amount}`);
    if (amount !== 0) this.out.journal.push({ cause: this.cause, n: this.n++, seq: this.seq, time: this.time, account, commodity, amount });
  }
}

export type Preview = {
  /** Shares that would fill now. */
  qty: number;
  /** µc paid (buy, incl. fee) or received (sell, after fee). */
  total: number;
  fee: number;
  /** Average price per share before fee, coins. */
  avgPrice: number;
  /** Price of the last share, coins. */
  lastPrice: number;
  /** Why it would stop short of the requested quantity, if it would. */
  limitedBy: "cash" | "shares" | "limit" | "liquidity" | null;
};

/**
 * The deterministic exchange core. Feed it events in sequence order; it mutates its state and
 * returns what happened. Replaying the same events always yields the same snapshot.
 */
export class Engine {
  private s: State;

  constructor(params: Params = DEFAULT_PARAMS) {
    this.s = { seq: 0, time: 0, tick: 0, params, memes: {}, accounts: {}, orderIndex: {} };
  }

  static fromSnapshot(json: string): Engine {
    const e = new Engine();
    e.s = JSON.parse(json);
    return e;
  }

  /** Canonical serialisation: insertion order is deterministic because events are. */
  snapshot(): string {
    return JSON.stringify(this.s);
  }

  get seq() {
    return this.s.seq;
  }

  // ---------- reads ----------

  meme(memeId: string): PriceUpdate & { name: string; fairValue: number; heat: number; listedAt: number } {
    const m = this.s.memes[memeId];
    if (!m) throw new Error(`unknown meme ${memeId}`);
    return { ...this.quote(m, this.s.time), name: m.name, fairValue: m.fairValue, heat: m.heat ?? 1, listedAt: m.listedAt ?? 0 };
  }

  memes() {
    return Object.keys(this.s.memes).map((id) => this.meme(id));
  }

  /** Aggregated book levels (best first) plus the house's own quote. Prices in coins. */
  book(memeId: string, depth = 10) {
    const m = this.s.memes[memeId];
    if (!m) throw new Error(`unknown meme ${memeId}`);
    const levels = (orders: Order[]) => {
      const out: { price: number; qty: number; orders: number }[] = [];
      for (const o of orders) {
        const last = out.at(-1);
        if (last && last.price === o.px / COIN) (last.qty += o.qty), last.orders++;
        else if (out.length < depth) out.push({ price: o.px / COIN, qty: o.qty, orders: 1 });
        else break;
      }
      return out;
    };
    return { bids: levels(m.bids), asks: levels(m.asks), house: { bid: this.houseBid(m), ask: this.houseAsk(m) } };
  }

  account(accountId: string) {
    const a = this.s.accounts[accountId];
    if (!a) throw new Error(`unknown account ${accountId}`);
    return { accountId, cash: a.cash, heldCash: a.heldCash, freeCash: a.cash - a.heldCash, shares: { ...a.shares }, heldShares: { ...a.heldShares } };
  }

  openOrders(accountId: string) {
    const out: { orderId: number; kind: "limit" | "stop"; memeId: string; side: Side; price: number; qty: number; expiresAt: number | null }[] = [];
    for (const m of Object.values(this.s.memes)) {
      for (const o of [...m.bids, ...m.asks])
        if (o.accountId === accountId) out.push({ orderId: o.orderId, kind: "limit", memeId: o.memeId, side: o.side, price: o.px / COIN, qty: o.qty, expiresAt: o.expiresAt });
      for (const o of m.stops ?? [])
        if (o.accountId === accountId) out.push({ orderId: o.orderId, kind: "stop", memeId: o.memeId, side: o.side, price: o.stop, qty: o.qty, expiresAt: null });
    }
    return out.sort((a, b) => b.orderId - a.orderId);
  }

  hasAccount(accountId: string) {
    return accountId in this.s.accounts;
  }

  /**
   * What a market (or limit, with `price`) order would do right now, without doing it.
   * shortcut: clones the whole state per call; fine at alpha scale, narrow the clone if it shows up in profiles.
   */
  preview(accountId: string, memeId: string, side: Side, qty: number, price?: number): Preview {
    const sim = Engine.fromSnapshot(this.snapshot());
    const a = sim.s.accounts[accountId];
    const m = sim.s.memes[memeId];
    if (!a || !m || !(qty > 0)) return { qty: 0, total: 0, fee: 0, avgPrice: 0, lastPrice: 0, limitedBy: null };
    const out = emptyOutput();
    const em = new Emitter(out, "preview", sim.s.seq, sim.s.time);
    const limit = price === undefined ? INF : Math.round(price * COIN);
    const free = (a.shares[memeId] ?? 0) - (a.heldShares[memeId] ?? 0);
    const want = side === "sell" ? Math.min(qty, Math.max(0, free)) : qty;
    const filled = want > 0 ? sim.take(em, a, m, side, want, limit, sim.s.seq) : 0;
    const mine = out.fills.filter((f) => f.accountId === accountId);
    const gross = mine.reduce((s, f) => s + f.cost, 0);
    const fee = mine.reduce((s, f) => s + f.fee, 0);
    let limitedBy: Preview["limitedBy"] = null;
    if (filled < qty) {
      if (side === "sell" && free < qty) limitedBy = "shares";
      else if (price !== undefined) limitedBy = "limit";
      else if (side === "buy") limitedBy = "cash";
      else limitedBy = "liquidity";
    }
    return {
      qty: filled,
      total: side === "buy" ? gross + fee : gross - fee,
      fee,
      avgPrice: filled ? gross / COIN / filled : 0,
      lastPrice: out.trades.at(-1)?.price ?? 0,
      limitedBy,
    };
  }

  // ---------- time ----------

  /**
   * Applies every 2-second tick on the grid up to `time`. Ticks are implied by time, never stored:
   * an event at time t first applies all ticks ≤ t, so replay is identical however time was advanced.
   */
  advance(time: number): Output {
    const out = emptyOutput();
    this.tickTo(time, out);
    return out;
  }

  private tickTo(time: number, out: Output) {
    if (time < this.s.time) throw new Error("time went backwards");
    this.s.time = time;
    const P = this.s.params;
    const memes = Object.values(this.s.memes);
    for (let g = this.s.tick + P.tickMs; g <= time; g += P.tickMs) {
      this.s.tick = g;
      const em = new Emitter(out, `t${g}`, this.s.seq, g);
      for (const m of memes) {
        this.expire(em, m, g);
        this.drift(m, g);
        this.noCross(em, m);
        this.triggerStops(em, m);
        out.prices.push(this.quote(m, g));
      }
    }
  }

  private drift(m: Meme, g: number) {
    const P = this.s.params;
    const dtH = P.tickMs / 3_600_000;
    const vwap = this.vwapOf(m, g);
    const target = m.fairValue ** (1 - P.vwapWeight) * vwap ** P.vwapWeight;
    const [z, rng] = normal(m.rng);
    m.rng = rng;
    const pull = 1 - 2 ** (-dtH / P.driftHalfLifeHours);
    const heat = clipHeat(m.heat ?? 1);
    let lnP = Math.log(m.curve.price);
    lnP += pull * (Math.log(target) - lnP) + P.noisePerSqrtHour * heat * Math.sqrt(dtH) * z;
    m.curve.price = Math.max(PRICE_FLOOR, Math.exp(lnP));
    if (g % MINUTE === 0) {
      m.closes.push(m.curve.price);
      if (m.closes.length > 61) m.closes.shift();
      m.spread = Math.min(P.spreadBase + P.spreadVolCoef * hourlyVol(m.closes), P.spreadMax);
    }
  }

  private expire(em: Emitter, m: Meme, g: number) {
    for (const book of [m.bids, m.asks])
      for (const o of [...book]) if (o.expiresAt !== null && o.expiresAt <= g) this.removeOrder(em, o, "expired");
  }

  private vwapOf(m: Meme, now: number): number {
    while (m.vwap.length && m.vwap[0][0] <= now - DAY) m.vwap.shift();
    let pq = 0;
    let q = 0;
    for (const [, a, b] of m.vwap) (pq += a), (q += b);
    return q > 0 ? pq / q : m.fairValue;
  }

  // ---------- quotes ----------

  private houseAsk(m: Meme) {
    return m.curve.price * (1 + m.spread / 2);
  }
  private houseBid(m: Meme) {
    return m.curve.price * (1 - m.spread / 2);
  }

  private quote(m: Meme, time: number): PriceUpdate {
    const bid = Math.max(this.houseBid(m), m.bids[0] ? m.bids[0].px / COIN : 0);
    const ask = Math.min(this.houseAsk(m), m.asks[0] ? m.asks[0].px / COIN : INF);
    return { memeId: m.memeId, time, price: m.curve.price, bid, ask, mid: (bid + ask) / 2 };
  }

  // ---------- events ----------

  apply(ev: EngineEvent): Output {
    if (ev.seq !== this.s.seq + 1) throw new Error(`event seq ${ev.seq} after ${this.s.seq}`);
    if (ev.time < this.s.time) throw new Error(`event time went backwards at seq ${ev.seq}`);
    const out = emptyOutput();
    if (this.s.seq === 0) this.s.tick = ev.time - (ev.time % this.s.params.tickMs); // the tick grid starts at the first event
    this.tickTo(ev.time, out);
    this.s.seq = ev.seq;
    const em = new Emitter(out, `e${ev.seq}`, ev.seq, ev.time);
    const reject = (reason: string) => (out.rejects.push({ seq: ev.seq, reason }), out);

    switch (ev.type) {
      case "meme.list": {
        if (this.s.memes[ev.memeId]) return reject("meme already listed");
        const m: Meme = {
          memeId: ev.memeId,
          name: ev.name,
          curve: { price: ev.price, L: depthToL(ev.depth, ev.price) },
          spread: this.s.params.spreadBase,
          fairValue: ev.fairValue ?? ev.price,
          heat: 1,
          depth0: ev.depth,
          listedAt: ev.time,
          rng: seedFrom(ev.memeId),
          closes: [],
          vwap: [],
          bids: [],
          asks: [],
          stops: [],
        };
        this.s.memes[ev.memeId] = m;
        out.prices.push(this.quote(m, ev.time));
        return out;
      }
      case "account.open": {
        if (this.s.accounts[ev.accountId]) return reject("account exists");
        const cash = this.s.params.startingCash;
        this.s.accounts[ev.accountId] = { accountId: ev.accountId, cash, heldCash: 0, shares: {}, heldShares: {} };
        em.post("mint", "coin", -cash);
        em.post(`player:${ev.accountId}`, "coin", cash);
        return out;
      }
      case "order.market":
      case "order.limit": {
        const a = this.s.accounts[ev.accountId];
        const m = this.s.memes[ev.memeId];
        if (!a) return reject("unknown account");
        if (!m) return reject("unknown meme");
        if (!Number.isSafeInteger(ev.qty) || ev.qty <= 0) return reject("quantity must be a whole number above 0");
        let limit = INF;
        let hold = 0;
        if (ev.type === "order.limit") {
          const px = Math.round(ev.price * COIN);
          if (!(px >= PRICE_STEP) || px % PRICE_STEP !== 0 || Math.abs(px / COIN - ev.price) > 1e-9)
            return reject("price must be at least 0.01 and in steps of 0.01");
          if (ev.expiresAt != null && ev.expiresAt <= ev.time) return reject("expiry must be in the future");
          limit = px;
          hold = px + Math.ceil((px * this.s.params.takerFeeBps) / 10_000);
          if (ev.side === "buy" && ev.qty * hold > a.cash - a.heldCash) return reject("not enough free cash for this order");
        }
        const freeShares = (a.shares[ev.memeId] ?? 0) - (a.heldShares[ev.memeId] ?? 0);
        if (ev.side === "sell" && freeShares <= 0) return reject("you have no free shares to sell");
        if (ev.side === "sell" && ev.type === "order.limit" && ev.qty > freeShares) return reject("not enough free shares for this order");

        const qty = ev.side === "sell" ? Math.min(ev.qty, freeShares) : ev.qty;
        const filled = this.take(em, a, m, ev.side, qty, limit, ev.seq);
        const left = qty - filled;
        if (ev.type === "order.limit" && left > 0) {
          this.rest(m, a, { orderId: ev.seq, accountId: a.accountId, memeId: m.memeId, side: ev.side, px: limit, qty: left, holdPerShare: hold, expiresAt: ev.expiresAt ?? null });
          out.orders.push({ orderId: ev.seq, accountId: a.accountId, memeId: m.memeId, status: "open", remaining: left });
        } else if (ev.type === "order.limit") out.orders.push({ orderId: ev.seq, accountId: a.accountId, memeId: m.memeId, status: "filled", remaining: 0 });
        if (filled === 0 && ev.type === "order.market") return reject(ev.side === "buy" ? "not enough free cash for even one share" : "nobody is buying right now");
        this.noCross(em, m);
        this.triggerStops(em, m);
        out.prices.push(this.quote(m, ev.time));
        return out;
      }
      case "order.stop": {
        const a = this.s.accounts[ev.accountId];
        const m = this.s.memes[ev.memeId];
        if (!a) return reject("unknown account");
        if (!m) return reject("unknown meme");
        if (!Number.isSafeInteger(ev.qty) || ev.qty <= 0) return reject("quantity must be a whole number above 0");
        const px = Math.round(ev.stopPrice * COIN);
        if (!(px >= PRICE_STEP) || px % PRICE_STEP !== 0) return reject("trigger price must be at least 0.01 and in steps of 0.01");
        const mid = this.quote(m, ev.time).mid;
        if (ev.side === "sell" && ev.stopPrice >= mid) return reject("a sell stop must be below the current price");
        if (ev.side === "buy" && ev.stopPrice <= mid) return reject("a buy stop must be above the current price");
        m.stops.push({ orderId: ev.seq, accountId: a.accountId, memeId: m.memeId, side: ev.side, stop: px / COIN, qty: ev.qty });
        this.s.orderIndex[ev.seq] = m.memeId;
        out.orders.push({ orderId: ev.seq, accountId: a.accountId, memeId: m.memeId, status: "open", remaining: ev.qty });
        return out;
      }
      case "meme.features": {
        const m = this.s.memes[ev.memeId];
        if (!m) return reject("unknown meme");
        if (!(ev.fairValue > 0) || !(ev.heat >= 0)) return reject("fair value and heat must be positive");
        m.fairValue = Math.max(1, ev.fairValue);
        m.heat = ev.heat;
        // Depth follows heat (PRD §6.2): Y = Y₀ · clip(H, 0.2, 5). Rescale L with the price held fixed; not a trade.
        m.curve.L = depthToL((m.depth0 ?? 500_000) * clipHeat(ev.heat), m.curve.price);
        this.noCross(em, m);
        this.triggerStops(em, m);
        out.prices.push(this.quote(m, ev.time));
        return out;
      }
      case "order.cancel": {
        const memeId = this.s.orderIndex[ev.orderId];
        const m = memeId ? this.s.memes[memeId] : undefined;
        const stop = m?.stops.find((x) => x.orderId === ev.orderId);
        if (m && stop && stop.accountId === ev.accountId) {
          m.stops.splice(m.stops.indexOf(stop), 1);
          delete this.s.orderIndex[stop.orderId];
          out.orders.push({ orderId: stop.orderId, accountId: stop.accountId, memeId: m.memeId, status: "cancelled", remaining: stop.qty });
          return out;
        }
        const o = m && [...m.bids, ...m.asks].find((x) => x.orderId === ev.orderId);
        if (!m || !o || o.accountId !== ev.accountId) return reject("no such open order");
        this.removeOrder(em, o, "cancelled");
        out.prices.push(this.quote(m, ev.time));
        return out;
      }
    }
  }

  /**
   * Fires every stop whose trigger the mid has reached (oldest first), as a market order. A fired
   * stop moves the price, which can fire the next one, so this loops until nothing else triggers.
   */
  private triggerStops(em: Emitter, m: Meme) {
    for (let guard = 0; guard < 1_000 && m.stops.length; guard++) {
      const mid = this.quote(m, em.time).mid;
      const hit = m.stops.find((o) => (o.side === "buy" ? mid >= o.stop : mid <= o.stop));
      if (!hit) return;
      m.stops.splice(m.stops.indexOf(hit), 1);
      delete this.s.orderIndex[hit.orderId];
      em.out.orders.push({ orderId: hit.orderId, accountId: hit.accountId, memeId: m.memeId, status: "triggered", remaining: hit.qty });
      const a = this.s.accounts[hit.accountId];
      const free = (a.shares[m.memeId] ?? 0) - (a.heldShares[m.memeId] ?? 0);
      const qty = hit.side === "sell" ? Math.min(hit.qty, free) : hit.qty;
      if (qty > 0) this.take(em, a, m, hit.side, qty, INF, hit.orderId);
      this.noCross(em, m);
    }
  }

  // ---------- matching ----------

  /**
   * The router (PRD §6.4): fills `qty` step by step from whichever of book and house is cheaper,
   * players winning ties, never past `limit` (µc; Infinity for market orders) and never past the
   * taker's free cash. Returns shares filled.
   */
  private take(em: Emitter, a: Account, m: Meme, side: Side, qty: number, limit: number, orderId: number): number {
    const feeRate = this.s.params.takerFeeBps / 10_000;
    let filled = 0;
    while (filled < qty) {
      const remaining = qty - filled;
      if (side === "buy") {
        const best = m.asks[0];
        const bookPx = best ? best.px : INF;
        const houseAsk = this.houseAsk(m) * COIN;
        if (Math.min(bookPx, houseAsk) > limit) break;
        const free = a.cash - a.heldCash;
        if (best && (bookPx <= houseAsk || this.oneHouseShareCost(m) > bookPx)) {
          const perShare = bookPx + Math.ceil(bookPx * feeRate);
          const q = Math.min(remaining, best.qty, Math.floor(free / perShare));
          if (q <= 0) break;
          this.bookTrade(em, m, best, a, q, "buy");
          filled += q;
        } else {
          const stop = Math.min(bookPx, limit);
          const affordable = maxBuyable(m.curve, free / COIN, m.spread / 2, feeRate);
          let d = Math.min(remaining, affordable, stop === INF ? remaining : this.sharesToAsk(m, stop / COIN));
          if (d <= 0) {
            // A whole share would overshoot the stop on the margin; take it if its average still fits.
            if (affordable >= 1 && this.oneHouseShareCost(m) <= stop) d = 1;
            else break;
          }
          // maxBuyable is a float estimate; step down if rounding tips it over the cash.
          while (d > 0 && !this.houseSells(em, m, a, d, true, null, orderId)) d--;
          if (d <= 0) break;
          filled += d;
        }
      } else {
        const best = m.bids[0];
        const bookPx = best ? best.px : 0;
        const houseBid = this.houseBid(m) * COIN;
        const floor = limit === INF ? 0 : limit;
        if (Math.max(bookPx, houseBid) < floor) break;
        if (best && (bookPx >= houseBid || this.oneHouseShareProceeds(m) < bookPx)) {
          const q = Math.min(remaining, best.qty);
          this.bookTrade(em, m, best, a, q, "sell");
          filled += q;
        } else {
          const stop = Math.max(bookPx, floor);
          let d = Math.min(remaining, stop <= 0 ? this.sharesToFloor(m) : this.sharesToBid(m, stop / COIN));
          if (d <= 0) {
            if (this.sharesToFloor(m) >= 1 && this.oneHouseShareProceeds(m) >= stop) d = 1;
            else break;
          }
          this.houseBuys(em, m, a, d, true, null, orderId);
          filled += d;
        }
      }
    }
    return filled;
  }

  /** Average µc a single share costs from the house right now (spread included). */
  private oneHouseShareCost(m: Meme) {
    return coinsBetween(m.curve.L, m.curve.price, priceAfter(m.curve, 1)) * (1 + m.spread / 2) * COIN;
  }
  private oneHouseShareProceeds(m: Meme) {
    if (this.sharesToFloor(m) < 1) return 0;
    return coinsBetween(m.curve.L, priceAfter(m.curve, -1), m.curve.price) * (1 - m.spread / 2) * COIN;
  }

  /** Whole shares the house can sell before its ask reaches `ask` (coins). */
  private sharesToAsk(m: Meme, ask: number) {
    const pStop = ask / (1 + m.spread / 2);
    if (pStop <= m.curve.price) return 0;
    return Math.max(0, Math.floor(m.curve.L * (1 / Math.sqrt(m.curve.price) - 1 / Math.sqrt(pStop))));
  }
  /** Whole shares the house can buy before its bid falls to `bid` (coins), never below the price floor. */
  private sharesToBid(m: Meme, bid: number) {
    const pStop = Math.max(bid / (1 - m.spread / 2), PRICE_FLOOR);
    if (pStop >= m.curve.price) return 0;
    return Math.max(0, Math.floor(m.curve.L * (1 / Math.sqrt(pStop) - 1 / Math.sqrt(m.curve.price))));
  }
  private sharesToFloor(m: Meme) {
    return this.sharesToBid(m, 0);
  }

  /**
   * The house sells `d` shares to `a` along its curve. A taker pays the fee; a resting buyer (maker,
   * filled by the no-cross rule) doesn't, and its held-back cash is released. Returns false, changing
   * nothing, if the buyer can't pay.
   */
  private houseSells(em: Emitter, m: Meme, a: Account, d: number, taker: boolean, order: Order | null, orderId: number): boolean {
    const p1 = priceAfter(m.curve, d);
    const cost = Math.ceil(coinsBetween(m.curve.L, m.curve.price, p1) * (1 + m.spread / 2) * COIN);
    const fee = taker ? Math.ceil((cost * this.s.params.takerFeeBps) / 10_000) : 0;
    const release = order ? order.holdPerShare * d : 0;
    if (cost + fee > a.cash - a.heldCash + release) return false;
    a.heldCash -= release;
    m.curve.price = p1;
    a.cash -= cost + fee;
    a.shares[m.memeId] = (a.shares[m.memeId] ?? 0) + d;
    const player = `player:${a.accountId}`;
    em.post(player, "coin", -(cost + fee));
    em.post("house", "coin", cost);
    em.post("sink", "coin", fee);
    em.post(player, `share:${m.memeId}`, d);
    em.post("house", `share:${m.memeId}`, -d);
    this.record(em, m, a, "buy", d, cost, fee, taker ? "taker" : "maker", orderId, this.houseAsk(m));
    return true;
  }

  /** The house buys `d` shares from `a` along its curve. */
  private houseBuys(em: Emitter, m: Meme, a: Account, d: number, taker: boolean, order: Order | null, orderId: number) {
    const p1 = priceAfter(m.curve, -d);
    const proceeds = Math.floor(coinsBetween(m.curve.L, p1, m.curve.price) * (1 - m.spread / 2) * COIN);
    const fee = taker ? Math.ceil((proceeds * this.s.params.takerFeeBps) / 10_000) : 0;
    if (order) a.heldShares[m.memeId] -= d;
    m.curve.price = p1;
    a.cash += proceeds - fee;
    a.shares[m.memeId] -= d;
    const player = `player:${a.accountId}`;
    em.post(player, "coin", proceeds - fee);
    em.post("house", "coin", -proceeds);
    em.post("sink", "coin", fee);
    em.post(player, `share:${m.memeId}`, -d);
    em.post("house", `share:${m.memeId}`, d);
    this.record(em, m, a, "sell", d, proceeds, fee, taker ? "taker" : "maker", orderId, this.houseBid(m));
  }

  /** Player-to-player trade at the resting order's price. The taker pays the fee; the maker pays none. */
  private bookTrade(em: Emitter, m: Meme, resting: Order, taker: Account, q: number, takerSide: Side) {
    const maker = this.s.accounts[resting.accountId];
    const notional = resting.px * q;
    const fee = Math.ceil((notional * this.s.params.takerFeeBps) / 10_000);
    const [buyer, seller] = takerSide === "buy" ? [taker, maker] : [maker, taker];
    const buyerPays = notional + (takerSide === "buy" ? fee : 0);
    const sellerGets = notional - (takerSide === "sell" ? fee : 0);
    if (takerSide === "buy") maker.heldShares[m.memeId] -= q;
    else maker.heldCash -= resting.holdPerShare * q;
    buyer.cash -= buyerPays;
    seller.cash += sellerGets;
    buyer.shares[m.memeId] = (buyer.shares[m.memeId] ?? 0) + q;
    seller.shares[m.memeId] -= q;
    em.post(`player:${buyer.accountId}`, "coin", -buyerPays);
    em.post(`player:${seller.accountId}`, "coin", sellerGets);
    em.post("sink", "coin", fee);
    em.post(`player:${buyer.accountId}`, `share:${m.memeId}`, q);
    em.post(`player:${seller.accountId}`, `share:${m.memeId}`, -q);
    const price = resting.px / COIN;
    em.out.trades.push({ memeId: m.memeId, time: em.time, qty: q, price });
    this.addVwap(m, em.time, price, q);
    const base = { seq: em.seq, time: em.time, memeId: m.memeId, qty: q, cost: notional, source: "book" as const };
    em.out.fills.push({ ...base, accountId: taker.accountId, orderId: em.seq, side: takerSide, fee, role: "taker" });
    em.out.fills.push({ ...base, accountId: maker.accountId, orderId: resting.orderId, side: resting.side, fee: 0, role: "maker" });
    resting.qty -= q;
    if (resting.qty === 0) this.removeOrder(em, resting, "filled");
    else em.out.orders.push({ orderId: resting.orderId, accountId: resting.accountId, memeId: m.memeId, status: "open", remaining: resting.qty });
  }

  /** A house fill: the account's fill (average price) and the trade, whose price is the last share's (the LTP). */
  private record(em: Emitter, m: Meme, a: Account, side: Side, qty: number, cost: number, fee: number, role: "taker" | "maker", orderId: number, lastPrice: number) {
    em.out.fills.push({ seq: em.seq, time: em.time, memeId: m.memeId, accountId: a.accountId, orderId, side, qty, cost, fee, source: "house", role });
    em.out.trades.push({ memeId: m.memeId, time: em.time, qty, price: lastPrice });
    this.addVwap(m, em.time, cost / COIN / qty, qty);
  }

  private addVwap(m: Meme, time: number, price: number, qty: number) {
    const minute = time - (time % MINUTE);
    const last = m.vwap.at(-1);
    if (last && last[0] === minute) (last[1] += price * qty), (last[2] += qty);
    else m.vwap.push([minute, price * qty, qty]);
  }

  /** Puts the unfilled part of a limit order on the book and holds back what it needs. */
  private rest(m: Meme, a: Account, o: Order) {
    if (o.side === "buy") {
      a.heldCash += o.holdPerShare * o.qty;
      const i = m.bids.findIndex((x) => x.px < o.px);
      m.bids.splice(i === -1 ? m.bids.length : i, 0, o);
    } else {
      a.heldShares[o.memeId] = (a.heldShares[o.memeId] ?? 0) + o.qty;
      const i = m.asks.findIndex((x) => x.px > o.px);
      m.asks.splice(i === -1 ? m.asks.length : i, 0, o);
    }
    this.s.orderIndex[o.orderId] = m.memeId;
  }

  private removeOrder(em: Emitter, o: Order, status: "filled" | "cancelled" | "expired") {
    const m = this.s.memes[o.memeId];
    const a = this.s.accounts[o.accountId];
    const book = o.side === "buy" ? m.bids : m.asks;
    book.splice(book.indexOf(o), 1);
    if (o.side === "buy") a.heldCash -= o.holdPerShare * o.qty;
    else a.heldShares[o.memeId] -= o.qty;
    delete this.s.orderIndex[o.orderId];
    em.out.orders.push({ orderId: o.orderId, accountId: o.accountId, memeId: o.memeId, status, remaining: status === "filled" ? 0 : o.qty });
  }

  /**
   * No-cross rule (PRD §6.5): after anything moves the house, resting orders that cross its quote
   * fill against the house at once, as makers, at the curve price (never worse than their limit).
   */
  private noCross(em: Emitter, m: Meme) {
    for (let guard = 0; guard < 10_000; guard++) {
      const bid = m.bids[0];
      if (bid && bid.px >= this.houseAsk(m) * COIN) {
        let d = Math.min(bid.qty, this.sharesToAsk(m, bid.px / COIN));
        if (d <= 0) d = this.oneHouseShareCost(m) <= bid.px ? 1 : 0;
        if (d <= 0) return;
        if (!this.houseSells(em, m, this.s.accounts[bid.accountId], d, false, bid, bid.orderId)) return;
        bid.qty -= d;
        if (bid.qty === 0) this.removeOrder(em, bid, "filled");
        else em.out.orders.push({ orderId: bid.orderId, accountId: bid.accountId, memeId: m.memeId, status: "open", remaining: bid.qty });
        continue;
      }
      const ask = m.asks[0];
      if (ask && ask.px <= this.houseBid(m) * COIN) {
        let d = Math.min(ask.qty, this.sharesToBid(m, ask.px / COIN));
        if (d <= 0) d = this.oneHouseShareProceeds(m) >= ask.px ? 1 : 0;
        if (d <= 0) return;
        this.houseBuys(em, m, this.s.accounts[ask.accountId], d, false, ask, ask.orderId);
        ask.qty -= d;
        if (ask.qty === 0) this.removeOrder(em, ask, "filled");
        else em.out.orders.push({ orderId: ask.orderId, accountId: ask.accountId, memeId: m.memeId, status: "open", remaining: ask.qty });
        continue;
      }
      return;
    }
  }
}
