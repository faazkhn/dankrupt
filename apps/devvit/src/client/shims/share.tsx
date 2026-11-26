import { context, navigateTo, showToast } from "@devvit/web/client";
import { useState } from "react";
import { ShareNetworkIcon } from "@phosphor-icons/react";

/**
 * On Reddit, sharing a closed trade posts its card to the subreddit as the player. Reddit requires
 * asking first, so the first tap only asks; nothing is posted until "Post it".
 */
export function ShareButton({ path }: { path: string; title: string }) {
  const [, , , memeId, closedAt] = path.split("/");
  const [state, setState] = useState<"idle" | "confirm" | "posting" | { url: string }>("idle");
  if (typeof state === "object")
    return (
      <button type="button" className="btn-candy is-small is-secondary px-3 text-base" onClick={() => navigateTo(state.url)}>
        View post
      </button>
    );
  if (state === "confirm" || state === "posting")
    return (
      <span className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm font-bold">Post to r/{context.subredditName} as u/{context.username}?</span>
        <button
          type="button"
          disabled={state === "posting"}
          className="btn-candy is-small is-buy px-3 text-base"
          onClick={async () => {
            setState("posting");
            const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memeId, closedAt: Number(closedAt) }) }).catch(() => null);
            const data = (await res?.json().catch(() => null)) as { url?: string; error?: string } | null;
            if (res?.ok && data?.url) {
              showToast("Posted to the subreddit");
              setState({ url: data.url });
            } else {
              showToast(data?.error ?? "Couldn't post that, try again");
              setState("idle");
            }
          }}
        >
          {state === "posting" ? "Posting…" : "Post it"}
        </button>
        <button type="button" className="btn-candy is-small is-muted px-3 text-base" onClick={() => setState("idle")}>
          Cancel
        </button>
      </span>
    );
  return (
    <button type="button" className="btn-candy is-small px-3 text-base" onClick={() => setState("confirm")}>
      <ShareNetworkIcon weight="bold" aria-hidden="true" />
      Share
    </button>
  );
}
