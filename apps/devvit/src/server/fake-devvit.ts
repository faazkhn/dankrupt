/** In-memory stand-in for `@devvit/web/server`, enough for the API tests. Tests only. */
type Z = Map<string, number>;
const strings = new Map<string, { v: string; exp?: number }>();
const hashes = new Map<string, Map<string, string>>();
const zsets = new Map<string, Z>();
let version = new Map<string, number>();
const bump = (k: string) => version.set(k, (version.get(k) ?? 0) + 1);
const live = (k: string) => {
  const s = strings.get(k);
  if (s?.exp !== undefined && s.exp <= Date.now()) strings.delete(k);
  return strings.get(k);
};
const z = (k: string) => zsets.get(k) ?? (zsets.set(k, new Map()), zsets.get(k)!);
const h = (k: string) => hashes.get(k) ?? (hashes.set(k, new Map()), hashes.get(k)!);

type RangeOpts = { by: "score" | "rank" | "lex"; reverse?: boolean; limit?: { offset: number; count: number } };

export const redis = {
  async get(k: string) {
    return live(k)?.v;
  },
  async set(k: string, v: string, o?: { nx?: boolean; expiration?: Date }) {
    if (o?.nx && live(k)) return null as unknown as string;
    strings.set(k, { v, exp: o?.expiration?.getTime() });
    bump(k);
    return "OK";
  },
  async del(...ks: string[]) {
    for (const k of ks) (strings.delete(k), hashes.delete(k), zsets.delete(k), bump(k));
  },
  async mGet(ks: string[]) {
    return ks.map((k) => live(k)?.v ?? null);
  },
  async incrBy(k: string, n: number) {
    const v = Number(live(k)?.v ?? 0) + n;
    strings.set(k, { v: String(v) });
    bump(k);
    return v;
  },
  async hGet(k: string, f: string) {
    return hashes.get(k)?.get(f);
  },
  async hSet(k: string, fv: Record<string, string>) {
    for (const [f, v] of Object.entries(fv)) h(k).set(f, v);
    return Object.keys(fv).length;
  },
  async hGetAll(k: string) {
    return Object.fromEntries(hashes.get(k) ?? []);
  },
  async hIncrBy(k: string, f: string, n: number) {
    const v = Number(h(k).get(f) ?? 0) + n;
    h(k).set(f, String(v));
    return v;
  },
  async zAdd(k: string, ...ms: { member: string; score: number }[]) {
    for (const m of ms) z(k).set(m.member, m.score);
    return ms.length;
  },
  async zRem(k: string, ms: string[]) {
    for (const m of ms) z(k).delete(m);
    return ms.length;
  },
  async zScore(k: string, m: string) {
    return zsets.get(k)?.get(m);
  },
  async zCard(k: string) {
    return zsets.get(k)?.size ?? 0;
  },
  async zRange(k: string, start: number | string, stop: number | string, o: RangeOpts) {
    let rows = [...(zsets.get(k) ?? [])].map(([member, score]) => ({ member, score })).sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));
    if (o.reverse) rows.reverse();
    if (o.by === "score") {
      const [lo, hi] = o.reverse ? [Number(stop), Number(start)] : [Number(start), Number(stop)];
      rows = rows.filter((r) => r.score >= lo && r.score <= hi);
      if (o.limit) rows = rows.slice(o.limit.offset, o.limit.offset + o.limit.count);
      return rows;
    }
    const n = rows.length;
    const s = Number(start) < 0 ? n + Number(start) : Number(start);
    const e = Number(stop) < 0 ? n + Number(stop) : Number(stop);
    return rows.slice(s, e + 1);
  },
  async zRemRangeByScore(k: string, lo: number, hi: number) {
    const s = zsets.get(k);
    let n = 0;
    for (const [m, sc] of s ?? []) if (sc >= lo && sc <= hi) (s!.delete(m), n++);
    return n;
  },
  async zRemRangeByRank(k: string, start: number, stop: number) {
    const rows = await redis.zRange(k, start, stop, { by: "rank" });
    for (const r of rows) zsets.get(k)?.delete(r.member);
    return rows.length;
  },
  async watch(...keys: string[]) {
    const seen = new Map(keys.map((k) => [k, version.get(k) ?? 0]));
    const queue: (() => Promise<unknown>)[] = [];
    let queuing = false;
    const tx: Record<string, unknown> = {
      async multi() {
        queuing = true;
      },
      async unwatch() {},
      async discard() {
        queue.length = 0;
      },
      async exec() {
        if ([...seen].some(([k, v]) => (version.get(k) ?? 0) !== v)) return [];
        const out = [];
        for (const q of queue) out.push(await q());
        return out;
      },
    };
    for (const name of ["set", "zAdd", "hSet", "del", "zRemRangeByScore"] as const)
      tx[name] = async (...args: unknown[]) => {
        if (!queuing) throw new Error("fake: write outside multi");
        queue.push(() => (redis[name] as (...a: unknown[]) => Promise<unknown>)(...args));
        return tx;
      };
    return tx as unknown as { multi(): Promise<void>; exec(): Promise<unknown[]>; unwatch(): Promise<void>; set: typeof redis.set; zAdd: typeof redis.zAdd };
  },
};

export const sent: { channel: string; msg: unknown }[] = [];
export const realtime = { async send(channel: string, msg: unknown) { sent.push({ channel, msg }); } };

export const context: { username?: string; subredditName?: string; postId?: string } = { subredditName: "dankrupt_dev", postId: "t3_abc" };
export const flairs = new Map<string, string>();
export const posts: string[] = [];
export const mods = new Set<string>(["modname"]);
export const reddit = {
  async getCurrentUsername() { return context.username; },
  getModerators({ username }: { username?: string }) {
    return { all: async () => (username && mods.has(username) ? [{ username }] : []) };
  },
  async submitCustomPost({ title }: { title: string }) { posts.push(title); return { id: `t3_${posts.length}` }; },
  async setUserFlair({ username, text }: { username: string; text: string }) { flairs.set(username, text); },
  async removeUserFlair(_s: string, username: string) { flairs.delete(username); },
};
export const settings = { async get() { return undefined; } };

export function reset() {
  strings.clear(); hashes.clear(); zsets.clear(); version = new Map(); sent.length = 0; flairs.clear(); posts.length = 0;
}
