import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Privacy notice · Dankrupt Exchange" };

export default function Privacy() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <Link href="/" aria-label="Back to the Dankrupt home page">
        <Logo className="w-48" />
      </Link>
      <article className="paper mt-10 space-y-4 p-6 text-lg leading-relaxed sm:p-8">
        <h1 className="font-display text-4xl">Privacy notice</h1>
        <p className="font-semibold text-ink-soft">Waitlist edition · last updated 24 November 2026</p>
        <h2 className="font-display text-2xl">What we collect</h2>
        <p>
          When you join the waitlist we store your email address, the time you gave consent, and, if you arrived from
          a link with a referral tag, that tag. Nothing else: no tracking pixels, no ad cookies.
        </p>
        <h2 className="font-display text-2xl">Why</h2>
        <p>Only to email you about the Dankrupt closed alpha and launch. We never sell or share your email.</p>
        <h2 className="font-display text-2xl">How long</h2>
        <p>Until public launch plus 12 months, or until you ask us to delete it, whichever comes first.</p>
        <h2 className="font-display text-2xl">Your choices</h2>
        <p>
          You can withdraw consent and have your email deleted at any time.{" "}
          {contact ? (
            <>
              Email{" "}
              <a className="font-bold underline" href={`mailto:${contact}`}>
                {contact}
              </a>
              .
            </>
          ) : (
            <>Reply to any email from us, or message us on our Discord.</>
          )}{" "}
          We act on requests within 30 days, in line with India&apos;s Digital Personal Data Protection Act, 2023.
        </p>
        <h2 className="font-display text-2xl">Money</h2>
        <p>Dankrupt is non-monetary. Coins can never be bought, sold or cashed out.</p>
      </article>
    </main>
  );
}
