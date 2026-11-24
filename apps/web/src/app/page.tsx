import { ArrowFatUpIcon, ChartLineUpIcon, MagnifyingGlassIcon, MegaphoneIcon, PackageIcon } from "@phosphor-icons/react/ssr";
import { CandyChart } from "@/components/CandyChart";
import { Logo } from "@/components/Logo";
import { Ticker } from "@/components/Ticker";
import { TornPaper } from "@/components/TornPaper";
import { WaitlistForm } from "@/components/WaitlistForm";

const STEPS = [
  {
    Icon: MagnifyingGlassIcon,
    title: "Spot it",
    body: "Catch a meme while it's still rising, or smell the moment it starts to die.",
    tilt: "-rotate-2",
  },
  {
    Icon: ChartLineUpIcon,
    title: "Trade it",
    body: "Buy, short or scalp, any hour. Prices move with real attention and with every other player.",
    tilt: "rotate-1",
  },
  {
    Icon: MegaphoneIcon,
    title: "Call it",
    body: "Climb the daily, weekly and all-time boards, then share the receipts.",
    tilt: "-rotate-1",
  },
];

export default function Home() {
  const discordUrl = process.env.NEXT_PUBLIC_DISCORD_URL;
  return (
    <main className="flex flex-1 flex-col overflow-x-hidden">
      {/* Hero + ticker fill the first screen on desktop, so the ticker is visible without scrolling. */}
      <div className="flex flex-col md:min-h-dvh">
        <section className="relative mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-6 sm:px-6 md:py-8">
          {/* Box decorations: seams, shipping stamps. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
            <div className="box-seam absolute top-16 -right-[50vw] -left-[50vw] hidden [@media(min-height:760px)]:block" />
            <div className="absolute top-0 bottom-0 -left-6 w-0 border-l-2 border-ink/20 shadow-[2px_0_0_rgba(255,238,205,.35)]" />
            <div className="absolute top-6 right-4 flex rotate-6 items-center gap-1.5 rounded-md border-2 border-ink/45 px-2 py-1 text-ink/45">
              <PackageIcon weight="bold" className="size-5" />
              <span className="font-display text-xs tracking-widest">FRAGILE · CONTAINS MEMES</span>
            </div>
            <div className="absolute bottom-6 left-2 hidden -rotate-3 items-center gap-1 rounded-md border-2 border-ink/40 px-2 py-1 text-ink/40 [@media(min-height:700px)]:flex">
              <ArrowFatUpIcon weight="fill" className="size-6" />
              <ArrowFatUpIcon weight="fill" className="size-6" />
              <span className="font-display ml-1 text-sm tracking-widest">THIS SIDE UP</span>
            </div>
            <div className="absolute right-[44%] bottom-10 hidden rotate-[-8deg] rounded-full border-[3px] border-dashed border-berry/50 px-4 py-2 text-berry/55 [@media(min-height:760px)]:block">
              <span className="font-display text-lg tracking-wider">NO REFUNDS*</span>
              <span className="block text-center text-[10px] font-bold">*nothing to refund</span>
            </div>
          </div>

          <div className="grid w-full items-center gap-x-10 gap-y-6 md:grid-cols-[1.1fr_1fr]">
            <div className="text-center md:text-left">
              <h1>
                <Logo className="mx-auto w-[min(80vw,340px)] md:mx-0 md:w-[380px]" />
              </h1>
              <p className="font-display mt-5 text-3xl leading-[1.05] sm:text-4xl lg:text-5xl">
                Buy the meme.
                <br />
                <span className="text-paper [text-shadow:0_3px_0_var(--ink)]">Short the cringe.</span>
              </p>
              <p className="mx-auto mt-3 max-w-[36ch] text-lg font-semibold md:mx-0">
                A stock exchange for internet memes. Paper money, live prices driven by what the internet is actually
                watching, and leaderboards for whoever called it first.
              </p>
              <CandyChart className="bob mt-6 hidden w-72 drop-shadow-[0_8px_0_rgba(58,36,18,.35)] [@media(min-width:768px)_and_(min-height:780px)]:block" />
            </div>

            <div className="relative mx-auto w-full max-w-md">
              <div aria-hidden="true" className="tape absolute -top-3.5 left-1/2 z-10 h-7 w-32 -translate-x-1/2 -rotate-2" />
              <div
                aria-hidden="true"
                className="font-display absolute -top-7 -right-3 z-10 grid size-24 rotate-12 place-items-center rounded-full border-[3px] border-ink bg-[#ffd23f] text-center leading-none shadow-[0_4px_0_var(--ink)] sm:-right-8"
              >
                <span>
                  <span className="block text-2xl">100K</span>
                  <span className="block text-xs tracking-wider">FREE COINS</span>
                </span>
              </div>
              <div className="paper rotate-[0.6deg] p-5 sm:p-6">
                <h2 className="font-display pr-14 text-2xl sm:text-3xl">Save your seat on the trading floor</h2>
                <p className="mt-1 mb-4 font-semibold text-ink-soft">
                  The closed alpha opens to the waitlist first. It&apos;s free, and the money&apos;s pretend.
                </p>
                <WaitlistForm discordUrl={discordUrl} />
              </div>
            </div>
          </div>
        </section>

        <Ticker />
      </div>

      {/* How it works: on the polka-dot paper */}
      <section className="mt-10">
        <TornPaper>
          <div className="px-4 pt-16 pb-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <h2 className="outline-text font-display text-center text-5xl sm:text-6xl">How it works</h2>
            <ol className="mt-10 grid gap-8 sm:grid-cols-3">
              {STEPS.map(({ Icon, title, body, tilt }, i) => (
                <li key={title} className={`paper relative p-6 pt-8 ${tilt}`}>
                  <span
                    aria-hidden="true"
                    className="font-display absolute -top-6 -left-3 grid size-14 place-items-center rounded-full border-[3px] border-ink bg-candy text-3xl shadow-[0_4px_0_var(--ink)]"
                  >
                    {i + 1}
                  </span>
                  <Icon weight="duotone" className="size-12 text-leaf-deep" aria-hidden="true" />
                  <h3 className="font-display mt-2 text-3xl">{title}</h3>
                  <p className="mt-1 text-lg">{body}</p>
                </li>
              ))}
            </ol>
          </div>
          </div>
        </TornPaper>
      </section>

      {/* Fine print: back on the box */}
      <section className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <div className="paper -rotate-1 p-6 sm:p-8">
          <h2 className="font-display text-3xl">The fine print (it&apos;s short)</h2>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-lg">
            <li>
              <strong>Coins are pretend.</strong> They can never be bought, sold or cashed out, and no prizes have cash
              value.
            </li>
            <li>Every new trader starts with 100,000 coins. Go broke? Take a free reset. Everyone sees the count.</li>
            <li>No meme images are re-hosted here. Memes belong to their makers.</li>
          </ul>
        </div>
      </section>

      <footer className="mt-auto border-t-[3px] border-ink bg-board-dark px-4 py-6 text-center font-bold text-paper">
        <a href="/privacy" className="underline decoration-2 underline-offset-4">
          Privacy notice
        </a>
        <span className="mx-3" aria-hidden="true">
          ·
        </span>
        © 2026 Dankrupt Exchange
      </footer>
    </main>
  );
}
