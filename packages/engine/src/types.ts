/** 1 coin in micro-coins. All money is integer micro-coins (ADR-0002). */
export const COIN = 1_000_000;

export type Side = "buy" | "sell";

export type EventBody =
  | { type: "meme.list"; memeId: string; name: string; price: number; depth: number; fairValue?: number }
  | { type: "account.open"; accountId: string }
  | { type: "order.market"; accountId: string; memeId: string; side: Side; qty: number };

/** Every input carries a global sequence number and a sequencer-assigned timestamp (ms). */
export type EngineEvent = EventBody & { seq: number; time: number };

/** Journal account names: `player:<id>`, `house`, `sink`, `mint`. Commodity: `coin` or `share:<memeId>`. */
export type JournalLine = { seq: number; account: string; commodity: string; amount: number };

export type Fill = {
  seq: number;
  memeId: string;
  accountId: string;
  side: Side;
  qty: number;
  /** Total coins paid (buy) or received before fee (sell), in µc. */
  cost: number;
  fee: number;
  source: "house" | "book";
  /** House centre price after the fill. */
  price: number;
};

export type Reject = { seq: number; reason: string };

/** House quote after a tick or a fill. */
export type PriceUpdate = { memeId: string; time: number; price: number; bid: number; ask: number };

export type Output = { fills: Fill[]; journal: JournalLine[]; rejects: Reject[]; prices: PriceUpdate[] };
