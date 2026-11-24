"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellIcon, CoinsIcon } from "@phosphor-icons/react";
import banner from "../../public/banner.webp";
import { fmt, getNotices, markNoticesRead, type Me, type Notice } from "@/lib/market";
import { Backdrop } from "./Backdrop";

export function TradeHeader({ me }: { me: Me | null }) {
  return (
    <>
      <Backdrop />
      {/* A cardboard flap: darker board, corrugation, a fold line and tape holding it down. */}
      <header className="cardboard is-dark sticky top-0 z-30 border-b-[3px] border-ink shadow-[0_5px_0_rgba(58,36,18,0.25)]">
        <div aria-hidden="true" className="tape absolute -bottom-3 left-[8%] h-6 w-20 rotate-[-6deg]" />
        <div aria-hidden="true" className="tape absolute right-[8%] -bottom-3 h-6 w-20 rotate-[5deg]" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-1.5 border-t-2 border-dashed border-ink/25" />
        <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-2 pb-3">
          <Link href="/trade" className="flex min-h-11 items-center" aria-label="Dankrupt Exchange markets">
            <Image src={banner} alt="" sizes="160px" className="logo-outline h-auto w-32 sm:w-40" />
          </Link>
          {me && (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/me" className="sticker flex min-h-11 items-center gap-1.5 px-3 font-black" title="Your equity: cash plus positions at mark">
                <CoinsIcon weight="fill" className="size-5" aria-hidden="true" />
                <span className="sr-only">Equity:</span>
                {fmt(me.equity)}
              </Link>
              <Notices />
              <Link href="/me" className="outline-text font-display hidden text-xl sm:inline">
                @{me.accountId}
              </Link>
            </div>
          )}
        </div>
      </header>
    </>
  );
}

function Notices() {
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const load = () => getNotices().then(setItems).catch(() => {});
    const first = setTimeout(load, 0);
    const id = setInterval(load, 20_000);
    return () => (clearTimeout(first), clearInterval(id));
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const unread = items.filter((n) => !n.read).length;
  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notices, ${unread} unread` : "Notices"}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (unread) markNoticesRead().then(() => setItems((xs) => xs.map((n) => ({ ...n, read: true })))).catch(() => {});
        }}
        className="btn-candy is-small is-secondary relative px-3"
      >
        <BellIcon weight="fill" className="size-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border-2 border-ink bg-berry text-xs font-black text-paper">{unread}</span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notices" className="paper absolute right-0 z-40 mt-3 w-80 max-w-[90vw] p-4">
          <h2 className="font-display text-xl">Notices</h2>
          {items.length === 0 ? (
            <p className="mt-2 font-bold text-ink-soft">Nothing yet. Liquidations and resets show up here.</p>
          ) : (
            <ul className="mt-2 max-h-80 divide-y-2 divide-dashed divide-ink/20 overflow-auto">
              {items.map((n) => (
                <li key={`${n.time}-${n.kind}-${n.memeId}`} className="py-2">
                  <p className={`font-bold ${n.kind === "liquidation" ? "text-berry" : "text-mint"}`}>{n.text}</p>
                  <p className="text-xs font-bold text-ink-soft">
                    {new Date(n.time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
