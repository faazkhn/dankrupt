/** 1 coin in micro-coins. All money is integer micro-coins (ADR-0002). */
export const COIN = 1_000_000;
/** The price step: limit prices are whole multiples of 0.01 coins. */
export const PRICE_STEP = 10_000;

export type Side = "buy" | "sell";

export type EventBody =
  | { type: "meme.list"; memeId: string; name: string; price: number; depth: number; fairValue?: number }
  | { type: "account.open"; accountId: string }
  /** Free top-up back to the starting cash; allowed when equity < 1,000 coins (even negative) and no positions. */
  | { type: "account.reset"; accountId: string }
  | { type: "order.market"; accountId: string; memeId: string; side: Side; qty: number }
  | {
      type: "order.limit";
      accountId: string;
      memeId: string;
      side: Side;
      qty: number;
      /** Limit price in coins; must sit on the 0.01 price step. */
      price: number;
      /** Epoch ms after which the order is cancelled, or null for good-till-cancelled. */
      expiresAt?: number | null;
    }
  | {
      type: "order.stop";
      accountId: string;
      memeId: string;
      side: Side;
      qty: number;
      /** Fires a market order when the mid reaches this price (buy: at or above; sell: at or below). */
      stopPrice: number;
    }
  | { type: "order.cancel"; accountId: string; orderId: number }
  /** A new fair value and heat from the attention pipeline (PRD §5). */
  | { type: "meme.features"; memeId: string; fairValue: number; heat: number };

/** Every input carries a global sequence number and a sequencer-assigned timestamp (ms). */
export type EngineEvent = EventBody & { seq: number; time: number };

/**
 * One journal line. `cause` is `e<seq>` for lines caused by an event and `t<gridTime>` for lines
 * caused by a tick (the house drifting into a resting order, an expiry); `(cause, n)` is unique,
 * so replaying writes the same keys. Accounts: `player:<id>`, `house`, `sink`, `mint`.
 * Commodity: `coin` (µc) or `share:<memeId>`.
 */
export type JournalLine = { cause: string; n: number; seq: number; time: number; account: string; commodity: string; amount: number };

/** One account's side of an execution. */
export type Fill = {
  seq: number;
  time: number;
  memeId: string;
  accountId: string;
  orderId: number | null;
  side: Side;
  qty: number;
  /** Coins paid (buy) or received before fee (sell), in µc. */
  cost: number;
  fee: number;
  source: "house" | "book";
  role: "taker" | "maker";
};

/** One execution, counted once, for market data (last price, volume, VWAP). */
export type Trade = { memeId: string; time: number; qty: number; price: number };

export type Reject = { seq: number; reason: string };

/** Quote after a tick or a fill: house centre `price`, best bid/ask across book and house, and their mid. */
export type PriceUpdate = { memeId: string; time: number; price: number; bid: number; ask: number; mid: number };

export type OrderUpdate = { orderId: number; accountId: string; memeId: string; status: "open" | "filled" | "cancelled" | "expired" | "triggered"; remaining: number };

/** Something a player should be told about, shown in-app (liquidations, reset). */
export type Notice = { accountId: string; time: number; kind: "liquidation" | "reset"; memeId?: string; qty?: number; fee?: number; text: string };

/** A round trip in one meme, from no position back to no position (a glossary "trade"). */
export type ClosedTrade = {
  accountId: string;
  memeId: string;
  side: "long" | "short";
  openedAt: number;
  closedAt: number;
  /** Largest position held during the round trip. */
  peakQty: number;
  /** Net µc made (negative = lost), fees and borrow included. */
  pnl: number;
  /** µc put at risk: what the opening side cost (long) or would cost to buy back at entry (short). */
  basis: number;
};

export type Output = {
  fills: Fill[];
  trades: Trade[];
  journal: JournalLine[];
  rejects: Reject[];
  prices: PriceUpdate[];
  orders: OrderUpdate[];
  notices: Notice[];
  closed: ClosedTrade[];
};

export const emptyOutput = (): Output => ({ fills: [], trades: [], journal: [], rejects: [], prices: [], orders: [], notices: [], closed: [] });
