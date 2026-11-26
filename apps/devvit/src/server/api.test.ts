import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@devvit/web/server", () => import("./fake-devvit.ts"));
const fake = await import("./fake-devvit.ts");
const { api } = await import("./api.ts");
const { tick } = await import("./jobs.ts");
const { peek } = await import("./store.ts");

const T0 = Date.UTC(2026, 10, 26, 10); // Market Day #1, 10:00 UTC

const as = (user: string | undefined) => (fake.context.username = user);
async function call<T = any>(path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await api.request(path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  return { status: res.status, data: (await res.json()) as T };
}

beforeEach(() => {
  fake.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  // Wikimedia: ten views a day for everything.
  vi.stubGlobal("fetch", async (url: string) => {
    const items = Array.from({ length: 5 }, (_, i) => ({ timestamp: `202611${String(20 + i).padStart(2, "0")}00`, views: 10 }));
    return new Response(JSON.stringify(String(url).includes("pageviews") ? { items } : {}), { status: 200 });
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the Reddit app API", () => {
  test("a viewer seeds the market, trades today's wallet, and the board ranks them", async () => {
    as(undefined);
    const markets = await call<{ memeId: string; status: string }[]>("/markets");
    expect(markets.data).toHaveLength(10);
    expect((await call("/me")).status).toBe(401); // logged-out Redditors can watch, not trade

    as("alice");
    const me = await call("/me");
    expect(me.data.accountId).toBe("alice");
    expect(me.data.equity).toBe(100_000);

    const memeId = markets.data[0].memeId;
    const buy = await call("/orders", { memeId, side: "buy", qty: 10, type: "market" });
    expect(buy.status).toBe(200);
    expect(buy.data.fills[0].qty).toBe(10);
    expect(buy.data.account.receipts[0]).toMatchObject({ memeId, qty: 10, status: "complete" });

    as("bob");
    expect((await call("/orders", { memeId, side: "sell", qty: 5, type: "market" })).status).toBe(200); // a short

    const day = await call("/day");
    expect(day.data.day).toBe(1);
    expect(day.data.players).toBe(2);
    expect(day.data.me).toMatchObject({ user: "bob", played: true, streak: 1 });
    expect(day.data.leaders.map((r: { user: string }) => r.user).sort()).toEqual(["alice", "bob"]);

    expect((await call("/candles?memeId=" + memeId)).status).toBe(200);
    expect((await call("/book?memeId=" + memeId)).data.house).toBeTruthy();
    expect(fake.sent.length).toBeGreaterThan(0); // realtime pushed quotes
  });

  test("the minute cron runs the desks and ingests Wikipedia; midnight closes the round", async () => {
    as("alice");
    await call("/markets");
    const memeId = (await peek()).engine.memes()[0].memeId;
    await call("/orders", { memeId, side: "buy", qty: 50, type: "market" });
    await call("/orders", { memeId, side: "buy", qty: 1, type: "limit", price: 1 }); // rests, must be cancelled at the close
    as("bob");
    await call("/orders", { memeId, side: "buy", qty: 1, type: "market" });

    await tick();
    let w = await peek();
    expect(w.engine.accounts().some((id) => id.startsWith("@desk"))).toBe(true);
    expect(Object.keys(await fake.redis.hGetAll(`wiki:${memeId}`)).length).toBeGreaterThan(0);

    vi.setSystemTime(Date.UTC(2026, 10, 27, 0, 1));
    await tick();
    w = await peek();
    expect(w.engine.hasAccount("alice--d20261126")).toBe(false);
    expect(w.engine.memes()).toHaveLength(11); // Market Day #2's listing
    expect(w.engine.memes().filter((m) => m.status === "preopen")).toHaveLength(1);
    expect(fake.posts.at(-1)).toMatch(/^Market Day #2 · Nov 27 · .+ lists today$/);
    expect([...fake.flairs.values()].some((f) => f.includes("Day 1 top trader"))).toBe(true);

    as("alice");
    const day = await call("/day");
    expect(day.data.yesterday.players).toBe(2);
    expect(day.data.yesterday.mine.user).toBe("alice");
    expect(day.data.yesterday.unseen).toBe(true);
    await call("/day/seen", {});
    expect((await call("/day")).data.yesterday.unseen).toBe(false);

    expect((await call("/me")).data.equity).toBe(100_000); // a fresh wallet
    await call("/orders", { memeId, side: "buy", qty: 1, type: "market" });
    expect((await call("/day")).data.me.streak).toBe(2);

    await tick(); // a second run the same day must not settle again
    expect(fake.posts.filter((p) => p.startsWith("Market Day #2"))).toHaveLength(1);
  }, 60_000);

  test("a closed trade can be posted to the subreddit once, with percentages only", async () => {
    as("alice");
    await call("/markets");
    const memeId = (await peek()).engine.memes()[0].memeId;
    await call("/orders", { memeId, side: "buy", qty: 20, type: "market" });
    await call("/orders", { memeId, side: "sell", qty: 20, type: "market" });
    const trade = (await call("/profile")).data.trades[0];
    const first = await call("/share", { memeId, closedAt: trade.closedAt });
    expect(first.status).toBe(200);
    expect(first.data.url).toMatch(/^https:\/\/www\.reddit\.com\/r\/dankrupt_dev\/comments\//);
    expect(fake.posts.at(-1)).toMatch(/^(Called it|Lesson learned): long .+, [+-]\d+\.\d% · Market Day #1$/);
    expect((await call("/share", { memeId, closedAt: trade.closedAt })).status).toBe(409);
    expect((await call("/share", { memeId, closedAt: 1 })).status).toBe(404);
  });

  test("whoami says who moderates", async () => {
    as("alice");
    expect((await call("/whoami")).data.operator).toBe(false);
    as("modname");
    expect((await call("/whoami")).data.operator).toBe(true);
  });

  test("bad input is refused at the boundary", async () => {
    as("alice");
    await call("/markets");
    expect((await call("/orders", { memeId: "nope!", side: "buy", qty: 1 })).status).toBe(400);
    expect((await call("/orders", { memeId: "stonks", side: "buy", qty: 0 })).status).toBe(400);
    expect((await call("/orders/cancel", { orderId: "x" })).status).toBe(400);
  });
});
