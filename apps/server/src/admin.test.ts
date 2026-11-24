import { beforeEach, expect, test } from "vitest";
import { createDb, migrate, type Db } from "@dankrupt/db";
import { Admin, AdminError } from "./admin.ts";
import { Sequencer } from "./sequencer.ts";

let db: Db;
let seq: Sequencer;
let admin: Admin;
const known = new Map([["moo deng", "Moo Deng"]]);
beforeEach(async () => {
  db = createDb("pglite:");
  await migrate(db);
  seq = await Sequencer.boot(db, []);
  admin = new Admin(db, seq, undefined, async (t) => known.get(t.toLowerCase()) ?? null);
});

test("an operator adds a candidate with a checked Wikipedia title, approves it, and it lists at 100", async () => {
  const id = await admin.addCandidate("faaz", { memeId: "moo-deng", name: "Moo Deng", description: "A baby hippo", links: ["https://en.wikipedia.org/wiki/Moo_Deng", "javascript:alert(1)"], wikipedia: ["moo deng"] });
  const [c] = (await admin.candidates()) as { wikipedia: string[]; links: string[]; status: string }[];
  expect(c).toMatchObject({ wikipedia: ["Moo Deng"], links: ["https://en.wikipedia.org/wiki/Moo_Deng"], status: "candidate" });
  await admin.approve("faaz", id);
  expect(seq.engine.meme("moo-deng")).toMatchObject({ name: "Moo Deng", price: 100, status: "preopen" });
  expect(await admin.memeMeta("moo-deng")).toMatchObject({ description: "A baby hippo" });
  expect((await admin.actions()).map((a) => (a as { action: string }).action)).toEqual(["candidate.approve", "candidate.add"]);
});

test("bad input is refused: unknown article, bad id, rejecting without a reason, approving twice", async () => {
  await expect(admin.addCandidate("faaz", { memeId: "x-y", name: "X", wikipedia: ["Nope"] })).rejects.toThrow(/no Wikipedia article/);
  await expect(admin.addCandidate("faaz", { memeId: "Bad Id!", name: "X" })).rejects.toThrow(AdminError);
  const id = await admin.addCandidate("faaz", { memeId: "rejectme", name: "R", wikipedia: [] });
  await expect(admin.approve("faaz", id)).rejects.toThrow(/data source/);
  await expect(admin.reject("faaz", id, "  ")).rejects.toThrow(/rule/);
  await admin.reject("faaz", id, "tragedy");
  await expect(admin.reject("faaz", id, "again")).rejects.toThrow(/already rejected/);
});

test("params change live through the event log and out-of-range values are refused", async () => {
  await admin.setParams("faaz", { takerFeeBps: 20 });
  expect(seq.engine.params.takerFeeBps).toBe(20);
  await expect(admin.setParams("faaz", { takerFeeBps: 5_000 })).rejects.toThrow(/between/);
  const replay = await Sequencer.boot(db, []);
  expect(replay.engine.params.takerFeeBps).toBe(20);
});
