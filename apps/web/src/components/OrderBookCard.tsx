"use client";

import { fmt, fmtInt, type Book } from "@/lib/market";

/**
 * Players' resting orders on both sides, with the house's own quote between them.
 * Tap a price to use it for a limit order.
 */
export function OrderBookCard({ book, onPick }: { book: Book | null; onPick: (price: number) => void }) {
  if (!book) return <div className="paper h-48 animate-pulse" aria-hidden="true" />;
  const maxQty = Math.max(1, ...book.bids.map((l) => l.qty), ...book.asks.map((l) => l.qty));
  const cumulative = (levels: Book["asks"], index: number) => levels.slice(0,index+1).reduce((sum,l) => sum + l.qty, 0);
  const row = ({ side, price, qty, orders, total }: { side: "bid" | "ask"; price: number; qty: number; orders: number; total: number }) => (
    <li key={`${side}-${price}`}>
      <button
        type="button"
        onClick={() => onPick(price)}
        className="relative grid min-h-9 w-full cursor-pointer grid-cols-[1fr_auto] items-center px-3 text-left font-bold tabular-nums hover:bg-[#fff3d6]"
        aria-label={`${side === "bid" ? "Bid" : "Ask"} ${fmt(price)}, ${fmtInt(qty)} shares from ${orders} order${orders === 1 ? "" : "s"}. Use this price.`}
      >
        <span aria-hidden="true" className={`absolute inset-y-1 right-0 ${side === "bid" ? "bg-mint/15" : "bg-berry/15"}`} style={{ width: `${(qty / maxQty) * 100}%` }} />
        <span className={`relative ${side === "bid" ? "text-mint" : "text-berry"}`}>{fmt(price)}</span>
        <span className="relative">{fmtInt(qty)} / {fmtInt(total)}</span>
      </button>
    </li>
  );
  return (
    <div className="paper p-4">
      <h2 className="font-display text-2xl">Order book</h2>
      {book.float !== undefined && <p className="text-sm font-bold">Float {fmtInt(book.float)} · Available to borrow {fmtInt(book.borrowAvailable ?? 0)}</p>}
      {book.float !== undefined && <p className="text-sm text-ink-soft">A 10% move from the minute reference price pauses continuous trading for a one-minute reopening auction.</p>}
      {book.auction && <p className="font-bold">{book.auction === "volatility" ? "Volatility reopening auction" : "Opening auction"}</p>}
      <p className="text-sm font-bold text-ink-soft">Tap a bid or ask to copy its price into your limit order. Review the ticket to submit.</p>
      <div className="mt-2 grid grid-cols-[1fr_auto] px-3 text-xs font-black tracking-wide text-ink-soft uppercase">
        <span>Price</span>
        <span>Shares / cumulative</span>
      </div>
      <ul aria-label="Asks (players selling)" className="flex flex-col-reverse">
        {book.asks.map((l,i) => (
          row({ side: "ask", total: cumulative(book.asks,i), ...l })
        ))}
      </ul>
      <div className="my-1 rounded-xl border-[3px] border-ink bg-[#ffd23f]/70 px-3 py-1.5 text-sm font-black">
        <span className="font-display tracking-wide">HOUSE</span>{" "}
        {book.house ? <>buys at <button type="button" className="underline" onClick={() => onPick(book.house!.bid)}>{fmt(book.house.bid)}</button> · sells at <button type="button" className="underline" onClick={() => onPick(book.house!.ask)}>{fmt(book.house.ask)}</button></> : "quotes resume after the auction"}
      </div>
      <ul aria-label="Bids (players buying)">
        {book.bids.map((l,i) => (
          row({ side: "bid", total: cumulative(book.bids,i), ...l })
        ))}
      </ul>
      {book.bids.length + book.asks.length === 0 && (
        <p className="mt-2 text-sm font-bold text-ink-soft">No resting orders yet.</p>
      )}
    </div>
  );
}
