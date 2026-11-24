"use client";

import { useCallback, useEffect, useState } from "react";

export type MarketRow = {
  memeId: string;
  name: string;
  ltp: number | null;
  mid: number;
  bid: number;
  ask: number;
  change24h: number;
  spark: number[];
};
export type Candle = { minute: number; open: number; high: number; low: number; close: number; volume: number };
export type Me = { accountId: string; cash: number; shares: Record<string, number> };
export type Fill = { memeId: string; side: "buy" | "sell"; qty: number; cost: number; fee: number; price: number };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/engine/${path}`, { cache: "no-store", ...init });
  const data = await res.json();
  if (!res.ok && res.status !== 422) throw Object.assign(new Error(data.error ?? "request failed"), { status: res.status });
  return data as T;
}

const wsUrl = () => process.env.NEXT_PUBLIC_WS_URL ?? `ws://${window.location.hostname}:4000/ws`;

/** Live market rows over the websocket; falls back to polling if the socket can't connect. */
export function useMarkets() {
  const [rows, setRows] = useState<Map<string, MarketRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const merge = useCallback((incoming: MarketRow[]) => {
    setRows((prev) => {
      const next = new Map(prev ?? []);
      for (const r of incoming) next.set(r.memeId, r);
      return next;
    });
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    const startPolling = () => {
      if (poll) return;
      const tick = () =>
        api<MarketRow[]>("markets")
          .then((r) => (merge(r), setError(null)))
          .catch((e: Error) => setError(e.message));
      tick();
      poll = setInterval(tick, 2_000);
    };
    const connect = () => {
      ws = new WebSocket(wsUrl());
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.type !== "markets") return;
        merge(msg.rows);
        setError(null);
      };
      ws.onerror = () => startPolling();
      ws.onclose = () => {
        if (!closed) setTimeout(connect, 3_000);
      };
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
      if (poll) clearInterval(poll);
    };
  }, [merge]);

  return { rows, list: rows ? [...rows.values()] : null, error };
}

export function useCandles(memeId: string, refreshMs = 15_000) {
  const [candles, setCandles] = useState<Candle[]>([]);
  useEffect(() => {
    const load = () => api<Candle[]>(`candles?memeId=${encodeURIComponent(memeId)}`).then(setCandles).catch(() => {});
    const first = setTimeout(load, 0);
    const id = setInterval(load, refreshMs);
    return () => (clearTimeout(first), clearInterval(id));
  }, [memeId, refreshMs]);
  return candles;
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
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtInt = (n: number) => n.toLocaleString("en-US");
export const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
