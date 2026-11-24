import type { Db } from "@dankrupt/db";

export type JoinInput = { email: string; consent: boolean; source?: string; website?: string };
export type JoinResult = { ok: true } | { ok: false; field: "email" | "consent"; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Adds an email to the waitlist. Duplicates and bots get the same answer as real sign-ups. */
export async function joinWaitlist(db: Db, input: JoinInput): Promise<JoinResult> {
  if (input.website) return { ok: true }; // honeypot: only bots fill the hidden field
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email))
    return { ok: false, field: "email", error: "That doesn't look like an email. Check for typos?" };
  if (!input.consent)
    return { ok: false, field: "consent", error: "Tick the box so we're allowed to email you." };
  const source = input.source?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || null;
  await db.query(
    `insert into waitlist (email, consent_at, source) values ($1, now(), $2) on conflict (email) do nothing`,
    [email, source],
  );
  return { ok: true };
}

/** shortcut: in-memory, per process; move to Redis if the web app ever runs more than one process. */
export function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
