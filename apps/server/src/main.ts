import { readFileSync } from "node:fs";
import { createDb, migrate } from "@dankrupt/db";
import { Feed } from "./feed.ts";
import { createApi } from "./http.ts";
import { Sequencer, type SeedMeme } from "./sequencer.ts";

const db = createDb(process.env.DATABASE_URL ?? `pglite:${process.cwd()}/.data/pglite`);
await migrate(db);
const seed: SeedMeme[] = JSON.parse(readFileSync(new URL("../seed/memes.json", import.meta.url), "utf8"));
const feed = await Feed.create(db);
const seq = await Sequencer.boot(db, seed, [feed.onApplied]);
await seq.clock(); // catch the house up on the time the server was down
seq.startClock(1_000);
const server = createApi(seq, feed);
feed.attach(server);
const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => console.log(`dankrupt engine on :${port}, replayed to seq ${seq.engine.seq}`));
