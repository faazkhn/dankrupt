import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { fetchCardTrade } from "@/lib/card";

type Params = { params: Promise<{ account: string; memeId: string; closedAt: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { account, memeId, closedAt } = await params;
  const t = await fetchCardTrade(account, memeId, closedAt);
  const image = `/api/card/${account}/${memeId}/${closedAt}`;
  const title = t ? `@${t.account} called ${t.name}: ${t.returnPct >= 0 ? "+" : ""}${t.returnPct.toFixed(1)}%` : "Dankrupt Exchange";
  return { title, openGraph: { title, images: [{ url: image, width: 1200, height: 630 }] }, twitter: { card: "summary_large_image", images: [image] } };
}

export default function CardPage({ params }: Params) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-4 py-10">
      <Link href="/" aria-label="Dankrupt Exchange home">
        <Logo className="w-56" />
      </Link>
      <Suspense fallback={<div className="paper aspect-[1200/630] w-full animate-pulse" />}>
        <Card params={params} />
      </Suspense>
    </main>
  );
}

async function Card({ params }: Params) {
  const { account, memeId, closedAt } = await params;
  const t = await fetchCardTrade(account, memeId, closedAt);
  if (!t) return <p className="paper p-6 text-xl font-bold">This card doesn&apos;t exist (or the trade isn&apos;t closed).</p>;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated image, sized by the route */}
      <img
        src={`/api/card/${account}/${memeId}/${closedAt}`}
        alt={`@${t.account} ${t.side === "short" ? "shorted" : "bought"} ${t.name} for ${t.returnPct.toFixed(1)}%`}
        width={1200}
        height={630}
        className="h-auto w-full rounded-[24px] border-[3px] border-ink shadow-[0_8px_0_var(--ink)]"
      />
      <Link href={`/m/${memeId}`} className="btn-candy">
        Trade {t.name} on Dankrupt
      </Link>
    </>
  );
}
