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
            <div className="flex items-center gap-3">
              <span className="sticker flex items-center gap-1.5 px-3 py-1 font-black">
                <CoinsIcon weight="fill" className="size-5" aria-hidden="true" />
                <span className="sr-only">Cash:</span>
                {fmt(me.cash)}
              </span>
              <span className="outline-text font-display hidden text-xl sm:inline">@{me.accountId}</span>
            </div>
          )}
        </div>
      </header>
    </>
  );
}
