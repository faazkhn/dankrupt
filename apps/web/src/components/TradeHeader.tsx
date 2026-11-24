"use client";

import Link from "next/link";
import Image from "next/image";
import { CoinsIcon } from "@phosphor-icons/react";
import icon from "@/app/icon.png";
import { fmt, type Me } from "@/lib/market";

export function TradeHeader({ me }: { me: Me | null }) {
  return (
    <header className="sticky top-0 z-30 border-b-[3px] border-ink bg-board-dark/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
        <Link href="/trade" className="flex items-center gap-2" aria-label="Markets">
          <Image src={icon} alt="" width={40} height={40} className="logo-outline" />
          <span className="font-display outline-text hidden text-2xl sm:inline">DANKRUPT</span>
        </Link>
        {me && (
          <div className="flex items-center gap-2">
            <span className="paper flex items-center gap-1.5 rounded-full px-3 py-1 font-extrabold shadow-[0_3px_0_var(--ink)]">
              <CoinsIcon weight="fill" className="size-5 text-[#e0a800]" aria-hidden="true" />
              <span className="sr-only">Cash:</span>
              {fmt(me.cash)}
            </span>
            <span className="font-display text-paper [text-shadow:0_2px_0_var(--ink)]">@{me.accountId}</span>
          </div>
        )}
      </div>
    </header>
  );
}
