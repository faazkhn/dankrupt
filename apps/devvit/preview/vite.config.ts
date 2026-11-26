import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import base from "../vite.config.ts";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// DEMO_AT (an ISO time) runs the preview's clock, server and page, as if it were then: for demo footage.
const OFFSET = process.env.DEMO_AT ? Date.parse(process.env.DEMO_AT) - Date.now() : 0;
if (OFFSET) {
  const real = Date.now;
  Date.now = () => real() + OFFSET;
}

/** Serves /api from the real Hono app, running on the in-memory Devvit fake, inside the dev server. */
function api(): Plugin {
  return {
    name: "dankrupt-preview-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/") && req.url !== "/__demo") return next();
        const fake = await server.ssrLoadModule(here("../src/server/fake-devvit.ts"));
        fake.context.username = String(req.headers["x-preview-user"] ?? process.env.PREVIEW_USER ?? "preview_user");
        if (req.url === "/__demo") {
          const { seedDemo } = await server.ssrLoadModule(here("./demo.ts"));
          res.setHeader("content-type", "application/json");
          return res.end(JSON.stringify(await seedDemo(fake.context.username)));
        }
        const { api } = await server.ssrLoadModule(here("../src/server/api.ts"));
        let body = "";
        for await (const c of req) body += c;
        const r = await api.request(req.url.slice(4), { method: req.method, body: req.method === "POST" ? body : undefined, headers: { "content-type": "application/json" } });
        res.statusCode = r.status;
        res.setHeader("content-type", "application/json");
        res.end(await r.text());
      });
    },
  };
}

const aliases = (base as { resolve: { alias: { find: string | RegExp; replacement: string }[] } }).resolve.alias;
export default defineConfig({
  root: here("../src/client"),
  plugins: [
    react(),
    tailwind(),
    api(),
    {
      name: "dankrupt-preview-clock",
      transformIndexHtml: (html) =>
        OFFSET ? html.replace("<head>", `<head><script>(() => { const r = Date.now; Date.now = () => r() + ${OFFSET}; })();</script>`) : html,
    },
  ],
  resolve: {
    alias: [{ find: "@devvit/web/client", replacement: here("./client-fake.ts") }, { find: "@devvit/web/server", replacement: here("../src/server/fake-devvit.ts") }, ...aliases],
    dedupe: ["react", "react-dom", "@phosphor-icons/react"],
  },
  server: { port: 5199 },
});
