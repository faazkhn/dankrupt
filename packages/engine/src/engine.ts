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
  initialMargin: number; // m_I
  maintenanceMargin: number; // m_M
  liquidationFeeBps: number;
  borrowBasePerHour: number; // r0, fraction per hour
  borrowSlopePerHour: number; // r1
  resetBelow: number; // µc of equity under which a reset is allowed
  dormantHeat: number;
  dormantDays: number;
  reviveZ: number;
  reviveAcc: number; // a_rev, tuned in simulation
  dormantBorrowMultiplier: number;
  dormantShortMaxU: number;
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
  initialMargin: 0.5,
  maintenanceMargin: 0.3,
  liquidationFeeBps: 100,
  borrowBasePerHour: 0.00005,
  borrowSlopePerHour: 0.0005,
  resetBelow: 1_000 * COIN,
  dormantHeat: 0.3,
  dormantDays: 7,
  reviveZ: 2,
  reviveAcc: 0.05,
  dormantBorrowMultiplier: 5,
  dormantShortMaxU: 0.5,
};

/** Allowed ranges for live-tunable params; anything outside is rejected. */
export const PARAM_BOUNDS: Partial<Record<keyof Params, [number, number]>> = {
  takerFeeBps: [0, 100],
  spreadBase: [0, 0.05],
  spreadVolCoef: [0, 5],
  spreadMax: [0.001, 0.2],
  driftHalfLifeHours: [0.5, 168],
  vwapWeight: [0, 1],
  noisePerSqrtHour: [0, 0.05],
  initialMargin: [0.1, 2],
  maintenanceMargin: [0.05, 1],
  liquidationFeeBps: [0, 1_000],
  borrowBasePerHour: [0, 0.01],
  borrowSlopePerHour: [0, 0.05],
  dormantHeat: [0, 2],
  dormantDays: [1, 60],
  reviveZ: [0, 10],
  reviveAcc: [-1, 5],
  dormantBorrowMultiplier: [1, 50],
  dormantShortMaxU: [0, 5],
};

const MINUTE = 60_000;
const DAY = 86_400_000;
const INF = Number.POSITIVE_INFINITY;
const MARK_EMA_MS = 5 * MINUTE;
const clipHeat = (h: number) => Math.min(5, Math.max(0.2, h));

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
  /** Sells: how many of the remaining shares are owned shares held back (the rest are short sales). */
  heldLong: number;
  /** Sells: µc of margin held back per remaining short share. */
  marginPerShare: number;
  expiresAt: number | null;
};

/** A stop-market order waiting for the mid to reach its trigger. Holds nothing until it fires. */
type Stop = { orderId: number; accountId: string; memeId: string; side: Side; stop: number; qty: number };

export type MemeStatus = "preopen" | "active" | "dormant" | "halted";

type Meme = {
  memeId: string;
  name: string;
  status: MemeStatus;
  /** When pre-open ends and the house opens. */
  opensAt: number | null;
  /** When heat last dropped under the dormancy threshold (reset by any warm update). */
  coldSince: number | null;
  dormantSince: number | null;
  /** When the meme last revived (drives the Comeback banner). */
  comebackAt: number | null;
  curve: Curve;
  spread: number;
  /** Data-driven fair value F, from `meme.features` events (the listing price until the first one). */
  fairValue: number;
  /** Heat H (PRD §5 step 4); 1 until the first features update. Scales depth and noise. */
  heat: number;
  /** Y₀: depth in coins at heat 1, from the listing. */
  depth0: number;
  float?: number;
  borrowPool?: number;
  bandReference?: number;
  volatilityAuction?: boolean;
  listedAt: number;
  rng: number;
  /** Last 61 one-minute closes of the house price, for realised volatility. */
  closes: number[];
  /** Trades bucketed per minute for the 24h VWAP: [minuteStart, Σ price·qty, Σ qty]. */
  vwap: [number, number, number][];
  /** 5-minute EMA of traded prices (for the mark), and when it was last updated. */
  emaLast: number | null;
  emaAt: number;
  longOI: number;
  shortOI: number;
  /** Coins the house has taken in (positive) or paid out on this meme, µc. With its shares at mark, its P&L. */
  houseCash: number;
  /** Best first: bids by price desc, asks by price asc; time priority (orderId) within a price. */
  bids: Order[];
  asks: Order[];
  stops: Stop[];
};

/** Bookkeeping for one open position, for round-trip trades (styles, share cards). */
type Position = { openedAt: number; flow: number; peak: number; basis: number };

type Account = {
  accountId: string;
  cash: number;
  /** Cash held back by resting buy orders. */
  heldCash: number;
  /** Margin held back by resting short sells. */
  heldMargin: number;
  /** Signed: negative is a short. */
  shares: Record<string, number>;
  /** Owned shares held back by resting sell orders. */
  heldShares: Record<string, number>;
  pos: Record<string, Position>;
  resets: number;
};

type State = {
  liquidityRules?: boolean;
  basket?: { level: number; mids: Record<string, number> };
  dank?: { level: number; rng: number };
  seq: number;
  time: number;
  /** Grid time of the last applied tick. */
  tick: number;
  params: Params;
  memes: Record<string, Meme>;
  accounts: Record<string, Account>;
  /** orderId → memeId for every resting order and stop. */
  orderIndex: Record<string, string>;
  /** Accounts holding at least one short, for margin checks. */
  shorts: Record<string, true>;
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
  /** How many of the shares sold would be a short sale. */
  shortQty: number;
  /** Why it would stop short of the requested quantity, if it would. */
  limitedBy: "cash" | "shares" | "margin" | "limit" | "liquidity" | null;
};

/**
 * The deterministic exchange core. Feed it events in sequence order; it mutates its state and
 * returns what happened. Replaying the same events always yields the same snapshot.
 */
export class Engine {
  private s: State;

  constructor(params: Params = DEFAULT_PARAMS) {
    this.s = { seq: 0, time: 0, tick: 0, params, memes: {}, accounts: {}, orderIndex: {}, shorts: {} };
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

  get dank() {
    return this.s.dank ? { level: this.s.basket?.level ?? this.s.dank.level, time: this.s.tick } : null;
  }

  get liquidityOpen() { return !!this.s.liquidityRules; }

  get basketOpen() { return !!this.s.basket; }

  get seq() {
    return this.s.seq;
  }

  get time() {
    return this.s.time;
  }

  get params(): Params {
    return { ...this.s.params };
  }

  // ---------- reads ----------

  meme(memeId: string) {
    const m = this.s.memes[memeId];
    if (!m) throw new Error(`unknown meme ${memeId}`);
    return {
      ...this.quote(m, this.s.time),
      name: m.name,
      status: m.status,
      opensAt: m.opensAt,
      comebackAt: m.comebackAt ?? null,
      fairValue: this.fair(m),
      rawFairValue: m.fairValue,
      heat: m.heat,
      listedAt: m.listedAt,
      mark: this.mark(m),
      borrowPerHour: this.borrowRate(m),
    };
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
    return { float: m.float, borrowAvailable: m.borrowPool === undefined ? undefined : Math.max(0,m.borrowPool-m.shortOI-this.reservedBorrows(m)),
      auction: m.status === "preopen" && this.liquidityOpen ? (m.volatilityAuction ? "volatility" : "opening") : null,
      bids: levels(m.bids), asks: levels(m.asks), house: m.status === "preopen" ? null : { bid: this.houseBid(m), ask: this.houseAsk(m) } };
  }

  /** Money view of an account. µc throughout. */
  account(accountId: string) {
    const a = this.s.accounts[accountId];
    if (!a) throw new Error(`unknown account ${accountId}`);
    const r = this.risk(a);
    const positions = Object.entries(a.shares)
      .filter(([, q]) => q !== 0)
      .map(([memeId, qty]) => {
        const p = a.pos[memeId];
        const mark = this.mark(this.s.memes[memeId]);
        return { memeId, qty, mark, value: qty * mark, openedAt: p?.openedAt ?? 0, pnl: (p?.flow ?? 0) + qty * mark, basis: p?.basis ?? 0 };
      });
    return {
      accountId,
      cash: a.cash,
      heldCash: a.heldCash,
      heldMargin: a.heldMargin,
      freeCash: this.freeCash(a),
      equity: r.equity,
      initialMargin: r.im,
      maintenance: r.mr,
      shares: { ...a.shares },
      heldShares: { ...a.heldShares },
      positions,
      resets: a.resets ?? 0,
      canReset: this.canReset(a),
    };
  }

  accounts() {
    return Object.keys(this.s.accounts);
  }

  /** Economy totals for the operator dashboard, µc: coin supply (player equity) and the house's P&L per meme. */
  economy() {
    let supply = 0;
    for (const a of Object.values(this.s.accounts)) supply += this.risk(a).equity;
    const house = Object.values(this.s.memes).map((m) => {
      const shares = m.shortOI - m.longOI; // the house holds the other side of every net player position
      const mark = m.status === "halted" ? 0 : this.mark(m);
      return { memeId: m.memeId, name: m.name, status: m.status, cash: m.houseCash ?? 0, shares, pnl: (m.houseCash ?? 0) + shares * mark };
    });
    return { supply, accounts: Object.keys(this.s.accounts).length, house };
  }

  openOrders(accountId: string) {
    const out: { orderId: number; kind: "limit" | "stop"; memeId: string; side: Side; price: number; qty: number; expiresAt: number | null }[] = [];
    for (const m of Object.values(this.s.memes)) {
      for (const o of [...m.bids, ...m.asks])
        if (o.accountId === accountId) out.push({ orderId: o.orderId, kind: "limit", memeId: o.memeId, side: o.side, price: o.px / COIN, qty: o.qty, expiresAt: o.expiresAt });
      for (const o of m.stops)
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
    const none: Preview = { qty: 0, total: 0, fee: 0, avgPrice: 0, lastPrice: 0, shortQty: 0, limitedBy: null };
    const sim = Engine.fromSnapshot(this.snapshot());
    const a = sim.s.accounts[accountId];
    const m = sim.s.memes[memeId];
    if (!a || !m || !(qty > 0)) return none;
    const out = emptyOutput();
    const em = new Emitter(out, "preview", sim.s.seq, sim.s.time);
    const limit = price === undefined ? INF : Math.round(price * COIN);
    const before = a.shares[memeId] ?? 0;
    const cap = side === "sell" ? sim.sellCapacity(a, m) : null;
    const want = Math.min(qty, cap ? cap.total : qty);
    const filled = want > 0 && !(sim.liquidityOpen && m.status === "preopen") ? sim.take(em, a, m, side, want, limit, sim.s.seq) : 0;
    const mine = out.fills.filter((f) => f.accountId === accountId);
    const gross = mine.reduce((s, f) => s + f.cost, 0);
    const fee = mine.reduce((s, f) => s + f.fee, 0);
    let limitedBy: Preview["limitedBy"] = null;
    if (filled < qty) {
      if (side === "sell" && want < qty) limitedBy = "margin"; // owned shares ran out and margin caps the short sale
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
      shortQty: side === "sell" ? Math.max(0, filled - Math.max(0, before - (a.heldShares[memeId] ?? 0))) : 0,
      limitedBy,
    };
  }

  private limitHold(px: number) {
    return px + Math.ceil(px * this.s.params.takerFeeBps / 10_000);
  }

  maxLimitBuy(accountId: string, memeId: string, price: number, cap: number) {
    const a = this.s.accounts[accountId];
    const m = this.s.memes[memeId];
    if (!a || !m) return 0;
    const hold = this.limitHold(Math.round(price * COIN));
    const free = this.freeCash(a);
    const release = this.coverRelease(a, m, cap);
    const upper = Math.min(cap, Math.floor((free + release) / hold));
    if (upper <= 0) return 0;
    if (upper * hold <= free + this.coverRelease(a, m, upper)) return upper;
    const net = hold - this.coverRelease(a, m, 1);
    return net > 0 ? Math.max(0, Math.min(upper, Math.floor(free / net))) : 0;
  }

  /** Fair value with dormancy decay (PRD §8.5): halves every 7 days while dormant, never below 1. */
  private fair(m: Meme): number {
    if (m.status !== "dormant" || m.dormantSince === null) return m.fairValue;
    const days = (this.s.time - m.dormantSince) / DAY;
    return Math.max(1, m.fairValue * 2 ** (-days / this.s.params.dormantDays));
  }

  // ---------- risk ----------

  /** Mark price (PRD §6.6): median of mid, the 5-minute EMA of traded prices, and fair value. */
  private mark(m: Meme): number {
    const mid = this.quote(m, this.s.time).mid;
    const v = [mid, m.emaLast ?? mid, this.fair(m)].sort((x, y) => x - y);
    return v[1] * COIN;
  }

  private risk(a: Account) {
    let value = 0;
    let shortValue = 0;
    for (const [memeId, q] of Object.entries(a.shares)) {
      if (q === 0) continue;
      const mk = this.mark(this.s.memes[memeId]);
      value += q * mk;
      if (q < 0) shortValue += -q * mk;
    }
    const P = this.s.params;
    return { equity: a.cash + value, im: P.initialMargin * shortValue + a.heldMargin, mr: P.maintenanceMargin * shortValue, shortValue };
  }

  /** Cash a player can spend on buys: cash minus short proceeds + margin locked, minus held-back cash and margin. */
  private freeCash(a: Account): number {
    const r = this.risk(a);
    return a.cash - a.heldCash - a.heldMargin - r.shortValue * (1 + this.s.params.initialMargin);
  }

  /** How much a sell can do: free owned shares first, then short sales the margin allows. */
  private setFloat(m: Meme) {
    const virtual = Math.ceil(m.curve.L / Math.sqrt(m.curve.price));
    m.float = Math.max(virtual, m.longOI - m.shortOI + virtual);
    m.borrowPool = m.shortOI + this.reservedBorrows(m) + Math.ceil(m.float / 4);
    m.bandReference = m.curve.price;
  }

  private reservedBorrows(m: Meme) {
    return m.asks.reduce((sum, o) => sum + o.qty - o.heldLong, 0);
  }

  private houseInventory(m: Meme) {
    return m.float === undefined ? INF : Math.max(0, m.float - m.longOI + m.shortOI);
  }

  private sellCapacity(a: Account, m: Meme) {
    const owned = Math.max(0, (a.shares[m.memeId] ?? 0) - (a.heldShares[m.memeId] ?? 0));
    const r = this.risk(a);
    const perShare = this.s.params.initialMargin * this.mark(m);
    // Dormant memes block new shorts once utilisation passes the cap (PRD §7.4): no farming the decay.
    const blocked = m.status === "dormant" && this.utilisation(m) > this.s.params.dormantShortMaxU;
    const short = perShare > 0 && !blocked ? Math.max(0, Math.floor((r.equity - r.im) / perShare)) : 0;
    const available = m.borrowPool === undefined ? short : Math.min(short, Math.max(0, m.borrowPool - m.shortOI - this.reservedBorrows(m)));
    return { long: owned, short: available, total: owned + available };
  }

  private canReset(a: Account) {
    const r = this.risk(a);
    return r.equity < this.s.params.resetBelow && Object.values(a.shares).every((q) => q === 0);
  }

  /** Short-sale borrow rate per hour (PRD §7.3): r₀ + r₁·U, U = short OI / (long OI + house virtual shares). */
  private borrowRate(m: Meme) {
    const r = this.s.params.borrowBasePerHour + this.s.params.borrowSlopePerHour * this.utilisation(m);
    return m.status === "dormant" ? r * this.s.params.dormantBorrowMultiplier : r;
  }

  private utilisation(m: Meme) {
    const x = m.curve.L / Math.sqrt(m.curve.price);
    return m.shortOI / (m.longOI + x);
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
    const P = this.s.params;
    const memes = Object.values(this.s.memes);
    for (let g = this.s.tick + P.tickMs; g <= time; g += P.tickMs) {
      this.s.tick = g;
      this.s.time = g;
      const em = new Emitter(out, `t${g}`, this.s.seq, g);
      let marketReturn = 0;
      if (this.s.dank) {
        const index = this.s.dank;
        const [shock, rng] = normal(index.rng);
        const hours = P.tickMs / 3_600_000;
        marketReturn = (1 - 2 ** (-hours / 24)) * Math.log(1000 / index.level) + 0.025 * Math.sqrt(hours) * shock;
        index.level *= Math.exp(marketReturn);
        index.rng = rng;
        if (!this.s.basket) (out.dankTicks ??= []).push({ time: g, price: index.level });
      }
      let returnSum = 0;
      let members = 0;
      for (const m of memes) {
        if (m.status === "halted") continue;
        this.expire(em, m, g);
        if (m.status === "preopen") {
          if (m.opensAt === null || g < m.opensAt) {
            this.checkMargins(em, m);
            out.prices.push(this.quote(m, g));
            continue;
          }
          if (this.liquidityOpen) this.clearAuction(em, m);
          m.volatilityAuction = false;
          m.status = "active"; // IPO: the house opens at the listing price; crossing orders fill below via no-cross
        }
        if (this.liquidityOpen && m.status === "active" && m.bandReference && Math.abs(m.curve.price / m.bandReference - 1) >= 0.1) {
          m.status = "preopen";
          m.opensAt = g + MINUTE;
          m.volatilityAuction = true;
          out.prices.push(this.quote(m, g));
          continue;
        }
        if (this.liquidityOpen && g % MINUTE === 0) m.bandReference = m.curve.price;
        this.drift(m, g, marketReturn * (this.s.basket ? 0.7 + (seedFrom(m.memeId) >>> 0) % 61 / 100 : 1));
        this.noCross(em, m);
        this.triggerStops(em, m);
        this.checkMargins(em, m);
        const quote = this.quote(m, g);
        out.prices.push(quote);
        if (this.s.basket) {
          if (m.status === "active") {
            const last = this.s.basket.mids[m.memeId];
            if (last) { returnSum += quote.mid / last - 1; members++; }
            this.s.basket.mids[m.memeId] = quote.mid;
          } else delete this.s.basket.mids[m.memeId];
        }
      }
      if (this.s.basket) {
        this.s.basket.level *= 1 + returnSum / Math.max(1, members);
        (out.dankTicks ??= []).push({ time: g, price: this.s.basket.level });
      }
      if (g % MINUTE === 0) {
        this.chargeBorrow(em);
        for (const m of memes) this.checkDormancy(m, g);
      }
    }
    this.s.time = time;
  }

  private clearAuction(em: Emitter, m: Meme) {
    const reference = m.curve.price * COIN;
    let clearing = reference, volume = 0, imbalance = Infinity;
    if (m.bids.length && m.asks.length && m.bids[0].px >= m.asks[0].px) {
      for (const px of new Set([...m.bids, ...m.asks].map(o => o.px))) {
        const buy = m.bids.reduce((s,o) => s + (o.px >= px ? o.qty : 0), 0);
        const sell = m.asks.reduce((s,o) => s + (o.px <= px ? o.qty : 0), 0);
        const matched = Math.min(buy,sell), difference = Math.abs(buy-sell);
        if (matched > volume || (matched === volume && (difference < imbalance ||
            (difference === imbalance && Math.abs(px-reference) < Math.abs(clearing-reference))))) {
          clearing = px; volume = matched; imbalance = difference;
        }
      }
    }
    while (volume > 0 && m.bids[0]?.px >= clearing && m.asks[0]?.px <= clearing) {
      const bid = m.bids[0], ask = m.asks[0];
      if (bid.accountId === ask.accountId) {
        this.removeOrder(em, bid.orderId > ask.orderId ? bid : ask, "cancelled");
        continue;
      }
      const qty = Math.min(volume, bid.qty, ask.qty);
      const buyer = this.s.accounts[bid.accountId];
      buyer.heldCash -= qty * bid.holdPerShare;
      this.bookTrade(em, m, ask, buyer, qty, "buy", bid.orderId, clearing);
      bid.qty -= qty;
      volume -= qty;
      if (!bid.qty) this.removeOrder(em, bid, "filled");
      else em.out.orders.push({ orderId: bid.orderId, accountId: bid.accountId, memeId: m.memeId, status: "open", remaining: bid.qty });
      m.curve.price = clearing / COIN;
    }
    m.bandReference = m.curve.price;
  }

  private checkDormancy(m: Meme, t: number) {
    if (m.status === "active" && m.coldSince !== null && t - m.coldSince >= this.s.params.dormantDays * DAY) {
      m.status = "dormant";
      m.dormantSince = t;
    }
  }

  private drift(m: Meme, g: number, marketReturn: number) {
    const P = this.s.params;
    const dtH = P.tickMs / 3_600_000;
    const vwap = this.vwapOf(m, g);
    const target = this.fair(m) ** (1 - P.vwapWeight) * vwap ** P.vwapWeight;
    const [z, rng] = normal(m.rng);
    m.rng = rng;
    const pull = 1 - 2 ** (-dtH / P.driftHalfLifeHours);
    let lnP = Math.log(m.curve.price);
    lnP += pull * (Math.log(target) - lnP) + P.noisePerSqrtHour * clipHeat(m.heat) * Math.sqrt(dtH) * z;
    lnP += marketReturn;
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
    return q > 0 ? pq / q : this.fair(m);
  }

  /**
   * Borrow fee, per started minute (spec call #6, amended): at each minute mark every open short pays
   * |q|·M·r/60. Opening or adding to a short pays the minute it starts in, so a 20-second short pays too.
   * Booked straight to the journal each minute (simpler than hourly batching, and exact).
   */
  private chargeBorrow(em: Emitter) {
    for (const id of Object.keys(this.s.shorts)) {
      const a = this.s.accounts[id];
      for (const [memeId, q] of Object.entries(a.shares)) if (q < 0) this.borrowFee(em, a, this.s.memes[memeId], -q);
    }
  }

  private borrowFee(em: Emitter, a: Account, m: Meme, qty: number) {
    const fee = Math.ceil((qty * this.mark(m) * this.borrowRate(m)) / 60);
    if (fee <= 0) return;
    a.cash -= fee;
    const p = a.pos[m.memeId];
    if (p) p.flow -= fee;
    em.post(`player:${a.accountId}`, "coin", -fee);
    em.post("sink", "coin", fee);
  }

  // ---------- quotes ----------

  /** The house's quote; in pre-open the house is closed (no ask, no bid). */
  private houseAsk(m: Meme) {
    return m.status === "preopen" || this.houseInventory(m) < 1 ? INF : m.curve.price * (1 + m.spread / 2);
  }
  private houseBid(m: Meme) {
    return m.status === "preopen" ? 0 : m.curve.price * (1 - m.spread / 2);
  }

  private quote(m: Meme, time: number): PriceUpdate {
    const bid = Math.max(this.houseBid(m), m.bids[0] ? m.bids[0].px / COIN : 0);
    const ask = Math.min(this.houseAsk(m), m.asks[0] ? m.asks[0].px / COIN : INF);
    // Without a two-sided market (pre-open), the mid falls back to fair value.
    const mid = bid > 0 && ask < INF ? (bid + ask) / 2 : this.fair(m);
    return { memeId: m.memeId, time, price: m.curve.price, bid, ask: ask === INF ? 0 : ask, mid };
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
    let rollback: State | undefined;
    const priorUpdates = out.orders.length;
    const reject = (reason: string) => {
      if (rollback) { this.s = rollback; out.orders.length = priorUpdates; }
      out.rejects.push({ seq: ev.seq, reason });
      return out;
    };
    const settle = (m: Meme) => {
      this.noCross(em, m);
      this.triggerStops(em, m);
      this.checkMargins(em, m);
      out.prices.push(this.quote(m, ev.time));
      return out;
    };

    switch (ev.type) {
      case "meme.list": {
        if (this.s.memes[ev.memeId]) return reject("meme already listed");
        const preopen = ev.preOpenUntil != null && ev.preOpenUntil > ev.time;
        const m: Meme = {
          memeId: ev.memeId,
          name: ev.name,
          status: preopen ? "preopen" : "active",
          opensAt: preopen ? ev.preOpenUntil! : null,
          coldSince: null,
          dormantSince: null,
          comebackAt: null,
          curve: { price: ev.price, L: depthToL(ev.depth, ev.price) },
          spread: this.s.params.spreadBase,
          fairValue: ev.fairValue ?? ev.price,
          heat: 1,
          depth0: ev.depth,
          listedAt: ev.time,
          rng: seedFrom(ev.memeId),
          closes: [],
          vwap: [],
          emaLast: null,
          emaAt: ev.time,
          longOI: 0,
          shortOI: 0,
          houseCash: 0,
          bids: [],
          asks: [],
          stops: [],
        };
        if (this.s.liquidityRules) this.setFloat(m);
        this.s.memes[ev.memeId] = m;
        out.prices.push(this.quote(m, ev.time));
        return out;
      }
      case "liquidity.open": {
        if (!this.s.liquidityRules) {
          this.s.liquidityRules = true;
          for (const m of Object.values(this.s.memes)) this.setFloat(m);
        }
        return out;
      }
      case "basket.open": {
        this.s.basket ??= { level: this.s.dank?.level ?? 1000, mids: Object.fromEntries(
          Object.values(this.s.memes).filter(m => m.status === "active").map(m => [m.memeId, this.quote(m, ev.time).mid])) };
        return out;
      }
      case "dank.open": {
        if (!this.s.dank) {
          this.s.dank = { level: 1000, rng: seedFrom("DANK") };
          this.s.params = { ...this.s.params, tickMs: 100 };
          this.s.tick = Math.floor(ev.time / 100) * 100;
        }
        return out;
      }
      case "params.set": {
        const bounds = PARAM_BOUNDS as Record<string, [number, number]>;
        for (const [k, v] of Object.entries(ev.params)) {
          if (!(k in bounds)) return reject(`unknown param ${k}`);
          const [lo, hi] = bounds[k];
          if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) return reject(`${k} must be between ${lo} and ${hi}`);
        }
        this.s.params = { ...this.s.params, ...ev.params };
        return out;
      }
      case "meme.features": {
        const m = this.s.memes[ev.memeId];
        if (!m) return reject("unknown meme");
        if (!(ev.fairValue > 0) || !(ev.heat >= 0)) return reject("fair value and heat must be positive");
        m.fairValue = Math.max(1, ev.fairValue);
        m.heat = ev.heat;
        const P = this.s.params;
        if (ev.heat < P.dormantHeat) m.coldSince ??= ev.time;
        else m.coldSince = null;
        if (m.status === "dormant" && (ev.z ?? 0) > P.reviveZ && (ev.acc ?? 0) > P.reviveAcc) {
          m.status = "active"; // revival (PRD §8.5): decay resets; the house climbs toward the new fair value
          m.dormantSince = null;
          m.coldSince = null;
          m.comebackAt = ev.time;
        }
        this.checkDormancy(m, ev.time);
        // Depth follows heat (PRD §6.2): Y = Y₀ · clip(H, 0.2, 5). Rescale L with the price held fixed; not a trade.
        m.curve.L = depthToL(m.depth0 * clipHeat(ev.heat), m.curve.price);
        return settle(m);
      }
      case "meme.halt": {
        const m = this.s.memes[ev.memeId];
        if (!m) return reject("unknown meme");
        if (m.status === "halted") return reject("already halted");
        for (const o of [...m.bids, ...m.asks]) this.removeOrder(em, o, "cancelled");
        for (const st of m.stops) delete this.s.orderIndex[st.orderId];
        m.stops = [];
        const mark = this.mark(m);
        for (const a of Object.values(this.s.accounts)) {
          const q = a.shares[m.memeId] ?? 0;
          if (!q) continue;
          const cash = q > 0 ? Math.floor(q * mark) : -Math.ceil(-q * mark); // settle in the house's favour by a micro-coin
          this.move(em, a, m, -q, cash);
          em.post("house", "coin", -cash);
          m.houseCash = (m.houseCash ?? 0) - cash;
          em.post("house", `share:${m.memeId}`, q);
          em.out.notices.push({ accountId: a.accountId, time: ev.time, kind: "halt", memeId: m.memeId, text: `${m.name} was pulled (${ev.reason}). Your ${Math.abs(q)} shares settled at ${(mark / COIN).toFixed(2)}.` });
        }
        m.status = "halted";
        return out;
      }
      case "account.open": {
        if (this.s.accounts[ev.accountId]) return reject("account exists");
        const cash = this.s.params.startingCash;
        this.s.accounts[ev.accountId] = { accountId: ev.accountId, cash, heldCash: 0, heldMargin: 0, shares: {}, heldShares: {}, pos: {}, resets: 0 };
        em.post("mint", "coin", -cash);
        em.post(`player:${ev.accountId}`, "coin", cash);
        return out;
      }
      case "account.close": {
        // A daily round ends: cancel everything, settle each position at the mark against the house (as a halt does), burn the cash.
        const a = this.s.accounts[ev.accountId];
        if (!a) return reject("unknown account");
        for (const m of Object.values(this.s.memes)) {
          for (const o of [...m.bids, ...m.asks]) if (o.accountId === a.accountId) this.removeOrder(em, o, "cancelled");
          for (const st of [...m.stops])
            if (st.accountId === a.accountId) {
              m.stops.splice(m.stops.indexOf(st), 1);
              delete this.s.orderIndex[st.orderId];
            }
          const q = a.shares[m.memeId] ?? 0;
          if (!q) continue;
          const mark = this.mark(m);
          const cash = q > 0 ? Math.floor(q * mark) : -Math.ceil(-q * mark);
          this.move(em, a, m, -q, cash);
          em.post("house", "coin", -cash);
          m.houseCash = (m.houseCash ?? 0) - cash;
          em.post("house", `share:${m.memeId}`, q);
        }
        em.post(`player:${a.accountId}`, "coin", -a.cash);
        em.post("mint", "coin", a.cash);
        out.notices.push({ accountId: a.accountId, time: ev.time, kind: "reset", text: `Round closed with ${(a.cash / COIN).toFixed(2)} coins.` });
        delete this.s.accounts[a.accountId];
        delete this.s.shorts[a.accountId];
        return out;
      }
      case "account.reset": {
        const a = this.s.accounts[ev.accountId];
        if (!a) return reject("unknown account");
        if (!this.canReset(a)) return reject("you can reset only when your equity is under 1,000 coins and you hold no positions");
        for (const m of Object.values(this.s.memes)) {
          for (const o of [...m.bids, ...m.asks]) if (o.accountId === a.accountId) this.removeOrder(em, o, "cancelled");
          for (const st of [...m.stops])
            if (st.accountId === a.accountId) {
              m.stops.splice(m.stops.indexOf(st), 1);
              delete this.s.orderIndex[st.orderId];
            }
        }
        const topUp = this.s.params.startingCash - a.cash; // also writes off a negative balance
        a.cash += topUp;
        a.resets = (a.resets ?? 0) + 1;
        em.post("mint", "coin", -topUp);
        em.post(`player:${a.accountId}`, "coin", topUp);
        out.notices.push({ accountId: a.accountId, time: ev.time, kind: "reset", text: `Fresh start: back to ${this.s.params.startingCash / COIN} coins (reset #${a.resets}).` });
        return out;
      }
      case "order.market":
      case "order.limit": {
        const a = this.s.accounts[ev.accountId];
        const m = this.s.memes[ev.memeId];
        if (!a) return reject("unknown account");
        if (!m) return reject("unknown meme");
        if (!Number.isSafeInteger(ev.qty) || ev.qty <= 0) return reject("quantity must be a whole number above 0");
        if (m.status === "halted") return reject("this meme is halted");
        if (m.status === "preopen" && ev.type === "order.market") return reject("this meme is in pre-open: only limit orders until it opens");
        let expiresAt = ev.type === "order.limit" ? ev.expiresAt : null;
        let limit = INF;
        let hold = 0;
        if (ev.type === "order.limit") {
          if (ev.replaceOrderId !== undefined) {
            const old = [...m.bids, ...m.asks].find(o => o.orderId === ev.replaceOrderId && o.accountId === a.accountId && o.side === ev.side);
            if (!old) return reject("order already closed or unavailable");
            expiresAt = old.expiresAt;
            rollback = structuredClone(this.s);
            this.removeOrder(em, old, "cancelled");
          }
          const px = Math.round(ev.price * COIN);
          if (!(px >= PRICE_STEP) || px % PRICE_STEP !== 0 || Math.abs(px / COIN - ev.price) > 1e-9)
            return reject("price must be at least 0.01 and in steps of 0.01");
          if (ev.expiresAt != null && ev.expiresAt <= ev.time) return reject("expiry must be in the future");
          limit = px;
          hold = this.limitHold(px);
          if (ev.side === "buy" && ev.qty * hold > this.freeCash(a) + this.coverRelease(a, m, ev.qty))
            return reject("not enough free cash for this order");
        }
        let qty = ev.qty;
        let marginPerShare = 0;
        if (ev.side === "sell") {
          const cap = this.sellCapacity(a, m);
          if (cap.total <= 0) return reject(cap.long === 0 && (a.shares[m.memeId] ?? 0) <= 0 ? "not enough margin to short this" : "you have no free shares to sell");
          if (ev.type === "order.limit") {
            if (m.borrowPool !== undefined && qty > cap.total) return reject("available borrow or margin is insufficient");
            const shortPart = Math.max(0, ev.qty - cap.long);
            marginPerShare = Math.ceil(this.s.params.initialMargin * Math.max(limit, this.mark(m)));
            const r = this.risk(a);
            if (shortPart > 0 && r.equity - r.im < shortPart * marginPerShare) return reject("not enough margin to short this many");
          } else qty = Math.min(ev.qty, cap.total);
        }
        const auction = this.liquidityOpen && m.status === "preopen";
        if (auction && ev.type === "order.limit") {
          if (ev.immediateOrCancel) return reject("IOC is unavailable during the opening auction");
          const opposite = ev.side === "buy" ? m.asks : m.bids;
          if (opposite.some(o => o.accountId === ev.accountId && (ev.side === "buy" ? o.px <= limit : o.px >= limit)))
            return reject("cancel your crossing order before entering the auction");
        }
        const filled = auction ? 0 : this.take(em, a, m, ev.side, qty, limit, ev.seq);
        const left = qty - filled;
        if (ev.type === "order.limit" && left > 0 && ev.immediateOrCancel) {
          out.orders.push({ orderId: ev.seq, accountId: a.accountId, memeId: m.memeId, status: "cancelled", remaining: left });
        } else if (ev.type === "order.limit" && left > 0) {
          const owned = Math.max(0, (a.shares[m.memeId] ?? 0) - (a.heldShares[m.memeId] ?? 0));
          const heldLong = ev.side === "sell" ? Math.min(left, owned) : 0;
          this.rest(m, a, { orderId: ev.seq, accountId: a.accountId, memeId: m.memeId, side: ev.side, px: limit, qty: left, holdPerShare: hold, heldLong, marginPerShare, expiresAt: expiresAt ?? null });
          out.orders.push({ orderId: ev.seq, accountId: a.accountId, memeId: m.memeId, status: "open", remaining: left });
        } else if (ev.type === "order.limit") out.orders.push({ orderId: ev.seq, accountId: a.accountId, memeId: m.memeId, status: "filled", remaining: 0 });
        if (filled === 0 && ev.type === "order.market") return reject(ev.side === "buy" ? "not enough free cash for even one share" : "nobody is buying right now");
        return settle(m);
      }
      case "order.stop": {
        const a = this.s.accounts[ev.accountId];
        const m = this.s.memes[ev.memeId];
        if (!a) return reject("unknown account");
        if (!m) return reject("unknown meme");
        if (!Number.isSafeInteger(ev.qty) || ev.qty <= 0) return reject("quantity must be a whole number above 0");
        if (m.status === "halted") return reject("this meme is halted");
        if (m.status === "preopen") return reject("this meme is in pre-open: stops can be set once it opens");
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
    if (this.liquidityOpen && m.status === "preopen") return;
    for (let guard = 0; guard < 1_000 && m.stops.length; guard++) {
      const mid = this.quote(m, em.time).mid;
      const hit = m.stops.find((o) => (o.side === "buy" ? mid >= o.stop : mid <= o.stop));
      if (!hit) return;
      m.stops.splice(m.stops.indexOf(hit), 1);
      delete this.s.orderIndex[hit.orderId];
      em.out.orders.push({ orderId: hit.orderId, accountId: hit.accountId, memeId: m.memeId, status: "triggered", remaining: hit.qty });
      const a = this.s.accounts[hit.accountId];
      const qty = hit.side === "sell" ? Math.min(hit.qty, this.sellCapacity(a, m).total) : hit.qty;
      if (qty > 0) this.take(em, a, m, hit.side, qty, INF, hit.orderId);
      this.noCross(em, m);
    }
  }

  // ---------- margin ----------

  /**
   * After the mark of `m` moves, every account holding a short and a position in `m` is re-checked
   * (a falling long can liquidate a short elsewhere). Below maintenance, it is liquidated.
   */
  private checkMargins(em: Emitter, m: Meme) {
    for (const id of Object.keys(this.s.shorts)) {
      const a = this.s.accounts[id];
      if (!a.shares[m.memeId]) continue;
      const r = this.risk(a);
      if (r.equity < r.mr) this.liquidate(em, a);
    }
  }

  /**
   * Liquidation (PRD §7.2): buy back shorts, worst unrealised loss first, through the router as
   * market orders, until equity ≥ initial margin. 1% of the closed notional goes to the sink. Equity
   * may end below zero; the player can then reset.
   */
  private liquidate(em: Emitter, a: Account) {
    const shorts = Object.entries(a.shares)
      .filter(([, q]) => q < 0)
      .map(([memeId, q]) => {
        const m = this.s.memes[memeId];
        return { m, q, loss: -q * this.mark(m) - (a.pos[memeId]?.flow ?? 0) };
      })
      .sort((x, y) => y.loss - x.loss || (x.m.memeId < y.m.memeId ? -1 : 1));
    for (const { m, q } of shorts) {
      const before = em.out.fills.length;
      this.take(em, a, m, "buy", -q, INF, em.seq, true);
      const notional = em.out.fills.slice(before).filter((f) => f.accountId === a.accountId).reduce((s, f) => s + f.cost, 0);
      const fee = Math.ceil((notional * this.s.params.liquidationFeeBps) / 10_000);
      a.cash -= fee;
      const p = a.pos[m.memeId];
      if (p) p.flow -= fee;
      em.post(`player:${a.accountId}`, "coin", -fee);
      em.post("sink", "coin", fee);
      const closed = -q + (a.shares[m.memeId] ?? 0);
      em.out.notices.push({
        accountId: a.accountId,
        time: em.time,
        kind: "liquidation",
        memeId: m.memeId,
        qty: closed,
        fee,
        text: `Liquidated: bought back ${closed} ${m.name} shares to cover your short (fee ${(fee / COIN).toFixed(2)} coins).`,
      });
      this.noCross(em, m);
      const r = this.risk(a);
      if (r.equity >= r.im) return;
    }
  }

  /** Lock that a buy of up to `qty` shares would release by covering a short. */
  private coverRelease(a: Account, m: Meme, qty: number) {
    const short = Math.max(0, -(a.shares[m.memeId] ?? 0));
    return Math.min(qty, short) * this.mark(m) * (1 + this.s.params.initialMargin);
  }

  // ---------- matching ----------

  /**
   * The router (PRD §6.4): fills `qty` step by step from whichever of book and house is cheaper,
   * players winning ties, never past `limit` (µc; Infinity for market orders) and never past the
   * taker's free cash (covering a short frees cash as it goes). `forced` (liquidation) ignores cash.
   * Returns shares filled.
   */
  private take(em: Emitter, a: Account, m: Meme, side: Side, qty: number, limit: number, orderId: number, forced = false): number {
    const feeRate = this.s.params.takerFeeBps / 10_000;
    let filled = 0;
    while (filled < qty) {
      const remaining = qty - filled;
      if (side === "buy") {
        const best = m.asks[0];
        const bookPx = best ? best.px : INF;
        const houseAsk = this.houseAsk(m) * COIN;
        if (Math.min(bookPx, houseAsk) > limit) break;
        const free = forced ? INF : Math.max(0, this.freeCash(a) + this.coverRelease(a, m, remaining));
        if (best && (bookPx <= houseAsk || this.oneHouseShareCost(m) > bookPx)) {
          if (this.s.basket && best.accountId === a.accountId) { this.removeOrder(em, best, "cancelled"); continue; }
          const perShare = bookPx + Math.ceil(bookPx * feeRate);
          const q = Math.min(remaining, best.qty, Math.floor(free / perShare));
          if (q <= 0) break;
          this.bookTrade(em, m, best, a, q, "buy", orderId);
          filled += q;
        } else {
          if (m.status === "preopen") break; // book only until the house opens
          const stop = Math.min(bookPx, limit);
          const affordable = free === INF ? remaining : maxBuyable(m.curve, free / COIN, m.spread / 2, feeRate);
          let d = Math.min(this.houseInventory(m), remaining, affordable, stop === INF ? remaining : this.sharesToAsk(m, stop / COIN));
          if (d <= 0) {
            // A whole share would overshoot the stop on the margin; take it if its average still fits.
            if (this.houseInventory(m) >= 1 && affordable >= 1 && this.oneHouseShareCost(m) <= stop) d = 1;
            else break;
          }
          // maxBuyable is a float estimate; step down if rounding tips it over the cash.
          while (d > 0 && !this.houseSells(em, m, a, d, true, null, orderId, forced)) d--;
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
          if (this.s.basket && best.accountId === a.accountId) { this.removeOrder(em, best, "cancelled"); continue; }
          const q = Math.min(remaining, best.qty);
          this.bookTrade(em, m, best, a, q, "sell", orderId);
          filled += q;
        } else {
          if (m.status === "preopen") break;
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
   * nothing, if the buyer can't pay (unless `forced`, for liquidations).
   */
  private houseSells(em: Emitter, m: Meme, a: Account, d: number, taker: boolean, order: Order | null, orderId: number, forced = false): boolean {
    const p1 = priceAfter(m.curve, d);
    const cost = Math.ceil(coinsBetween(m.curve.L, m.curve.price, p1) * (1 + m.spread / 2) * COIN);
    const fee = taker ? Math.ceil((cost * this.s.params.takerFeeBps) / 10_000) : 0;
    const release = order ? order.holdPerShare * d : 0;
    if (!forced && !order && cost + fee > this.freeCash(a) + this.coverRelease(a, m, d)) return false;
    if (order && cost + fee > release + Math.max(0, this.freeCash(a))) return false;
    a.heldCash -= release;
    m.curve.price = p1;
    this.move(em, a, m, d, -(cost + fee));
    em.post("house", "coin", cost);
    m.houseCash = (m.houseCash ?? 0) + cost;
    em.post("sink", "coin", fee);
    em.post("house", `share:${m.memeId}`, -d);
    this.record(em, m, a, "buy", d, cost, fee, taker ? "taker" : "maker", orderId, this.houseAsk(m));
    return true;
  }

  /** The house buys `d` shares from `a` along its curve. */
  private houseBuys(em: Emitter, m: Meme, a: Account, d: number, taker: boolean, order: Order | null, orderId: number) {
    const p1 = priceAfter(m.curve, -d);
    const proceeds = Math.floor(coinsBetween(m.curve.L, p1, m.curve.price) * (1 - m.spread / 2) * COIN);
    const fee = taker ? Math.ceil((proceeds * this.s.params.takerFeeBps) / 10_000) : 0;
    if (order) this.releaseSell(a, order, d);
    m.curve.price = p1;
    this.move(em, a, m, -d, proceeds - fee);
    em.post("house", "coin", -proceeds);
    m.houseCash = (m.houseCash ?? 0) - proceeds;
    em.post("sink", "coin", fee);
    em.post("house", `share:${m.memeId}`, d);
    this.record(em, m, a, "sell", d, proceeds, fee, taker ? "taker" : "maker", orderId, this.houseBid(m));
  }

  /** Player-to-player trade at the resting order's price. The taker pays the fee; the maker pays none. */
  private bookTrade(em: Emitter, m: Meme, resting: Order, taker: Account, q: number, takerSide: Side, orderId: number, executionPrice = resting.px) {
    const maker = this.s.accounts[resting.accountId];
    const notional = executionPrice * q;
    const fee = Math.ceil((notional * this.s.params.takerFeeBps) / 10_000);
    const [buyer, seller] = takerSide === "buy" ? [taker, maker] : [maker, taker];
    const buyerPays = notional + (takerSide === "buy" ? fee : 0);
    const sellerGets = notional - (takerSide === "sell" ? fee : 0);
    if (takerSide === "buy") this.releaseSell(maker, resting, q);
    else maker.heldCash -= resting.holdPerShare * q;
    this.move(em, buyer, m, q, -buyerPays);
    this.move(em, seller, m, -q, sellerGets);
    em.post("sink", "coin", fee);
    const price = executionPrice / COIN;
    em.out.trades.push({ memeId: m.memeId, time: em.time, qty: q, price });
    this.addVwap(m, em.time, price, q);
    this.updateEma(m, em.time, price);
    const base = { seq: em.seq, time: em.time, memeId: m.memeId, qty: q, cost: notional, source: "book" as const };
    em.out.fills.push({ ...base, accountId: taker.accountId, orderId, side: takerSide, fee, role: "taker" });
    em.out.fills.push({ ...base, accountId: maker.accountId, orderId: resting.orderId, side: resting.side, fee: 0, role: "maker" });
    resting.qty -= q;
    if (resting.qty === 0) this.removeOrder(em, resting, "filled");
    else em.out.orders.push({ orderId: resting.orderId, accountId: resting.accountId, memeId: m.memeId, status: "open", remaining: resting.qty });
  }

  /**
   * Every change to a player's shares goes through here: cash and share journal lines, open interest,
   * the short index, and round-trip tracking (a position going flat, or flipping side, closes a trade).
   */
  private move(em: Emitter, a: Account, m: Meme, dq: number, cash: number) {
    const before = a.shares[m.memeId] ?? 0;
    const after = before + dq;
    a.cash += cash;
    a.shares[m.memeId] = after;
    em.post(`player:${a.accountId}`, "coin", cash);
    em.post(`player:${a.accountId}`, `share:${m.memeId}`, dq);
    m.longOI += Math.max(after, 0) - Math.max(before, 0);
    m.shortOI += Math.max(-after, 0) - Math.max(-before, 0);
    if (Object.values(a.shares).some((q) => q < 0)) this.s.shorts[a.accountId] = true;
    else delete this.s.shorts[a.accountId];

    const crosses = before !== 0 && (after === 0 || Math.sign(after) !== Math.sign(before));
    const closingShare = crosses ? Math.abs(before) / Math.abs(dq) : 0;
    const p = a.pos[m.memeId];
    if (p) {
      p.flow += crosses ? Math.round(cash * closingShare) : cash;
      if (crosses) {
        em.out.closed.push({
          accountId: a.accountId,
          memeId: m.memeId,
          side: before > 0 ? "long" : "short",
          openedAt: p.openedAt,
          closedAt: em.time,
          peakQty: p.peak,
          pnl: p.flow,
          basis: p.basis,
        });
        delete a.pos[m.memeId];
      } else {
        p.peak = Math.max(p.peak, Math.abs(after));
        if (Math.abs(after) > Math.abs(before)) p.basis += Math.abs(cash);
      }
    }
    if (after < before) this.reconcileHeld(a, m);
    if (after !== 0 && (before === 0 || crosses)) {
      const rest = crosses ? cash - Math.round(cash * closingShare) : cash;
      a.pos[m.memeId] = { openedAt: em.time, flow: rest, peak: Math.abs(after), basis: Math.abs(rest) };
      if (after < 0) this.borrowFee(em, a, m, -after); // the minute this short starts in
    } else if (after < before && before <= 0) this.borrowFee(em, a, m, before - after); // adding to a short
  }

  /**
   * Resting sells hold owned shares. If the position later drops below what they hold (another sell
   * went short past them), the excess becomes short sales: margin is held for it instead.
   */
  private reconcileHeld(a: Account, m: Meme) {
    let excess = (a.heldShares[m.memeId] ?? 0) - Math.max(0, a.shares[m.memeId] ?? 0);
    for (const o of m.asks) {
      if (excess <= 0) return;
      if (o.accountId !== a.accountId || o.heldLong === 0) continue;
      const k = Math.min(o.heldLong, excess);
      o.heldLong -= k;
      a.heldShares[m.memeId] -= k;
      if (!o.marginPerShare) o.marginPerShare = Math.ceil(this.s.params.initialMargin * Math.max(o.px, this.mark(m)));
      a.heldMargin += o.marginPerShare * k;
      excess -= k;
    }
  }

  /** A house fill: the account's fill (average price) and the trade, whose price is the last share's (the LTP). */
  private record(em: Emitter, m: Meme, a: Account, side: Side, qty: number, cost: number, fee: number, role: "taker" | "maker", orderId: number, lastPrice: number) {
    em.out.fills.push({ seq: em.seq, time: em.time, memeId: m.memeId, accountId: a.accountId, orderId, side, qty, cost, fee, source: "house", role });
    em.out.trades.push({ memeId: m.memeId, time: em.time, qty, price: lastPrice });
    this.addVwap(m, em.time, cost / COIN / qty, qty);
    this.updateEma(m, em.time, lastPrice);
  }

  private updateEma(m: Meme, time: number, price: number) {
    if (m.emaLast === null) m.emaLast = price;
    else m.emaLast += (1 - Math.exp(-(time - m.emaAt) / MARK_EMA_MS)) * (price - m.emaLast);
    m.emaAt = time;
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
      a.heldShares[o.memeId] = (a.heldShares[o.memeId] ?? 0) + o.heldLong;
      a.heldMargin += o.marginPerShare * (o.qty - o.heldLong);
      const i = m.asks.findIndex((x) => x.px > o.px);
      m.asks.splice(i === -1 ? m.asks.length : i, 0, o);
    }
    this.s.orderIndex[o.orderId] = m.memeId;
  }

  /** Releases what a resting sell held for `q` filled shares: owned shares first, then short margin. */
  private releaseSell(a: Account, o: Order, q: number) {
    const fromLong = Math.min(q, o.heldLong);
    o.heldLong -= fromLong;
    a.heldShares[o.memeId] -= fromLong;
    a.heldMargin -= o.marginPerShare * (q - fromLong);
  }

  private removeOrder(em: Emitter, o: Order, status: "filled" | "cancelled" | "expired") {
    const m = this.s.memes[o.memeId];
    const a = this.s.accounts[o.accountId];
    const book = o.side === "buy" ? m.bids : m.asks;
    book.splice(book.indexOf(o), 1);
    if (o.side === "buy") a.heldCash -= o.holdPerShare * o.qty;
    else this.releaseSell(a, o, o.qty);
    delete this.s.orderIndex[o.orderId];
    em.out.orders.push({ orderId: o.orderId, accountId: o.accountId, memeId: o.memeId, status, remaining: status === "filled" ? 0 : o.qty });
  }

  /**
   * No-cross rule (PRD §6.5): after anything moves the house, resting orders that cross its quote
   * fill against the house at once, as makers, at the curve price (never worse than their limit).
   */
  private noCross(em: Emitter, m: Meme) {
    if (m.status === "preopen") return;
    for (let guard = 0; guard < 10_000; guard++) {
      const bid = m.bids[0];
      if (bid && bid.px >= this.houseAsk(m) * COIN) {
        let d = Math.min(this.houseInventory(m), bid.qty, this.sharesToAsk(m, bid.px / COIN));
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
