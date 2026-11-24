// Runs the bot-market simulation over many seeds and writes a report against PRD §11.3.
// Usage: pnpm --filter sim sim [--seeds 20] [--days 30] [--param key=value ...]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { median, runSim, type History, type SimResult } from "./sim.ts";

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const params: Record<string, number> = {};
args.forEach((a, i) => {
  if (a === "--param") {
    const [k, v] = args[i + 1].split("=");
    params[k] = Number(v);
  }
});

const history: History = JSON.parse(readFileSync(new URL("../data/history.json", import.meta.url), "utf8"));
const seeds = flag("seeds", 20);
const days = flag("days", 30);
const results: SimResult[] = [];
const started = Date.now();
for (let seed = 1; seed <= seeds; seed++) {
  const r = runSim(history, { seed, days, warmup: 30, randomBots: 30, trendBots: 15, params });
  results.push(r);
  console.log(
    `seed ${String(seed).padStart(2)}: move ${r.medianDailyMovePct.toFixed(2)}%/day · flat ≤ ${r.longestFlatHours}h · corr ${r.medianPriceAttentionCorr.toFixed(2)} · trend ${(r.trendMedianTwr * 100).toFixed(2)}% vs random ${(r.randomMedianTwr * 100).toFixed(2)}%`,
  );
}

const move = median(results.map((r) => r.medianDailyMovePct));
const flat = Math.max(...results.map((r) => r.longestFlatHours));
const corr = median(results.map((r) => r.medianPriceAttentionCorr));
const edge = results.filter((r) => r.trendBeatsRandom).length / results.length;
const pass = (ok: boolean) => (ok ? "PASS" : "FAIL");
const rows = [
  ["Liveliness: median meme moves 3% to 15% a day", `${move.toFixed(2)}%`, pass(move >= 3 && move <= 15)],
  ["No meme sits flat for over an hour", `${flat} h longest flat stretch`, pass(flat <= 1)],
  ["Price tracks attention: daily log price vs log attention ≥ 0.6", corr.toFixed(2), pass(corr >= 0.6)],
  ["Trend-spotters beat random traders over 30 days in ≥ 80% of runs", `${(edge * 100).toFixed(0)}% of runs`, pass(edge >= 0.8)],
];
const report = `# Simulation report (ticket 17a)

${new Date().toISOString().slice(0, 16)} · ${results.length} seeds · ${days} trading days · ${results[0]?.memes ?? 0} memes (draft list) · 30 random + 15 trend bots · ${((Date.now() - started) / 1000).toFixed(0)} s
Param overrides: ${Object.keys(params).length ? JSON.stringify(params) : "none (engine defaults, 60 s ticks)"}

| PRD §11.3 criterion | Result | |
| --- | --- | --- |
${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}

Not yet measured here (ticket 17b): coin-supply growth, whale recovery, revival timing, and the other five bot types.

## Per seed

| Seed | Median daily move | Longest flat | Corr | Trend TWR | Random TWR |
| --- | --- | --- | --- | --- | --- |
${results.map((r) => `| ${r.seed} | ${r.medianDailyMovePct.toFixed(2)}% | ${r.longestFlatHours} h | ${r.medianPriceAttentionCorr.toFixed(2)} | ${(r.trendMedianTwr * 100).toFixed(2)}% | ${(r.randomMedianTwr * 100).toFixed(2)}% |`).join("\n")}
`;
mkdirSync(new URL("../reports/", import.meta.url), { recursive: true });
const name = `17a-${new Date().toISOString().slice(0, 10)}${Object.keys(params).length ? "-tuned" : ""}.md`;
writeFileSync(new URL(`../reports/${name}`, import.meta.url), report);
writeFileSync(new URL("../reports/latest.json", import.meta.url), JSON.stringify({ params, results }, null, 2));
console.log(`\n${rows.map((r) => `${r[2]}  ${r[0]}: ${r[1]}`).join("\n")}\nreport: reports/${name}`);
