import Link from "next/link";
import { PriceLine } from "./PriceLine";
import { Words } from "./Reveal";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <PriceLine />
      <div className="relative mx-auto flex min-h-[40rem] w-full max-w-6xl flex-col justify-start px-4 pb-72 pt-16 sm:px-6 sm:pt-24">
        <Words text="Borrow today. Still yours tomorrow." className="max-w-3xl text-5xl sm:text-6xl lg:text-7xl" />
        <p className="mt-6 max-w-xl text-lg text-muted">Morrow watches your Bitget stock loans and steps in before a margin call.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/app" className="inline-flex h-12 items-center rounded-full bg-accent px-6 text-base font-medium text-on-accent">
            Protect my loan
          </Link>
          <Link href="/record" className="inline-flex h-12 items-center rounded-full border border-muted/50 px-6 text-base font-medium text-ink hover:bg-line/60">
            See the record
          </Link>
        </div>
      </div>
    </section>
  );
}
