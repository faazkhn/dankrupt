import { connection } from "next/server";

const ENGINE = process.env.ENGINE_URL ?? "http://localhost:4000";

export type CardTrade = {
  account: string;
  memeId: string;
  name: string;
  side: "long" | "short";
  openedAt: number;
  closedAt: number;
  returnPct: number;
  avgIn: number;
  avgOut: number;
};

/** Server-side fetch of one public closed trade, or null. */
export async function fetchCardTrade(account: string, memeId: string, closedAt: string): Promise<CardTrade | null> {
  await connection(); // a live per-request lookup, never prerendered
  const q = new URLSearchParams({ account, memeId, closedAt });
  try {
    const res = await fetch(`${ENGINE}/api/trade?${q}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as CardTrade) : null;
  } catch {
    return null;
  }
}

export function held(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} hours` : `${Math.round(h / 24)} days`;
}
