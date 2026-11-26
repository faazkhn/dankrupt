import { navigateTo } from "@devvit/web/client";
import { useSyncExternalStore } from "react";

/** In-memory routing: the webview keeps one document, and leaving it goes through navigateTo. */
let path = "/trade";
const listeners = new Set<() => void>();

export function navigate(href: string) {
  if (/^https?:\/\//.test(href)) return navigateTo(href);
  if (href === "/dev-login") return navigateTo("https://www.reddit.com/login");
  path = href === "/" ? "/trade" : href;
  window.scrollTo(0, 0);
  for (const l of listeners) l();
}

export function usePath() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => path,
  );
}

/** External links in reused web components (target=_blank) must leave through navigateTo too. */
export function captureExternalLinks() {
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href]");
    const href = a?.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    e.preventDefault();
    navigate(href);
  });
}
