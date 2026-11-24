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
  fair: number;
  heat: number;
};
export type Attention = {
  wikipediaDaily: { day: string; views: number }[];
  series: { time: number; heat: number; fair: number }[];
  delayed: boolean;
  heat: number | null;
  momentum: number | null;
};
export type Candle = { minute: number; open: number; high: number; low: number; close: number; volume: number };
export type OpenOrder = { orderId: number; kind: "limit" | "stop"; memeId: string; side: "buy" | "sell"; price: number; qty: number; expiresAt: number | null };
export type Position = { memeId: string; qty: number; mark: number; value: number; openedAt: number; pnl: number; basis: number };
export type Me = {
  accountId: string;
  cash: number;
  freeCash: number;
  heldCash: number;
  heldMargin: number;
  equity: number;
  initialMargin: number;
  maintenance: number;
  shares: Record<string, number>;
  heldShares: Record<string, number>;
  positions: Position[];
  resets: number;
  canReset: boolean;
  orders: OpenOrder[];
};
export type Notice = { time: number; kind: "liquidation" | "reset"; memeId: string | null; text: string; read: boolean };
export type ClosedTrade = { memeId: string; name: string; side: "long" | "short"; openedAt: number; closedAt: number; peakQty: number; pnl: number; basis: number };
export type Profile = { account: Me; trades: ClosedTrade[]; equity: { time: number; equity: number; cashEvent: string | null }[] };
export type Fill = { memeId: string; side: "buy" | "sell"; qty: number; cost: number; fee: number; source: "house" | "book"; role: "taker" | "maker" };
export type Preview = {
  qty: number;
  total: number;
  fee: number;
  avgPrice: number;
  lastPrice: number;
  shortQty: number;
  limitedBy: "cash" | "shares" | "margin" | "limit" | "liquidity" | null;
};
export type BookLevel = { price: number; qty: number; orders: number };
export type Book = { bids: BookLevel[]; asks: BookLevel[]; house: { bid: number; ask: number } };
export type OrderTicket = { memeId: string; side: "buy" | "sell"; qty: number; type: "market" | "limit" | "stop"; price?: number; expiresInMinutes?: number };

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

export async function placeOrder(t: OrderTicket) {
  return api<{ fills: Fill[]; orders: { orderId: number; status: string; remaining: number }[]; rejects: { reason: string }[]; account: Me }>("orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(t),
  });
}

export async function resetAccount() {
  return api<{ rejects: { reason: string }[]; account: Me }>("reset", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
}

export const getProfile = () => api<Profile>("profile");
export const getWhoami = () => api<{ accountId: string; operator: boolean }>("whoami");
export const getMemeMeta = (memeId: string) => api<{ description: string; links: string[] }>(`meme-meta?memeId=${encodeURIComponent(memeId)}`);
export async function adminCall<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/engine/admin/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "request failed");
  return data as T;
}
export type BoardRow = { rank: number; accountId: string; twr: number; style: "scalper" | "swing" | "trend"; trades: number; resets: number };
export const getLeaderboard = (window: string, style: string | null) =>
  api<BoardRow[]>(`leaderboard?window=${window}${style ? `&style=${style}` : ""}`);
export const getNotices = () => api<Notice[]>("notices");
export const markNoticesRead = () => api<{ ok: boolean }>("notices/read", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

export async function cancelOrder(orderId: number) {
  return api<{ rejects: { reason: string }[]; account: Me }>("orders/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId }),
  });
}

/** Debounced engine preview of what the ticket would do right now; refreshes as prices move. */
export function usePreview(t: OrderTicket | null, enabled: boolean) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const key = t ? JSON.stringify(t) : "";
  useEffect(() => {
    if (!enabled || !t || t.qty < 1 || (t.type !== "market" && !(t.price && t.price >= 0.01))) {
      const clear = setTimeout(() => setPreview(null), 0);
      return () => clearTimeout(clear);
    }
    // A stop previews as the market order it turns into.
    const q = new URLSearchParams({ memeId: t.memeId, side: t.side, qty: String(t.qty), type: t.type === "stop" ? "market" : t.type });
    if (t.type === "limit") q.set("price", String(t.price));
    const load = () => api<Preview>(`preview?${q}`).then(setPreview).catch(() => setPreview(null));
    const first = setTimeout(load, 250);
    const id = setInterval(load, 3_000);
    return () => (clearTimeout(first), clearInterval(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the ticket's identity
  }, [key, enabled]);
  return preview;
}

export function useAttention(memeId: string) {
  const [data, setData] = useState<Attention | null>(null);
  useEffect(() => {
    const load = () => api<Attention>(`attention?memeId=${encodeURIComponent(memeId)}`).then(setData).catch(() => {});
    const first = setTimeout(load, 0);
    const id = setInterval(load, 5 * 60_000);
    return () => (clearTimeout(first), clearInterval(id));
  }, [memeId]);
  return data;
}

export function useBook(memeId: string, refreshMs = 2_000) {
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    const load = () => api<Book>(`book?memeId=${encodeURIComponent(memeId)}`).then(setBook).catch(() => {});
    const first = setTimeout(load, 0);
    const id = setInterval(load, refreshMs);
    return () => (clearTimeout(first), clearInterval(id));
  }, [memeId, refreshMs]);
  return book;
}

export const fmt = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtInt = (n: number) => n.toLocaleString("en-US");
export const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
