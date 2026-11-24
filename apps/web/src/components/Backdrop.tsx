import { ArrowFatUpIcon, PackageIcon } from "@phosphor-icons/react/ssr";

/** Box-and-tape props scattered on the cardboard behind app pages. Decorative only. */
export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="box-seam absolute inset-x-0 top-28" />
      <div className="absolute top-0 bottom-0 left-[6%] w-0 border-l-2 border-ink/15 shadow-[2px_0_0_rgba(255,238,205,.3)]" />
      <div className="absolute top-0 right-[7%] bottom-0 w-0 border-l-2 border-ink/15 shadow-[2px_0_0_rgba(255,238,205,.3)]" />
      <div className="tape absolute top-24 -left-6 h-9 w-44 -rotate-12 opacity-80" />
      <div className="tape absolute right-10 bottom-24 h-9 w-52 rotate-[14deg] opacity-70" />
      <div className="absolute top-40 right-[1.5%] hidden rotate-[8deg] items-center gap-1 rounded-md border-2 border-ink/35 px-2 py-1 text-ink/35 xl:flex">
        <PackageIcon weight="bold" className="size-5" />
        <span className="font-display text-xs tracking-widest">FRAGILE · CONTAINS MEMES</span>
      </div>
      <div className="absolute bottom-16 left-[1.5%] hidden -rotate-6 items-center gap-1 rounded-md border-2 border-ink/30 px-2 py-1 text-ink/30 xl:flex">
        <ArrowFatUpIcon weight="fill" className="size-6" />
        <ArrowFatUpIcon weight="fill" className="size-6" />
        <span className="font-display ml-1 text-sm tracking-widest">THIS SIDE UP</span>
      </div>
      <div className="absolute top-[55%] right-[1%] hidden rotate-[-10deg] rounded-full border-[3px] border-dashed border-berry/40 px-4 py-2 text-berry/45 xl:block">
        <span className="font-display text-lg tracking-wider">NO REFUNDS*</span>
        <span className="block text-center text-[10px] font-bold">*nothing to refund</span>
      </div>
    </div>
  );
}
