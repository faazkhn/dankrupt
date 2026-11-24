import type { Db } from "@dankrupt/db";
import { PARAM_BOUNDS } from "@dankrupt/engine";
import type { Sequencer } from "./sequencer.ts";
import type { Signals } from "./signals.ts";

const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const PRE_OPEN_MS = Number(process.env.PRE_OPEN_MINUTES ?? 30) * 60_000;

/**
 * Who may use operator screens. Production: only the handles in OPERATORS. Development with no
 * OPERATORS set: every dev login, so the screens can be reviewed locally.
 */
export function isOperator(id: string): boolean {
  const list = process.env.OPERATORS;
  if (!list) return process.env.NODE_ENV !== "production";
  return list.split(",").map((s) => s.trim().toLowerCase()).includes(id);
}

/** Resolves a Wikipedia title (following redirects) to its canonical article, or null if there's none. */
export type WikiResolve = (title: string) => Promise<string | null>;
export const wikipediaResolver =
  (ua = process.env.WIKI_USER_AGENT ?? "DankruptExchange/0.1 (free paper-money meme market)"): WikiResolve =>
  async (title) => {
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
    const res = await fetch(url, { headers: { "user-agent": ua } });
    if (!res.ok) throw new Error(`wikipedia lookup failed (${res.status})`);
    const data = (await res.json()) as { query: { pages: Record<string, { title: string; missing?: string }> } };
    const page = Object.values(data.query.pages)[0];
    return page && page.missing === undefined ? page.title : null;
  };

export class AdminError extends Error {}

type CandidateInput = { memeId: string; name: string; description: string; links: string[]; wikipedia: string[] };

export class Admin {
  private db: Db;
  private seq: Sequencer;
  private signals: Signals | undefined;
  private resolve: WikiResolve;

  constructor(db: Db, seq: Sequencer, signals: Signals | undefined, resolve: WikiResolve) {
    this.db = db;
    this.seq = seq;
    this.signals = signals;
    this.resolve = resolve;
  }

  private async log(operator: string, action: string, detail: unknown) {
    await this.db.query("insert into operator_actions (operator, action, detail) values ($1, $2, $3::jsonb)", [operator, action, JSON.stringify(detail)]);
  }

  /** Validates at the trust boundary, resolves Wikipedia titles, and queues a candidate for the content screen. */
  async addCandidate(operator: string, raw: unknown) {
    const c = parseCandidate(raw);
    if (this.seq.engine.memes().some((m) => m.memeId === c.memeId)) throw new AdminError("a meme with that id is already listed");
    const resolved: string[] = [];
    for (const t of c.wikipedia) {
      const canonical = await this.resolve(t);
      if (!canonical) throw new AdminError(`no Wikipedia article called "${t}"`);
      resolved.push(canonical);
    }
    const { rows } = await this.db.query<{ id: number }>(
      `insert into candidates (meme_id, name, description, links, wikipedia) values ($1, $2, $3, $4::jsonb, $5::jsonb) returning id::int as id`,
      [c.memeId, c.name, c.description, JSON.stringify(c.links), JSON.stringify(resolved)],
    );
    await this.log(operator, "candidate.add", { id: rows[0].id, ...c, wikipedia: resolved });
    return rows[0].id;
  }

  async candidates() {
    const { rows } = await this.db.query<Record<string, unknown>>(
      "select id::int as id, meme_id, name, description, links, wikipedia, status, reason, source, created_at::text, decided_at::text, decided_by from candidates order by created_at desc limit 200",
    );
    return rows;
  }

  /** Approving starts a 30-minute pre-open (players trade with each other); then the house opens at 100. */
  async approve(operator: string, id: number) {
    const c = await this.one(id);
    if (c.status !== "candidate") throw new AdminError(`already ${c.status}`);
    const wiki = c.wikipedia as string[];
    if (!wiki.length) throw new AdminError("map at least one data source first");
    const out = await this.seq.submit({
      type: "meme.list",
      memeId: c.meme_id as string,
      name: c.name as string,
      price: 100,
      depth: 500_000,
      preOpenUntil: Date.now() + PRE_OPEN_MS,
    });
    if (out.rejects.length) throw new AdminError(out.rejects[0].reason);
    await this.db.query(
      `insert into meme_meta (meme_id, description, links) values ($1, $2, $3::jsonb)
       on conflict (meme_id) do update set description = excluded.description, links = excluded.links`,
      [c.meme_id, c.description, JSON.stringify(c.links)],
    );
    await this.signals?.mapSources(c.meme_id as string, wiki);
    await this.db.query("update candidates set status = 'approved', decided_at = now(), decided_by = $2 where id = $1", [id, operator]);
    await this.log(operator, "candidate.approve", { id, memeId: c.meme_id });
    void this.signals?.refresh().catch((e) => console.error("signals refresh after listing failed", e));
  }

  async reject(operator: string, id: number, reason: unknown) {
    const why = typeof reason === "string" ? reason.trim().slice(0, 200) : "";
    if (!why) throw new AdminError("say which content-screen rule it fails");
    const c = await this.one(id);
    if (c.status !== "candidate") throw new AdminError(`already ${c.status}`);
    await this.db.query("update candidates set status = 'rejected', reason = $2, decided_at = now(), decided_by = $3 where id = $1", [id, why, operator]);
    await this.log(operator, "candidate.reject", { id, memeId: c.meme_id, reason: why });
  }

  params() {
    return { values: this.seq.engine.params, bounds: PARAM_BOUNDS };
  }

  async setParams(operator: string, raw: unknown) {
    const params = (raw ?? {}) as Record<string, unknown>;
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(params)) clean[k] = Number(v);
    const out = await this.seq.submit({ type: "params.set", params: clean });
    if (out.rejects.length) throw new AdminError(out.rejects[0].reason);
    await this.log(operator, "params.set", clean);
  }

  async actions(limit = 50) {
    const { rows } = await this.db.query("select time::text, operator, action, detail from operator_actions order by time desc limit $1", [limit]);
    return rows;
  }

  async memeMeta(memeId: string) {
    const { rows } = await this.db.query<{ description: string; links: string[] }>("select description, links from meme_meta where meme_id = $1", [memeId]);
    return rows[0] ?? { description: "", links: [] };
  }

  async setMemeMeta(operator: string, memeId: string, raw: unknown) {
    const { description, links } = parseMeta(raw);
    await this.db.query(
      `insert into meme_meta (meme_id, description, links) values ($1, $2, $3::jsonb)
       on conflict (meme_id) do update set description = excluded.description, links = excluded.links`,
      [memeId, description, JSON.stringify(links)],
    );
    await this.log(operator, "meme.meta", { memeId, description, links });
  }

  private async one(id: number) {
    const { rows } = await this.db.query<Record<string, unknown>>("select * from candidates where id = $1", [id]);
    if (!rows[0]) throw new AdminError("no such candidate");
    return rows[0];
  }
}

function parseMeta(raw: unknown) {
  const o = (raw ?? {}) as Record<string, unknown>;
  const description = typeof o.description === "string" ? o.description.trim().slice(0, 600) : "";
  const links = (Array.isArray(o.links) ? o.links : [])
    .filter((l): l is string => typeof l === "string")
    .map((l) => l.trim())
    .filter((l) => /^https:\/\/[^\s]+$/.test(l))
    .slice(0, 5);
  return { description, links };
}

function parseCandidate(raw: unknown): CandidateInput {
  const o = (raw ?? {}) as Record<string, unknown>;
  const memeId = typeof o.memeId === "string" ? o.memeId.trim().toLowerCase() : "";
  if (!SLUG.test(memeId)) throw new AdminError("id must be 2–41 lowercase letters, numbers or dashes");
  const name = typeof o.name === "string" ? o.name.trim().slice(0, 60) : "";
  if (!name) throw new AdminError("name is required");
  const wikipedia = (Array.isArray(o.wikipedia) ? o.wikipedia : [])
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim())
    .slice(0, 5);
  return { memeId, name, ...parseMeta(o), wikipedia };
}
