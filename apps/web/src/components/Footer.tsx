import Link from "next/link";
import { Logo } from "./Logo";

const COLS = [
  { title: "Product", links: [{ label: "Check my loan", href: "/check" }, { label: "Watch a weekend", href: "/watch" }, { label: "Owner sign-in", href: "/app" }, { label: "Record", href: "/record" }, { label: "Pricing", href: "/pricing" }] },
  { title: "Learn", links: [{ label: "How it works", href: "/#how" }, { label: "FAQ", href: "/#faq" }, { label: "Risks", href: "/risks" }] },
  { title: "Build", links: [{ label: "GitHub", href: "https://github.com/Datwebguy/morrow" }, { label: "Bitget docs", href: "https://www.bitget.com/api-doc/uta/intro" }] },
] as const;

/** A split footer: a blue brand panel beside (or above, on phones) a white panel of divided link columns, then a dark base. */
export function Footer() {
  return (
    <footer>
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="flex flex-col justify-between gap-12 bg-accent px-6 py-12 text-on-accent sm:px-10 md:px-14 md:py-16">
          <div>
            <Logo size={34} className="text-on-accent" feet="var(--on-accent)" />
            <p className="mt-6 max-w-xs text-2xl font-semibold leading-snug" style={{ letterSpacing: "-0.02em" }}>
              Borrow today. Still yours tomorrow.
            </p>
          </div>
          <p className="max-w-xs text-sm">Stock-token loans on Bitget, watched around every market closure.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-3 divide-x divide-line bg-surface">
          {COLS.map((c) => (
            <div key={c.title} className="px-4 py-8 sm:px-8 md:py-16">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{c.title}</h2>
              <ul className="mt-5 space-y-3.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("http") ? (
                      <a href={l.href} className="text-sm font-medium hover:text-accent" rel="noreferrer">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-sm font-medium hover:text-accent">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="bg-ink text-canvas">
        <div className="flex flex-col gap-1.5 px-6 py-5 text-xs sm:flex-row sm:justify-between sm:px-10 md:px-14">
          <p>
            Built on Bitget · {new Date().getFullYear()} · Token logos from{" "}
            <a href="https://www.coingecko.com" rel="noreferrer" className="underline underline-offset-2">CoinGecko</a> and company websites
          </p>
          <p>Protection reduces risk. It cannot remove it.</p>
        </div>
      </div>
    </footer>
  );
}
