import { beforeEach, expect, test } from "vitest";
import { createDb, migrate, type Db } from "@dankrupt/db";
import { joinWaitlist, rateLimiter } from "./waitlist";

let db: Db;
beforeEach(async () => {
  db = createDb("pglite:");
  await migrate(db);
});
const count = async () =>
  (await db.query<{ n: number }>("select count(*)::int as n from waitlist")).rows[0].n;

test("valid email is stored once, normalised", async () => {
  expect(await joinWaitlist(db, { email: "  Meme@Lord.GG ", consent: true })).toEqual({ ok: true });
  const { rows } = await db.query<{ email: string }>("select email from waitlist");
  expect(rows).toEqual([{ email: "meme@lord.gg" }]);
});

test("duplicate looks identical to success and stores nothing new", async () => {
  await joinWaitlist(db, { email: "a@b.co", consent: true });
  expect(await joinWaitlist(db, { email: "A@B.co", consent: true })).toEqual({ ok: true });
  expect(await count()).toBe(1);
});

test("invalid email and missing consent are rejected with a field", async () => {
  expect(await joinWaitlist(db, { email: "not-an-email", consent: true })).toMatchObject({ ok: false, field: "email" });
  expect(await joinWaitlist(db, { email: "a@b.co", consent: false })).toMatchObject({ ok: false, field: "consent" });
  expect(await count()).toBe(0);
});

test("honeypot fills pretend success but store nothing", async () => {
  expect(await joinWaitlist(db, { email: "bot@spam.io", consent: true, website: "http://x" })).toEqual({ ok: true });
  expect(await count()).toBe(0);
});

test("source is sanitised", async () => {
  await joinWaitlist(db, { email: "s@t.co", consent: true, source: "<script>yt_short-1" });
  const { rows } = await db.query<{ source: string }>("select source from waitlist");
  expect(rows[0].source).toBe("scriptyt_short-1");
});

test("rate limiter allows 5 per window per key", () => {
  const allow = rateLimiter(5, 60_000);
  const t = 1_000;
  expect([1, 2, 3, 4, 5].map(() => allow("ip", t))).toEqual([true, true, true, true, true]);
  expect(allow("ip", t)).toBe(false);
  expect(allow("other", t)).toBe(true);
  expect(allow("ip", t + 60_001)).toBe(true);
});
