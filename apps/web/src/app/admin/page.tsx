"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon, CheckIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { TradeHeader } from "@/components/TradeHeader";
import { adminCall, getWhoami, useMe } from "@/lib/market";

type Candidate = {
  id: number;
  meme_id: string;
  name: string;
  description: string;
  links: string[];
  wikipedia: string[];
  status: "candidate" | "approved" | "rejected";
  reason: string | null;
  created_at: string;
  decided_by: string | null;
};
type Params = { values: Record<string, number>; bounds: Record<string, [number, number]> };
type Action = { time: string; operator: string; action: string; detail: Record<string, unknown> };
type Listed = { memeId: string; name: string; status: string; price: number; heat: number };

const SCREEN = ["Hate symbols or slurs", "Sexual content", "Real private individuals", "Tragedies or violent events", "Involves minors", "Real-money tokens"];
const PARAM_LABELS: Record<string, string> = {
  takerFeeBps: "Taker fee (bps)",
  spreadBase: "Base spread s₀",
  spreadVolCoef: "Spread vol coefficient s₁",
  spreadMax: "Max spread",
  driftHalfLifeHours: "Drift half-life τ (hours)",
  vwapWeight: "VWAP weight ω",
  noisePerSqrtHour: "Chart noise σn (per √h)",
  initialMargin: "Initial margin m_I",
  maintenanceMargin: "Maintenance margin m_M",
  liquidationFeeBps: "Liquidation fee (bps)",
  borrowBasePerHour: "Borrow r₀ (per hour)",
  borrowSlopePerHour: "Borrow r₁ (per hour)",
};

export default function AdminPage() {
  const { me } = useMe();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [params, setParams] = useState<Params | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [actions, setActions] = useState<Action[]>([]);
  const [listed, setListed] = useState<Listed[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [c, p, a, l] = await Promise.all([
      adminCall<Candidate[]>("candidates"),
      adminCall<Params>("params"),
      adminCall<Action[]>("actions"),
      adminCall<Listed[]>("listed"),
    ]);
    setListed(l);
    setCands(c);
    setParams(p);
    setActions(a);
  }, []);

  useEffect(() => {
    getWhoami()
      .then((w) => {
        setAllowed(w.operator);
        if (w.operator) void load();
      })
      .catch(() => setAllowed(false));
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <>
      <TradeHeader me={me} />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 pt-6 pb-16">
        <Link href="/trade" className="btn-candy is-secondary is-small px-5">
          <ArrowLeftIcon weight="bold" className="size-6" aria-hidden="true" /> Markets
        </Link>
        <h1 className="outline-text font-display text-5xl">Operator desk</h1>
        {allowed === false && <p className="paper p-5 font-bold">Operators only.</p>}
        {msg && (
          <p role="status" className={`paper p-4 font-bold ${msg.ok ? "text-mint" : "text-berry"}`}>
            {msg.text}
          </p>
        )}
        {allowed && (
          <>
            <AddCandidate onAdd={(c) => act(() => adminCall("candidates", c), `${c.name} is in the listing queue.`)} />

            <section className="paper p-6">
              <h2 className="font-display text-3xl">Listing queue</h2>
              <p className="text-sm font-bold text-ink-soft">Content screen: reject {SCREEN.join(", ").toLowerCase()}.</p>
              {cands.length === 0 && <p className="mt-3 font-bold text-ink-soft">No candidates yet.</p>}
              <ul className="mt-3 space-y-3">
                {cands.map((c) => (
                  <li key={c.id} className="rounded-2xl border-[3px] border-ink/30 bg-paper-shade/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-2xl">
                          {c.name} <span className="text-base text-ink-soft">/{c.meme_id}</span>
                        </p>
                        {c.description && <p className="font-semibold">{c.description}</p>}
                        <p className="text-sm font-bold text-ink-soft">Wikipedia: {c.wikipedia.join(", ") || "none mapped"}</p>
                        {c.status !== "candidate" && (
                          <p className={`text-sm font-black ${c.status === "approved" ? "text-mint" : "text-berry"}`}>
                            {c.status === "approved" ? "Listed" : `Rejected: ${c.reason}`} by @{c.decided_by}
                          </p>
                        )}
                      </div>
                      {c.status === "candidate" && (
                        <div className="flex flex-wrap gap-2">
                          <button className="btn-candy is-buy is-small px-3" onClick={() => act(() => adminCall(`candidates/${c.id}/approve`, {}), `${c.name} is listed at 100.`)}>
                            <CheckIcon weight="bold" aria-hidden="true" /> Approve
                          </button>
                          <RejectButton onReject={(reason) => act(() => adminCall(`candidates/${c.id}/reject`, { reason }), `${c.name} rejected.`)} />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="paper p-6">
              <h2 className="font-display text-3xl">Listed memes</h2>
              <p className="text-sm font-bold text-ink-soft">Halting settles every position at the mark and stops trading. It can&apos;t be undone.</p>
              <ul className="mt-3 divide-y-2 divide-dashed divide-ink/20">
                {listed.map((m) => (
                  <li key={m.memeId} className="flex flex-wrap items-center justify-between gap-3 py-2 font-bold">
                    <span>
                      {m.name} <span className="text-sm text-ink-soft">/{m.memeId}</span>
                      <span className="ml-2 rounded bg-ink/10 px-1.5 text-xs uppercase">{m.status}</span>
                    </span>
                    {m.status !== "halted" && (
                      <HaltButton
                        name={m.name}
                        onHalt={(reason) => act(() => adminCall("halt", { memeId: m.memeId, reason }), `${m.name} halted and settled.`)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {params && (
              <section className="paper p-6">
                <h2 className="font-display text-3xl">Live params</h2>
                <p className="text-sm font-bold text-ink-soft">Changes go through the event log, so replays stay exact. No redeploy.</p>
                <form
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const changed = Object.fromEntries(Object.entries(edits).filter(([k, v]) => v !== "" && Number(v) !== params.values[k]));
                    if (!Object.keys(changed).length) return setMsg({ ok: false, text: "Nothing changed." });
                    void act(() => adminCall("params", changed).then(() => setEdits({})), `Updated ${Object.keys(changed).join(", ")}.`);
                  }}
                >
                  {Object.keys(params.bounds).map((k) => (
                    <label key={k} className="block">
                      <span className="text-sm font-extrabold">{PARAM_LABELS[k] ?? k}</span>
                      <input
                        inputMode="decimal"
                        value={edits[k] ?? String(params.values[k])}
                        onChange={(e) => setEdits((x) => ({ ...x, [k]: e.target.value }))}
                        className="mt-1 min-h-11 w-full rounded-xl border-[3px] border-ink bg-white px-3 font-bold tabular-nums"
                      />
                      <span className="text-xs font-bold text-ink-soft">
                        {params.bounds[k][0]} to {params.bounds[k][1]}
                      </span>
                    </label>
                  ))}
                  <button className="btn-candy sm:col-span-2">Apply changes</button>
                </form>
              </section>
            )}

            <section className="paper p-6">
              <h2 className="font-display text-3xl">Recent operator actions</h2>
              <ul className="mt-2 divide-y-2 divide-dashed divide-ink/20 text-sm">
                {actions.map((a, i) => (
                  <li key={i} className="py-2 font-bold">
                    <span className="text-ink-soft">{new Date(a.time).toLocaleString("en-US")}</span> · @{a.operator} · {a.action}
                    <code className="block truncate text-xs text-ink-soft">{JSON.stringify(a.detail)}</code>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function AddCandidate({ onAdd }: { onAdd: (c: { memeId: string; name: string; description: string; links: string[]; wikipedia: string[] }) => void }) {
  const [f, setF] = useState({ memeId: "", name: "", description: "", links: "", wikipedia: "" });
  const field = (k: keyof typeof f, label: string, hint?: string) => (
    <label className="block">
      <span className="text-sm font-extrabold">{label}</span>
      <input
        value={f[k]}
        onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
        className="mt-1 min-h-11 w-full rounded-xl border-[3px] border-ink bg-white px-3 font-bold"
      />
      {hint && <span className="text-xs font-bold text-ink-soft">{hint}</span>}
    </label>
  );
  return (
    <section className="paper p-6">
      <h2 className="font-display text-3xl">Add a candidate</h2>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const split = (s: string) => s.split(/[\n,|]/).map((x) => x.trim()).filter(Boolean);
          onAdd({ memeId: f.memeId, name: f.name, description: f.description, links: split(f.links), wikipedia: split(f.wikipedia) });
        }}
      >
        {field("name", "Name", "As players will see it")}
        {field("memeId", "Id", "lowercase-with-dashes, used in links")}
        {field("wikipedia", "Wikipedia article titles", "Separate several with | ; checked against Wikipedia")}
        {field("links", "Links", "https only, separate with |")}
        <label className="block sm:col-span-2">
          <span className="text-sm font-extrabold">Short description</span>
          <textarea
            value={f.description}
            onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded-xl border-[3px] border-ink bg-white px-3 py-2 font-bold"
          />
        </label>
        <button className="btn-candy sm:col-span-2">
          <PlusIcon weight="bold" aria-hidden="true" /> Add to the queue
        </button>
      </form>
    </section>
  );
}

function HaltButton({ name, onHalt }: { name: string; onHalt: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="btn-candy is-muted is-small px-3 text-sm" onClick={() => setOpen(true)}>
        Halt…
      </button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">Halt {name} because:</span>
      {["Takedown request", ...SCREEN].map((r) => (
        <button key={r} className="btn-candy is-sell is-small px-2 text-sm" onClick={() => onHalt(r)}>
          {r}
        </button>
      ))}
      <button className="btn-candy is-secondary is-small px-2 text-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

function RejectButton({ onReject }: { onReject: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="btn-candy is-sell is-small px-3" onClick={() => setOpen(true)}>
        <XIcon weight="bold" aria-hidden="true" /> Reject
      </button>
    );
  return (
    <div className="flex flex-wrap gap-2">
      {SCREEN.map((r) => (
        <button key={r} className="btn-candy is-muted is-small px-2 text-sm" onClick={() => onReject(r)}>
          {r}
        </button>
      ))}
      <button className="btn-candy is-small is-secondary px-2 text-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
