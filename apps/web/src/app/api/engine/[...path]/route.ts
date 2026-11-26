import { cookies } from "next/headers";

const ENGINE = process.env.ENGINE_URL ?? "http://localhost:4000";
const ALLOWED = new Set(["health", "dank", "memes", "markets", "candles", "book", "attention", "leaderboard", "preview", "me", "orders", "orders/cancel", "reset", "notices", "notices/read", "profile", "whoami", "meme-meta", "view", "watchlist"]);

/** Forwards a fixed set of engine API calls, attaching the player's identity from their cookie. */
async function proxy(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const route = path.join("/");
  const adminRoute = /^admin\/(candidates(\/\d+\/(approve|reject))?|params|actions|meme-meta|listed|halt|dashboard)$/.test(route);
  if (!ALLOWED.has(route) && !adminRoute) return Response.json({ error: "not found" }, { status: 404 });
  const user = (await cookies()).get("dk_dev_user")?.value;
  try {
    const res = await fetch(`${ENGINE}/api/${route}${new URL(req.url).search}`, {
      method: req.method,
      headers: { "content-type": "application/json", ...(user ? { "x-dev-user": user } : {}) },
      body: req.method === "POST" ? await req.text() : undefined,
      cache: "no-store",
    });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ error: "The exchange engine is offline. Try again in a moment." }, { status: 503 });
  }
}

export { proxy as GET, proxy as POST };
