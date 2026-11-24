"use client";

import { useState } from "react";
import { ShareNetworkIcon } from "@phosphor-icons/react";

/** Shares a trade's card link: the phone share sheet where there is one, otherwise copy to clipboard. */
export function ShareButton({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-candy is-small px-3 text-base"
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        if (navigator.share) {
          try {
            await navigator.share({ title, url });
            return;
          } catch {
            /* cancelled: fall through to copy */
          }
        }
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2_500);
      }}
    >
      <ShareNetworkIcon weight="bold" aria-hidden="true" />
      <span aria-live="polite">{copied ? "Link copied!" : "Share"}</span>
    </button>
  );
}
