"use server";

import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { joinWaitlist, rateLimiter } from "@/lib/waitlist";

export type WaitlistState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; field?: "email" | "consent"; error: string };

const allow = rateLimiter(5, 10 * 60_000);

export async function joinAction(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(ip)) return { status: "error", error: "Whoa, that's a lot of sign-ups. Try again in a few minutes." };
  try {
    const result = await joinWaitlist(await getDb(), {
      email: String(form.get("email") ?? ""),
      consent: form.get("consent") === "on",
      source: String(form.get("source") ?? ""),
      website: String(form.get("website") ?? ""),
    });
    return result.ok ? { status: "ok" } : { status: "error", field: result.field, error: result.error };
  } catch (e) {
    console.error("waitlist join failed", e);
    return { status: "error", error: "Our cardboard server got soggy. Please try again in a moment." };
  }
}
