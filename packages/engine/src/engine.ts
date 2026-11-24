import { coinsBetween, depthToL, maxBuyable, maxSellable, priceAfter, type Curve } from "./house.ts";
import { COIN, type EngineEvent, type Output } from "./types.ts";

export type Params = {
  startingCash: number; // µc
  takerFeeBps: number;
  spreadBase: number; // s0, as a fraction (0.003 = 0.3%)
};

export const DEFAULT_PARAMS: Params = { startingCash: 100_000 * COIN, takerFeeBps: 10, spreadBase: 0.003 };

type Meme = { memeId: string; name: string; curve: Curve; spread: number };
type Account = { accountId: string; cash: number; shares: Record<string, number> };

type State = {
  seq: number;
  time: number;
  params: Params;
  memes: Record<string, Meme>;
  accounts: Record<string, Account>;
};

/**
 * The deterministic exchange core. Feed it events in sequence order; it mutates its state and
 * returns what happened. Replaying the same events always yields the same snapshot.
 */
export class Engine {
  private s: State;

  constructor(params: Params = DEFAULT_PARAMS) {
    this.s = { seq: 0, time: 0, params, memes: {}, accounts: {} };
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

  meme(memeId: string) {
    const m = this.s.memes[memeId];
    if (!m) throw new Error(`unknown meme ${memeId}`);
    const half = m.spread / 2;
    return { memeId, name: m.name, price: m.curve.price, bid: m.curve.price * (1 - half), ask: m.curve.price * (1 + half) };
  }

  memes() {
    return Object.keys(this.s.memes).map((id) => this.meme(id));
  }

  account(accountId: string) {
    const a = this.s.accounts[accountId];
    if (!a) throw new Error(`unknown account ${accountId}`);
    return { accountId, cash: a.cash, shares: { ...a.shares } };
  }

  hasAccount(accountId: string) {
    return accountId in this.s.accounts;
  }

  apply(ev: EngineEvent): Output {
    if (ev.seq !== this.s.seq + 1) throw new Error(`event seq ${ev.seq} after ${this.s.seq}`);
    if (ev.time < this.s.time) throw new Error(`event time went backwards at seq ${ev.seq}`);
    this.s.seq = ev.seq;
    this.s.time = ev.time;
    const out: Output = { fills: [], journal: [], rejects: [] };
    const reject = (reason: string) => (out.rejects.push({ seq: ev.seq, reason }), out);
    const post = (account: string, commodity: string, amount: number) => {
      if (!Number.isSafeInteger(amount)) throw new Error(`non-integer journal amount ${amount}`);
      if (amount !== 0) out.journal.push({ seq: ev.seq, account, commodity, amount });
    };

    switch (ev.type) {
      case "meme.list": {
        if (this.s.memes[ev.memeId]) return reject("meme already listed");
        this.s.memes[ev.memeId] = {
          memeId: ev.memeId,
          name: ev.name,
          curve: { price: ev.price, L: depthToL(ev.depth, ev.price) },
          spread: this.s.params.spreadBase,
        };
        return out;
      }
      case "account.open": {
        if (this.s.accounts[ev.accountId]) return reject("account exists");
        const cash = this.s.params.startingCash;
        this.s.accounts[ev.accountId] = { accountId: ev.accountId, cash, shares: {} };
        post("mint", "coin", -cash);
        post(`player:${ev.accountId}`, "coin", cash);
        return out;
      }
      case "order.market": {
        const a = this.s.accounts[ev.accountId];
        const m = this.s.memes[ev.memeId];
        if (!a) return reject("unknown account");
        if (!m) return reject("unknown meme");
        if (!Number.isSafeInteger(ev.qty) || ev.qty <= 0) return reject("quantity must be a whole number above 0");
        const half = m.spread / 2;
        const feeRate = this.s.params.takerFeeBps / 10_000;
        const held = a.shares[ev.memeId] ?? 0;
        const share = `share:${ev.memeId}`;
        const player = `player:${ev.accountId}`;

        if (ev.side === "buy") {
          let qty = Math.min(ev.qty, maxBuyable(m.curve, a.cash / COIN, half, feeRate));
          let p1 = 0, cost = 0, fee = 0;
          // Rounding can push the estimate a share over budget; step down until it fits.
          for (; qty > 0; qty--) {
            p1 = priceAfter(m.curve, qty);
            cost = Math.ceil(coinsBetween(m.curve.L, m.curve.price, p1) * (1 + half) * COIN);
            fee = Math.ceil((cost * this.s.params.takerFeeBps) / 10_000);
            if (cost + fee <= a.cash) break;
          }
          if (qty === 0) return reject("not enough free cash");
          m.curve.price = p1;
          a.cash -= cost + fee;
          a.shares[ev.memeId] = held + qty;
          post(player, "coin", -(cost + fee));
          post("house", "coin", cost);
          post("sink", "coin", fee);
          post(player, share, qty);
          post("house", share, -qty);
          out.fills.push({ seq: ev.seq, memeId: ev.memeId, accountId: ev.accountId, side: "buy", qty, cost, fee, source: "house", price: p1 });
        } else {
          const qty = Math.min(ev.qty, held, maxSellable(m.curve)); // shorting arrives in ticket 06a
          if (qty <= 0) return reject(held <= 0 ? "no shares to sell" : "price is at the floor");
          const p1 = priceAfter(m.curve, -qty);
          const proceeds = Math.floor(coinsBetween(m.curve.L, p1, m.curve.price) * (1 - half) * COIN);
          const fee = Math.ceil((proceeds * this.s.params.takerFeeBps) / 10_000);
          m.curve.price = p1;
          a.cash += proceeds - fee;
          a.shares[ev.memeId] = held - qty;
          post(player, "coin", proceeds - fee);
          post("house", "coin", -proceeds);
          post("sink", "coin", fee);
          post(player, share, -qty);
          post("house", share, qty);
          out.fills.push({ seq: ev.seq, memeId: ev.memeId, accountId: ev.accountId, side: "sell", qty, cost: proceeds, fee, source: "house", price: p1 });
        }
        return out;
      }
    }
  }
}
