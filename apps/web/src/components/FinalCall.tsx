import Link from "next/link";
import { Reveal } from "./Reveal";

export function FinalCall() {
  return (
    <section className="border-t border-line bg-surface">
      <Reveal className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-4 py-24 sm:px-6">
        <h2 className="max-w-2xl text-4xl sm:text-5xl">Your stocks. Still yours on Monday.</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/check" className="inline-flex h-12 items-center rounded-full bg-accent px-6 text-base font-medium text-on-accent">
            Check my loan
          </Link>
          <Link href="/watch" className="inline-flex h-12 items-center rounded-full border border-muted/50 px-6 text-base font-medium text-ink hover:bg-line/60">
            Watch a weekend
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
