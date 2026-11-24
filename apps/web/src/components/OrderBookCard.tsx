"use client";

import { fmt, fmtInt, type Book } from "@/lib/market";

/**
 * Players' resting orders on both sides, with the house's own quote between them.
 * Tap a price to use it for a limit order.
 */
export function OrderBookCard({ book, onPick }: { book: Book | null; onPick: (price: number) => void }) {
  if (!book) return <div className="paper h-48 animate-pulse" aria-hidden="true" />;
  const maxQty = Math.max(1, ...book.bids.map((l) => l.qty), ...book.asks.map((l) => l.qty));
  const Row = ({ side, price, qty, orders }: { side: "bid" | "ask"; price: number; qty: number; orders: number }) => (
    <li>
      <button
        type="button"
        onClick={() => onPick(price)}
        className="relative grid min-h-9 w-full cursor-pointer grid-cols-[1fr_auto] items-center px-3 text-left font-bold tabular-nums hover:bg-[#fff3d6]"
        aria-label={`${side === "bid" ? "Bid" : "Ask"} ${fmt(price)}, ${fmtInt(qty)} shares from ${orders} order${orders === 1 ? "" : "s"}. Use this price.`}
      >
        <span aria-hidden="true" className={`absolute inset-y-1 right-0 ${side === "bid" ? "bg-mint/15" : "bg-berry/15"}`} style={{ width: `${(qty / maxQty) * 100}%` }} />
        <span className={`relative ${side === "bid" ? "text-mint" : "text-berry"}`}>{fmt(price)}</span>
        <span className="relative">{fmtInt(qty)}</span>
      </button>
    </li>
  );
  return (
    <div className="paper p-4">
      <h2 className="font-display text-2xl">Order book</h2>
      <p className="text-sm font-bold text-ink-soft">Tap a price to use it.</p>
      <div className="mt-2 grid grid-cols-[1fr_auto] px-3 text-xs font-black tracking-wide text-ink-soft uppercase">
        <span>Price</span>
        <span>Shares</span>
      </div>
      <ul aria-label="Asks (players selling)" className="flex flex-col-reverse">
        {book.asks.map((l) => (
          <Row key={`a${l.price}`} side="ask" {...l} />
        ))}
      </ul>
      <div className="my-1 rounded-xl border-[3px] border-ink bg-[#ffd23f]/70 px-3 py-1.5 text-sm font-black">
        <span className="font-display tracking-wide">HOUSE</span> buys at {fmt(book.house.bid)} · sells at {fmt(book.house.ask)}
      </div>
      <ul aria-label="Bids (players buying)">
        {book.bids.map((l) => (
          <Row key={`b${l.price}`} side="bid" {...l} />
        ))}
      </ul>
      {book.bids.length + book.asks.length === 0 && (
        <p className="mt-2 text-sm font-bold text-ink-soft">No player orders yet. Post a limit order and you&apos;re the market.</p>
      )}
    </div>
  );
}
