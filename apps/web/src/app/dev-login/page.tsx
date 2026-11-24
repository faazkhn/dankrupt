import { Logo } from "@/components/Logo";
import { devLogin } from "./actions";

export default function DevLogin() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-4 py-10">
      <Logo className="w-64" />
      <form action={devLogin} className="paper w-full space-y-4 p-6">
        <h1 className="font-display text-3xl">Dev login</h1>
        <p className="font-semibold text-ink-soft">Pick any handle. Google sign-in replaces this before the alpha.</p>
        <label htmlFor="handle" className="block text-lg font-extrabold">
          Handle
        </label>
        <input
          id="handle"
          name="handle"
          required
          pattern="[a-zA-Z0-9_\-]{1,32}"
          autoComplete="username"
          placeholder="meme_lord"
          className="min-h-[52px] w-full rounded-[14px] border-[3px] border-ink bg-white px-4 text-lg"
        />
        <button className="btn-candy w-full">Enter the trading floor</button>
      </form>
    </main>
  );
}
