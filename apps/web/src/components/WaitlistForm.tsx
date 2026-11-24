"use client";

import { useActionState, useState } from "react";
import { CheckCircleIcon, DiscordLogoIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { joinAction, type WaitlistState } from "@/app/actions";

export function WaitlistForm({ discordUrl }: { discordUrl?: string }) {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinAction, { status: "idle" });
  // Controlled, because React resets uncontrolled fields after every action and a failed submit would wipe the email.
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);

  if (state.status === "ok") {
    return (
      <div className="pop-in text-center" role="status">
        <CheckCircleIcon weight="fill" className="mx-auto size-16 text-mint" aria-hidden="true" />
        <p className="font-display mt-2 text-3xl">You&apos;re on the list!</p>
        <p className="mt-2 text-lg">We&apos;ll email you when the closed alpha opens. Start practising your &ldquo;I called it&rdquo;.</p>
        <DiscordButton url={discordUrl} />
      </div>
    );
  }

  const err = state.status === "error" ? state : null;
  return (
    <form
      action={(form) => {
        form.set("source", new URLSearchParams(window.location.search).get("ref") ?? "");
        action(form);
      }}
      noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-lg font-extrabold">
          Your email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={err?.field === "email"}
          aria-describedby={err?.field === "email" ? "email-error" : undefined}
          className="min-h-[52px] rounded-[14px] border-[3px] border-ink bg-white px-4 text-lg shadow-[inset_0_3px_0_var(--paper-shade)] placeholder:text-ink-soft/60"
        />
        {err?.field === "email" && (
          <p id="email-error" role="alert" className="font-bold text-berry">
            {err.error}
          </p>
        )}
      </div>

      <div className="flex items-start gap-3">
        <input
          id="consent"
          name="consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          aria-invalid={err?.field === "consent"}
          aria-describedby={err?.field === "consent" ? "consent-error" : undefined}
          className="mt-1 size-6 shrink-0 cursor-pointer accent-[var(--candy)]"
        />
        <label htmlFor="consent" className="cursor-pointer leading-snug">
          Email me about the alpha and launch. I&apos;ve read the{" "}
          <a href="/privacy" className="font-bold underline decoration-2 underline-offset-2">
            privacy notice
          </a>
          .
        </label>
      </div>
      {err?.field === "consent" && (
        <p id="consent-error" role="alert" className="-mt-2 font-bold text-berry">
          {err.error}
        </p>
      )}

      {/* Honeypot: hidden from people and assistive tech, bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {err && !err.field && (
        <p role="alert" className="font-bold text-berry">
          {err.error}
        </p>
      )}

      <button type="submit" className="btn-candy w-full" disabled={pending}>
        {pending ? (
          <>
            <SpinnerGapIcon className="size-6 animate-spin" aria-hidden="true" /> Taping you in…
          </>
        ) : (
          "Get on the list"
        )}
      </button>
      <DiscordButton url={discordUrl} />
    </form>
  );
}

function DiscordButton({ url }: { url?: string }) {
  if (!url)
    return (
      <p className="mt-1 flex items-center justify-center gap-2 font-bold text-ink-soft">
        <DiscordLogoIcon weight="fill" className="size-6" aria-hidden="true" /> Discord server opening soon
      </p>
    );
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-candy is-secondary mt-1 w-full">
      <DiscordLogoIcon weight="fill" className="size-7" aria-hidden="true" /> Join the Discord
    </a>
  );
}
