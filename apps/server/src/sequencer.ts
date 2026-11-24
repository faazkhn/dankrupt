import type { Db } from "@dankrupt/db";
import { Engine, type EngineEvent, type EventBody, type JournalLine, type Output } from "@dankrupt/engine";

export type SeedMeme = { memeId: string; name: string; price: number; depth: number };
type Listener = (ev: EngineEvent, out: Output) => void;

/**
 * Owns the only Engine. Each input is numbered, written to the event log, and only then applied
 * (write-ahead, ADR-0001). Boot replays the log, so a restart rebuilds identical state.
 */
export class Sequencer {
  readonly engine: Engine;
  private db: Db;
  private tail: Promise<unknown> = Promise.resolve();
  private listeners: Listener[] = [];
  private lastTime = 0;

  private constructor(db: Db, engine: Engine) {
    this.db = db;
    this.engine = engine;
  }

  static async boot(db: Db, seed: SeedMeme[] = []): Promise<Sequencer> {
    const engine = new Engine();
    const events = (await db.query<{ body: EngineEvent }>("select body from events order by seq")).rows.map((r) => r.body);
    const { rows: j } = await db.query<{ seq: number | null }>("select max(seq)::float8 as seq from journal");
    const journalled = j[0]?.seq ?? 0;
    const missing: JournalLine[] = [];
    for (const ev of events) {
      const out = engine.apply(ev);
      if (ev.seq > journalled) missing.push(...out.journal); // catch up a projection cut short by a crash
    }
    const s = new Sequencer(db, engine);
    s.lastTime = events.at(-1)?.time ?? 0;
    await s.writeJournal(missing);
    const listed = new Set(engine.memes().map((m) => m.memeId));
    for (const m of seed) if (!listed.has(m.memeId)) await s.submit({ type: "meme.list", ...m });
    return s;
  }

  /** Every applied event and its output, for fan-out (websockets, projections). */
  onApplied(fn: Listener) {
    this.listeners.push(fn);
  }

  /** Serialises submissions: one event fully persisted and applied before the next starts. */
  submit(body: EventBody): Promise<Output> {
    const run = this.tail.then(async () => {
      const ev = { ...body, seq: this.engine.seq + 1, time: Math.max(Date.now(), this.lastTime) } as EngineEvent;
      // shortcut: one insert per event; group commit comes with the load-test ticket (19).
      await this.db.query("insert into events (seq, time, body) values ($1, to_timestamp($2 / 1000.0), $3::jsonb)", [
        ev.seq,
        ev.time,
        JSON.stringify(ev),
      ]);
      const out = this.engine.apply(ev);
      this.lastTime = ev.time;
      await this.writeJournal(out.journal);
      for (const fn of this.listeners) fn(ev, out);
      return out;
    });
    this.tail = run.catch(() => undefined); // one failure must not wedge the queue
    return run;
  }

  private async writeJournal(lines: JournalLine[]) {
    if (!lines.length) return;
    const values: unknown[] = [];
    const tuples = lines.map((l, i) => {
      values.push(l.seq, l.account, l.commodity, l.amount);
      const n = i * 4;
      return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4})`;
    });
    await this.db.query(`insert into journal (seq, account, commodity, amount) values ${tuples.join(", ")}`, values);
  }
}
