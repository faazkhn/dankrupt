"use client";

import Image from "next/image";
import Link from "next/link";
import { CoinsIcon } from "@phosphor-icons/react";
import banner from "../../public/banner.webp";
import { fmt, type Me } from "@/lib/market";
import { Backdrop } from "./Backdrop";

export function TradeHeader({ me }: { me: Me | null }) {
  return (
    <>
      <Backdrop />
      <header className="sticky top-0 z-30 border-b-[3px] border-ink bg-board/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/trade" className="flex min-h-11 items-center" aria-label="Dankrupt Exchange markets">
            <Image src={banner} alt="" sizes="160px" className="logo-outline h-auto w-32 sm:w-40" />
          </Link>
          {me && (
            <div className="flex items-center gap-3">
              <span className="sticker flex items-center gap-1.5 px-3 py-1 font-black">
                <CoinsIcon weight="fill" className="size-5" aria-hidden="true" />
                <span className="sr-only">Cash:</span>
                {fmt(me.cash)}
              </span>
              <span className="font-display hidden text-lg text-paper [text-shadow:0_2px_0_var(--ink)] sm:inline">@{me.accountId}</span>
            </div>
          )}
        </div>
      </header>
    </>
  );
}
