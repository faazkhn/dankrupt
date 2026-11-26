import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import base from "../vite.config.ts";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Serves /api from the real Hono app, running on the in-memory Devvit fake, inside the dev server. */
function api(): Plugin {
  return {
    name: "dankrupt-preview-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const fake = await server.ssrLoadModule(here("../src/server/fake-devvit.ts"));
        fake.context.username = process.env.PREVIEW_USER ?? "preview_user";
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
  plugins: [react(), tailwind(), api()],
  resolve: {
    alias: [{ find: "@devvit/web/client", replacement: here("./client-fake.ts") }, { find: "@devvit/web/server", replacement: here("../src/server/fake-devvit.ts") }, ...aliases],
    dedupe: ["react", "react-dom", "@phosphor-icons/react"],
  },
  server: { port: 5199 },
});
