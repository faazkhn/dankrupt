"use client";

import { useCallback, useEffect, useState } from "react";

export type MemeQuote = { memeId: string; name: string; price: number; bid: number; ask: number };
export type Me = { accountId: string; cash: number; shares: Record<string, number> };
export type Fill = { memeId: string; side: "buy" | "sell"; qty: number; cost: number; fee: number; price: number };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/engine/${path}`, { cache: "no-store", ...init });
  const data = await res.json();
  if (!res.ok && res.status !== 422) throw Object.assign(new Error(data.error ?? "request failed"), { status: res.status });
  return data as T;
}

/**
 * Polls quotes. Keeps a short per-session price history for sparklines.
 * shortcut: polling every 2s; ticket 02 swaps this for the websocket feed.
 */
export function useMarket(intervalMs = 2000) {
  const [memes, setMemes] = useState<MemeQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ReadonlyMap<string, number[]>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const list = await api<MemeQuote[]>("memes");
      setHistory((prev) => {
        const next = new Map(prev);
        for (const m of list) {
          const h = prev.get(m.memeId) ?? [];
          next.set(m.memeId, h.at(-1) === m.price ? h : [...h, m.price].slice(-120));
        }
        return next;
      });
      setMemes(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const id = setInterval(refresh, intervalMs);
    return () => (clearTimeout(first), clearInterval(id));
  }, [refresh, intervalMs]);

  return { memes, error, refresh, history };
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "signed-out" | "error">("loading");
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("me"));
      setStatus("ok");
    } catch (e) {
      setStatus((e as { status?: number }).status === 401 ? "signed-out" : "error");
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh]);
  return { me, setMe, status, refresh };
}

export async function placeOrder(memeId: string, side: "buy" | "sell", qty: number) {
  return api<{ fills: Fill[]; rejects: { reason: string }[]; account: Omit<Me, "accountId"> }>("orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ memeId, side, qty }),
  });
}

export const fmt = (n: number, digits = 2) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
