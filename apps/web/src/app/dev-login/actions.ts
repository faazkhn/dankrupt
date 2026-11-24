"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** shortcut: dev-only login by handle; ticket 16 replaces it with Google sign-in. */
export async function devLogin(form: FormData) {
  if (process.env.NODE_ENV === "production") throw new Error("dev login is disabled in production");
  const handle = String(form.get("handle") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,32}$/.test(handle)) redirect("/dev-login?error=1");
  (await cookies()).set("dk_dev_user", handle, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/trade");
}
