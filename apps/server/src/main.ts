import { readFileSync } from "node:fs";
import { createDb, migrate } from "@dankrupt/db";
import { Admin, wikipediaResolver } from "./admin.ts";
import { InGame } from "./attention.ts";
import { Feed } from "./feed.ts";
import { Projections } from "./projections.ts";
import { createApi } from "./http.ts";
import { Sequencer, type SeedMeme } from "./sequencer.ts";
import { Signals, wikipediaClient } from "./signals.ts";

const db = createDb(process.env.DATABASE_URL ?? `pglite:${process.cwd()}/.data/pglite`);
await migrate(db);
const seed: SeedMeme[] = JSON.parse(readFileSync(new URL("../seed/memes.json", import.meta.url), "utf8"));
const feed = await Feed.create(db);
const projections = new Projections(db);
const seq = await Sequencer.boot(db, seed, [feed.onApplied, projections.onApplied]);
await projections.flush();
await projections.snapshotEquity(seq.engine); // a fresh point for every account at boot
projections.start(seq.engine);
feed.statusOf = (id) => {
  const m = seq.engine.meme(id);
  return { status: m.status, opensAt: m.opensAt, comebackAt: m.comebackAt, fair: m.fairValue };
};
await seq.clock(); // catch the house up on the time the server was down
seq.startClock(1_000);
const ingame = new InGame(db);
const signals = new Signals(db, seq, wikipediaClient(), ingame);
for (const m of seed) await signals.mapSources(m.memeId, m.wikipedia ?? [], m.youtube ?? []);
signals.start();
const admin = new Admin(db, seq, signals, wikipediaResolver());
const server = createApi(seq, feed, signals, projections, db, admin, ingame);
feed.attach(server);
const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => console.log(`dankrupt engine on :${port}, replayed to seq ${seq.engine.seq}`));
