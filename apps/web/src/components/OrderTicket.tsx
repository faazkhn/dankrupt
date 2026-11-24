"use client";

import Link from "next/link";
import { useState } from "react";
import { InfoIcon, MinusIcon, PlusIcon, SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { fmt, fmtInt, placeOrder, usePreview, type Fill, type MarketRow, type Me, type OrderTicket as Ticket } from "@/lib/market";

const EXPIRY = [
  { label: "Until cancelled", minutes: undefined },
  { label: "1 hour", minutes: 60 },
  { label: "1 day", minutes: 1_440 },
  { label: "1 week", minutes: 10_080 },
] as const;

type Props = {
  memeId: string;
  meme: MarketRow | undefined;
  me: Me | null;
  signedOut: boolean;
  /** A price picked from the order book, to pre-fill a limit order. */
  pickedPrice: number | null;
  onPlaced: (account: Me, fills: Fill[]) => void;
};

/** Buy or sell at market, or at your own price (limit), with an exact live preview from the engine. */
export function OrderTicket({ memeId, meme, me, signedOut, pickedPrice, onPlaced }: Props) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"market" | "limit" | "stop">("market");
  const [qty, setQty] = useState(10);
  const [priceText, setPriceText] = useState("");
  const [expiry, setExpiry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastPick, setLastPick] = useState<number | null>(null);

  // A price tapped in the order book switches the ticket to a limit order at that price.
  if (pickedPrice !== null && pickedPrice !== lastPick) {
    setLastPick(pickedPrice);
    setType("limit");
    setPriceText(pickedPrice.toFixed(2));
    setResult(null);
  }

  const preopen = meme?.status === "preopen";
  if (preopen && type !== "limit") setType("limit"); // pre-open is limit orders only
  const price = Number(priceText);
  const priceValid = type === "market" || (Number.isFinite(price) && price >= 0.01 && Math.abs(Math.round(price * 100) - price * 100) < 1e-6);
  const ticket: Ticket = {
    memeId,
    side,
    qty,
    type,
    ...(type === "limit" ? { price, expiresInMinutes: EXPIRY[expiry].minutes } : type === "stop" ? { price } : {}),
  };
  const stopWrongSide = type === "stop" && meme && priceValid && (side === "sell" ? price >= meme.mid : price <= meme.mid);
  const preview = usePreview(ticket, !signedOut && !!me && qty >= 1 && priceValid);
  const held = me?.shares[memeId] ?? 0;
  const freeShares = held - (me?.heldShares[memeId] ?? 0);

  const reset = (fn: () => void) => () => {
    fn();
    setResult(null);
  };

  function setMax() {
    if (side === "sell" && meme && me) {
      // Owned shares, plus whatever short sale the margin allows (50% of the mark per share).
      const shortRoom = Math.max(0, Math.floor((me.equity - me.initialMargin) / (0.5 * meme.mid)));
      setQty(Math.max(1, Math.max(0, freeShares) + shortRoom));
    }
    else if (meme && me) {
      const per = (type === "limit" && priceValid ? price : meme.ask) * 1.001;
      setQty(Math.max(1, Math.floor(me.freeCash / per)));
    }
    setResult(null);
  }

  async function submit() {
    if (!meme || qty < 1 || !priceValid) return;
    setBusy(true);
    setResult(null);
    try {
      const out = await placeOrder(ticket);
      onPlaced(out.account, out.fills);
      if (out.rejects.length) return setResult({ ok: false, text: out.rejects[0].reason });
      const got = out.fills.reduce((s, f) => s + f.qty, 0);
      const cost = out.fills.reduce((s, f) => s + f.cost, 0);
      const verb = side === "buy" ? "Bought" : "Sold";
      const resting = out.orders.find((o) => o.status === "open");
      if (type === "stop") return setResult({ ok: true, text: `Stop set: ${side} ${fmtInt(qty)} at market when the price reaches ${fmt(price)}` });
      const parts: string[] = [];
      if (got > 0) parts.push(`${verb} ${fmtInt(got)}${got < qty ? ` of ${fmtInt(qty)}` : ""} at avg ${fmt(cost / got)}`);
      if (resting) parts.push(`${fmtInt(resting.remaining)} waiting on the book at ${fmt(price)}`);
      else if (got < qty && type === "market") parts.push(side === "buy" ? "(ran out of free cash)" : "(no more buyers)");
      setResult({ ok: true, text: parts.join(" · ") || "Order placed" });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (meme?.status === "halted") return <p className="mt-3 font-bold text-ink-soft">Trading has stopped on this meme.</p>;
  if (signedOut)
    return (
      <p className="mt-3 font-bold">
        <Link href="/dev-login" className="underline decoration-2">
          Sign in
        </Link>{" "}
        to trade.
      </p>
    );

  const short = preview && preview.qty < qty;
  return (
    <div className="mt-4 space-y-4">
      <Segmented label="Side" value={side} options={["buy", "sell"]} setter={(v) => (setSide(v), setResult(null))} colored />
      {preopen ? (
        <p className="rounded-xl border-2 border-ink/20 bg-paper-shade/60 p-3 text-sm font-bold">
          Pre-open: limit orders only, matched with other players. The house opens at 100 when the countdown ends.
        </p>
      ) : (
        <Segmented label="Order type" value={type} options={["market", "limit", "stop"]} setter={(v) => (setType(v), setResult(null))} />
      )}

      <div>
        <div className="flex items-end justify-between">
          <label htmlFor="qty" className="text-lg font-extrabold">
            Shares
          </label>
          <button type="button" onClick={setMax} className="min-h-11 cursor-pointer px-2 font-black text-sky-800 underline decoration-2 underline-offset-2">
            Max
          </button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" aria-label="Fewer shares" onClick={reset(() => setQty((q) => Math.max(1, q - 1)))} className="btn-candy is-small is-secondary">
            <MinusIcon weight="bold" aria-hidden="true" />
          </button>
          <input
            id="qty"
            inputMode="numeric"
            value={fmtInt(qty)}
            onChange={(e) => (setQty(Math.max(0, Math.min(10_000_000, Number(e.target.value.replace(/\D/g, "")) || 0))), setResult(null))}
            className="min-h-12 w-full min-w-0 rounded-[14px] border-[3px] border-ink bg-white px-3 text-center text-2xl font-black tabular-nums shadow-[inset_0_3px_0_var(--paper-shade)]"
          />
          <button type="button" aria-label="More shares" onClick={reset(() => setQty((q) => q + 1))} className="btn-candy is-small is-secondary">
            <PlusIcon weight="bold" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-sm font-bold text-ink-soft">
          {side === "buy"
            ? `Free cash ${fmt(me?.freeCash ?? 0)}`
            : freeShares > 0
              ? `You own ${fmtInt(freeShares)} free. Sell more than that and you're shorting.`
              : "You don't own any, so this would be a short sale."}
        </p>
      </div>

      {type === "limit" && (
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label htmlFor="limit-price" className="text-lg font-extrabold">
              {side === "buy" ? "Pay at most" : "Sell for at least"}
            </label>
            <input
              id="limit-price"
              inputMode="decimal"
              value={priceText}
              placeholder={meme ? fmt((side === "buy" ? meme.bid : meme.ask) || meme.mid) : "0.00"}
              onChange={(e) => (setPriceText(e.target.value.replace(/[^\d.]/g, "")), setResult(null))}
                aria-invalid={!priceValid && priceText !== ""}
              aria-describedby="limit-help"
              className="mt-1 min-h-12 w-full rounded-[14px] border-[3px] border-ink bg-white px-3 text-center text-2xl font-black tabular-nums shadow-[inset_0_3px_0_var(--paper-shade)]"
            />
          </div>
          <div>
            <label htmlFor="expiry" className="text-lg font-extrabold">
              Keep it
            </label>
            <select
              id="expiry"
              value={expiry}
              onChange={(e) => setExpiry(Number(e.target.value))}
              className="mt-1 min-h-12 w-full cursor-pointer rounded-[14px] border-[3px] border-ink bg-white px-2 font-bold"
            >
              {EXPIRY.map((x, i) => (
                <option key={x.label} value={i}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
          <p id="limit-help" className={`col-span-2 -mt-2 text-sm font-bold ${priceValid || priceText === "" ? "text-ink-soft" : "text-berry"}`}>
            {priceText === ""
              ? "Type your price. It fills now if the market already allows it; the rest waits on the book."
              : priceValid
                ? "Fills now if the market already allows it; the rest waits on the book."
                : "Use a price from 0.01, in steps of 0.01."}
          </p>
        </div>
      )}

      {type === "stop" && (
        <div>
          <label htmlFor="stop-price" className="text-lg font-extrabold">
            {side === "sell" ? "Sell when the price falls to" : "Buy when the price rises to"}
          </label>
          <input
            id="stop-price"
            inputMode="decimal"
            value={priceText}
            placeholder={meme ? fmt(side === "sell" ? meme.mid * 0.95 : meme.mid * 1.05) : "0.00"}
            onChange={(e) => (setPriceText(e.target.value.replace(/[^\d.]/g, "")), setResult(null))}
            aria-invalid={!priceValid || !!stopWrongSide}
            aria-describedby="stop-help"
            className="mt-1 min-h-12 w-full rounded-[14px] border-[3px] border-ink bg-white px-3 text-center text-2xl font-black tabular-nums shadow-[inset_0_3px_0_var(--paper-shade)]"
          />
          <p id="stop-help" className={`mt-1 text-sm font-bold ${priceValid && !stopWrongSide ? "text-ink-soft" : "text-berry"}`}>
            {!priceValid
              ? "Use a price from 0.01, in steps of 0.01."
              : stopWrongSide
                ? `A ${side} stop has to be ${side === "sell" ? "below" : "above"} the current price (${meme ? fmt(meme.mid) : "…"}).`
                : `Nothing happens until then. It then ${side}s at market, so the fill can differ a little.`}
          </p>
        </div>
      )}

      <div className="rounded-2xl border-[3px] border-dashed border-ink/30 bg-paper-shade/60 p-3 text-sm font-bold" aria-live="polite">
        {type === "stop" && <p className="mb-1 text-ink-soft">If it fired at today&apos;s prices:</p>}
        {!preview ? (
          <span className="text-ink-soft">Working out your price…</span>
        ) : preview.qty === 0 ? (
          <span className="flex gap-2">
            <InfoIcon weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {type === "limit"
              ? `Nothing fills right now. All ${fmtInt(qty)} would wait on the book at ${fmt(price)}.`
              : side === "sell"
                ? "Not enough margin to short even one share."
                : "Not enough free cash for one share."}
          </span>
        ) : (
          <div className="space-y-1">
            <p>
              Fills <span className="text-base font-black">{fmtInt(preview.qty)}</span> now at avg{" "}
              <span className="text-base font-black tabular-nums">{fmt(preview.avgPrice)}</span>
              {preview.qty > 1 && <span className="text-ink-soft"> (last share {fmt(preview.lastPrice)})</span>}
            </p>
            <p>
              {side === "buy" ? "Total cost" : "You receive"}{" "}
              <span className="text-base font-black tabular-nums">{fmt(preview.total)}</span> <span className="text-ink-soft">incl. {fmt(preview.fee)} fee</span>
            </p>
            {preview.shortQty > 0 && (
              <p className="flex gap-1.5 text-ink">
                <InfoIcon weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {fmtInt(preview.shortQty)} of these are a short sale: it locks 50% margin, pays a small borrow fee every minute, and gets bought back automatically if the price
                runs too far against you.
              </p>
            )}
            {short && (
              <p className="flex gap-1.5 text-berry">
                <WarningIcon weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {type === "limit"
                  ? `${fmtInt(qty - preview.qty)} more would wait on the book at ${fmt(price)}.`
                  : preview.limitedBy === "cash"
                    ? `Only ${fmtInt(preview.qty)} of ${fmtInt(qty)}: big orders push the price up as they fill, so your cash runs out first.`
                    : preview.limitedBy === "margin"
                      ? `Only ${fmtInt(preview.qty)} of ${fmtInt(qty)}: your margin can't back a bigger short.`
                      : `Only ${fmtInt(preview.qty)} of ${fmtInt(qty)} can sell.`}
              </p>
            )}
          </div>
        )}
      </div>

      <button onClick={submit} disabled={busy || !meme || qty < 1 || !priceValid || !!stopWrongSide} className={`btn-candy is-${side} w-full`}>
        {busy && <SpinnerGapIcon className="size-6 animate-spin" aria-hidden="true" />}
        {type === "stop" ? "Set stop: " : ""}
        {side === "buy" ? "Buy" : "Sell"} {fmtInt(qty)}{" "}
        {type === "market" ? "at market" : type === "stop" ? `at ${priceValid && priceText ? fmt(price) : "…"}` : `at ${priceValid && priceText ? fmt(price) : "…"}`}
      </button>
      <p role="status" className={`min-h-6 font-bold ${result?.ok ? "text-mint" : "text-berry"}`}>
        {result?.text}
      </p>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, setter, colored }: { label: string; value: T; options: T[]; setter: (v: T) => void; colored?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-3 ${options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => setter(o)}
          className={`btn-candy is-small px-2 capitalize ${value === o ? (colored ? `is-${o}` : "") : "is-muted"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
