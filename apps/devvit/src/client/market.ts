import { connectRealtime } from "@devvit/web/client";
import { useCallback, useEffect, useRef, useState } from "react";

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
  status: "preopen" | "active" | "dormant" | "halted";
  opensAt: number | null;
  comebackAt: number | null;
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
  receipts?: { id: number; memeId: string; qty: number; time: number; side: string; status: string;
    fills: { time: number; qty: number; cost: number; fee: number }[] }[];
  orders: OpenOrder[];
};
export type Notice = { time: number; kind: "liquidation" | "reset" | "halt"; memeId: string | null; text: string; read: boolean };
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
export type Book = { float?: number; borrowAvailable?: number; auction?: string | null; bids: BookLevel[]; asks: BookLevel[]; house: { bid: number; ask: number } | null };
export type OrderTicket = { memeId: string; side: "buy" | "sell"; qty: number; type: "market" | "limit" | "stop"; price?: number; expiresInMinutes?: number; immediateOrCancel?: boolean; replaceOrderId?: number };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, { cache: "no-store", ...init });
  // Reddit's gateway can answer with a non-JSON error page (timeouts, overload): say so plainly.
  const text = await res.text();
  let data: { error?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw Object.assign(new Error(init?.method === "POST" ? "Reddit didn't confirm that in time. Check your open orders before trying again." : "The market is busy, retrying…"), { status: res.status });
  }
  if (!res.ok && res.status !== 422) throw Object.assign(new Error(data.error ?? "request failed"), { status: res.status });
  return data as T;
}

type Tick = { time: number; price: number };
type Tape = { dank: { level: number; time: number } | null; recent?: Tick[]; rows: MarketRow[] };

/**
 * Live market rows. A 1 s poll (which also advances the house clock) and Devvit realtime pushes
 * both deliver the last few 100 ms Dank Index ticks; they're replayed at 10 per second so the
 * index moves as smoothly as on the web, about a second behind.
 */
export function useMarkets() {
  const [dank, setDank] = useState<{ level: number; time: number } | null>(null);
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
    let closed = false;
    let pushedAt = 0;
    let shown = 0;
    let queue: Tick[] = [];
    const take = (t: Tape) => {
      merge(t.rows);
      setError(null);
      const fresh = (t.recent ?? []).filter((x) => x.time > shown);
      if (fresh.length) queue = [...queue, ...fresh].slice(-30);
      else if (t.dank && t.dank.time > shown) queue.push({ time: t.dank.time, price: t.dank.level });
      if (queue.length) shown = queue.at(-1)!.time;
    };
    const play = setInterval(() => {
      const next = queue.length > 12 ? queue.splice(0, queue.length - 10).at(-1) : queue.shift(); // never fall more than ~1 s behind
      if (next && !closed) setDank({ level: next.price, time: next.time });
    }, 100);
    const tick = () =>
      api<Tape>("tape")
        .then((t) => { if (!closed) take(t); })
        .catch((e: Error) => setError(e.message));
    tick();
    const poll = setInterval(() => { if (Date.now() - pushedAt > 900) tick(); }, 1_000);
    const conn = connectRealtime({
      channel: "markets",
      onMessage: (msg) => {
        const m = msg as Tape & { type?: string };
        if (m.type !== "markets" || closed) return;
        pushedAt = Date.now();
        take(m);
      },
    });
    return () => {
      closed = true;
      clearInterval(poll);
      clearInterval(play);
      void Promise.resolve(conn.disconnect()).catch(() => {});
    };
  }, [merge]);

  return { dank, rows, list: rows ? [...rows.values()] : null, error };
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
  const [me, updateMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "signed-out" | "error">("loading");
  const revision = useRef(0);
  const setMe = useCallback((account: Me) => {
    revision.current++;
    updateMe(account);
    setStatus("ok");
  }, []);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const account = await api<Me>("me");
      if (revision.current === request) setMe(account);
    } catch (e) {
      if (revision.current !== request) return;
      if ((e as { status?: number }).status === 401) {
        updateMe(null);
        setStatus("signed-out");
      } else setStatus("error");
    }
  }, [setMe]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (active) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 0);
    return () => { active = false; revision.current++; clearTimeout(timer); };
  }, [refresh]);
  return { me, setMe, status, refresh };
}

export const maxBuy = (memeId: string, limit?: number) => api<{ qty: number }>(`preview?memeId=${encodeURIComponent(memeId)}&side=buy&max=1&qty=10000000&type=${limit === undefined ? "market" : `limit&price=${limit}`}`);

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
export const getMemeMeta = (memeId: string) =>
  api<{ description: string; links: string[]; videos: string[] }>(`meme-meta?memeId=${encodeURIComponent(memeId)}`);
export const getWatchlist = () => api<string[]>("watchlist");
export const setStar = (memeId: string, on: boolean) =>
  api<string[]>("watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memeId, on }) });
export const pingView = (memeId: string) =>
  api<{ counted: boolean }>("view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memeId }) }).catch(() => null);
export async function adminCall<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
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
  const [preview, setPreview] = useState<{ key: string; value: Preview } | null>(null);
  const key = t ? JSON.stringify(t) : "";
  useEffect(() => {
    if (!enabled || !t || t.qty < 1 || (t.type !== "market" && !(t.price && t.price >= 0.01))) {
      const clear = setTimeout(() => setPreview(null), 0);
      return () => clearTimeout(clear);
    }
    // A stop previews as the market order it turns into.
    const q = new URLSearchParams({ memeId: t.memeId, side: t.side, qty: String(t.qty), type: t.type === "stop" ? "market" : t.type });
    if (t.type === "limit") q.set("price", String(t.price));
    const controller = new AbortController();
    const load = () => api<Preview>(`preview?${q}`, { signal: controller.signal })
      .then((value) => setPreview({ key, value }))
      .catch(() => { if (!controller.signal.aborted) setPreview(null); });
    const first = setTimeout(load, 250);
    const id = setInterval(load, 3_000);
    return () => { controller.abort(); clearTimeout(first); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the ticket's identity
  }, [key, enabled]);
  return enabled && preview?.key === key ? preview.value : null;
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

// ---------- the daily round (Devvit only) ----------

export type DayResult = { rank: number; user: string; equity: number; returnPct: number };
export type Day = {
  day: number; key: string; endsAt: number; startingCash: number; players: number; leaders: DayResult[];
  me: { user: string; rank: number | null; equity: number | null; returnPct: number | null; played: boolean; streak: number; bestStreak: number; days: number; wins: number } | null;
  yesterday: { day: number; podium: DayResult[]; players: number; mine: DayResult | null; unseen: boolean };
  listing: { memeId: string; name: string; status: string; opensAt: number | null } | null;
};
export const getDay = () => api<Day>("day");
export const markResultSeen = () => api<{ ok: boolean }>("day/seen", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

export function useDay(refreshMs = 10_000) {
  const [day, setDay] = useState<Day | null>(null);
  useEffect(() => {
    const load = () => getDay().then(setDay).catch(() => {});
    load();
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);
  return day;
}
