import { expect, test } from "vitest";
import { createDb, migrate } from "@dankrupt/db";
import { dashboard, Latency } from "./dashboard.ts";
import { Projections } from "./projections.ts";
import { Sequencer } from "./sequencer.ts";

test("the dashboard reports supply, the house's P&L, fees and latency percentiles", async () => {
  const db = createDb("pglite:");
  await migrate(db);
  const projections = new Projections(db);
  const seq = await Sequencer.boot(db, [{ memeId: "m", name: "M", price: 100, depth: 500_000 }], [projections.onApplied]);
  await seq.submit({ type: "account.open", accountId: "a" });
  await seq.submit({ type: "order.market", accountId: "a", memeId: "m", side: "buy", qty: 100 });
  await projections.flush();
  const lat = new Latency();
  for (const ms of [1, 2, 3, 4, 100]) lat.record(ms);
  const d = await dashboard(db, seq.engine, lat, { wsClients: 3, features: {} });
  expect(d.accounts).toBe(1);
  expect(d.fees24h).toBeGreaterThan(9);
  // PRD §4: supply changes only by the house's P&L (opposite sign) and fees.
  expect(d.supply! - 100_000 + d.housePnl! + d.fees24h!).toBeCloseTo(0, 3);
  expect(d.health).toMatchObject({ orderP50Ms: 3, orderP99Ms: 100, wsClients: 3 });
});
