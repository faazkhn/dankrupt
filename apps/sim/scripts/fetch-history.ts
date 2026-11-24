// Downloads each simulator meme's Wikipedia history: monthly views to find its peak, then 180 daily
// counts from 60 days before the peak month. One request at a time, ~1.2 s apart, backing off on 429.
// Writes data/history.json. Wikimedia pageview data is CC0.
import { readFileSync, writeFileSync } from "node:fs";

const UA = process.env.WIKI_USER_AGENT ?? "DankruptExchange/0.1 (free paper-money meme market; simulator)";
const { memes } = JSON.parse(readFileSync(new URL("../memes.json", import.meta.url), "utf8")) as { memes: { id: string; title: string }[] };
let last = 0;

async function get(url: string): Promise<{ items: { timestamp: string; views: number }[] } | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = Math.max(0, last + 1_200 - Date.now()) + (attempt ? 2 ** attempt * 2_000 : 0);
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) continue;
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json() as never;
  }
  throw new Error(`rate-limited: ${url}`);
}

const base = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user";
const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
const out: Record<string, { title: string; start: string; daily: number[] }> = {};
for (const m of memes) {
  const t = encodeURIComponent(m.title.replaceAll(" ", "_"));
  const monthly = await get(`${base}/${t}/monthly/2015070100/2026103100`);
  if (!monthly?.items.length) {
    console.log(`skip ${m.id}: no data`);
    continue;
  }
  const peak = monthly.items.reduce((a, b) => (b.views > a.views ? b : a));
  const peakMonth = new Date(Date.UTC(+peak.timestamp.slice(0, 4), +peak.timestamp.slice(4, 6) - 1, 1));
  const start = new Date(Math.max(Date.UTC(2015, 6, 1), peakMonth.getTime() - 60 * 86_400_000));
  const end = new Date(Math.min(Date.UTC(2026, 9, 31), start.getTime() + 179 * 86_400_000));
  const daily = await get(`${base}/${t}/daily/${ymd(start)}/${ymd(end)}`);
  const byDay = new Map((daily?.items ?? []).map((i) => [i.timestamp.slice(0, 8), i.views]));
  const series: number[] = [];
  for (let d = start.getTime(); d <= end.getTime(); d += 86_400_000) series.push(byDay.get(ymd(new Date(d))) ?? 0);
  out[m.id] = { title: m.title, start: start.toISOString().slice(0, 10), daily: series };
  console.log(`${m.id.padEnd(22)} peak ${peak.timestamp.slice(0, 6)} max/day ${Math.max(...series)}`);
}
writeFileSync(new URL("../data/history.json", import.meta.url), JSON.stringify(out));
console.log(`saved ${Object.keys(out).length} memes`);
