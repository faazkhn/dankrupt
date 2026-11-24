import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createDb, migrate } from "@dankrupt/db";
import { createApi } from "./http.ts";
import { Sequencer } from "./sequencer.ts";

let base = "";
let close = () => {};
beforeEach(async () => {
  const db = createDb("pglite:");
  await migrate(db);
  const server = createApi(await Sequencer.boot(db, [{ memeId: "stonks", name: "Stonks", price: 100, depth: 500_000 }]));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterEach(() => close());

const as = (user: string, init: RequestInit = {}) => ({ ...init, headers: { "x-dev-user": user, "content-type": "application/json" } });

test("a player buys through the API and sees the position", async () => {
  const me = await (await fetch(`${base}/api/me`, as("ana"))).json();
  expect(me.cash).toBe(100_000);
  const res = await fetch(`${base}/api/orders`, as("ana", { method: "POST", body: JSON.stringify({ memeId: "stonks", side: "buy", qty: 10 }) }));
  expect(res.status).toBe(200);
  const out = await res.json();
  expect(out.account.shares.stonks).toBe(10);
  expect(out.account.cash).toBeLessThan(100_000 - 1_000);
});

test("bad orders are rejected at the boundary", async () => {
  for (const bad of [{ memeId: "stonks", side: "hold", qty: 1 }, { memeId: "stonks", side: "buy", qty: 1.5 }, { side: "buy", qty: 1 }]) {
    const res = await fetch(`${base}/api/orders`, as("ana", { method: "POST", body: JSON.stringify(bad) }));
    expect(res.status).toBe(400);
  }
});

test("no identity, no trading", async () => {
  const res = await fetch(`${base}/api/orders`, { method: "POST", body: "{}" });
  expect(res.status).toBe(401);
});
