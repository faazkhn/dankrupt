import { readFileSync } from "node:fs";
import { createDb, migrate } from "@dankrupt/db";
import { createApi } from "./http.ts";
import { Sequencer, type SeedMeme } from "./sequencer.ts";

const db = createDb(process.env.DATABASE_URL ?? `pglite:${process.cwd()}/.data/pglite`);
await migrate(db);
const seed: SeedMeme[] = JSON.parse(readFileSync(new URL("../seed/memes.json", import.meta.url), "utf8"));
const seq = await Sequencer.boot(db, seed);
const port = Number(process.env.PORT ?? 4000);
createApi(seq).listen(port, () => console.log(`dankrupt engine on :${port}, replayed to seq ${seq.engine.seq}`));
