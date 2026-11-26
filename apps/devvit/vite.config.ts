import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { devvit } from "@devvit/start/vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** The client reuses the web app's pages and components; these aliases swap in the Devvit pieces. */
export default defineConfig({
  plugins: [react(), tailwind(), devvit()],
  resolve: {
    alias: [
      { find: "@/lib/market", replacement: here("./src/client/market.ts") },
      { find: "@/components/ShareButton", replacement: here("./src/client/shims/share.tsx") },
      { find: /^@\//, replacement: here("../web/src/") },
      { find: "next/link", replacement: here("./src/client/shims/link.tsx") },
      { find: "next/image", replacement: here("./src/client/shims/image.tsx") },
      { find: "@phosphor-icons/react/ssr", replacement: "@phosphor-icons/react" },
    ],
    dedupe: ["react", "react-dom", "@phosphor-icons/react"],
  },
});
