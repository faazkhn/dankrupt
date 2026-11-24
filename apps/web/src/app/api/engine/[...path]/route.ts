import { cookies } from "next/headers";

const ENGINE = process.env.ENGINE_URL ?? "http://localhost:4000";
const ALLOWED = new Set(["health", "memes", "markets", "candles", "book", "preview", "me", "orders", "orders/cancel"]);

/** Forwards a fixed set of engine API calls, attaching the player's identity from their cookie. */
async function proxy(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const route = path.join("/");
  if (!ALLOWED.has(route)) return Response.json({ error: "not found" }, { status: 404 });
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
