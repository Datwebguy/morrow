import Link from "next/link";
import { Logo } from "./Logo";

const COLS = [
  { title: "Product", links: [{ label: "Protect", href: "/app" }, { label: "Record", href: "/record" }, { label: "Pricing", href: "/pricing" }] },
  { title: "Learn", links: [{ label: "How it works", href: "/#how" }, { label: "FAQ", href: "/#faq" }, { label: "Risks", href: "/risks" }] },
  { title: "Build", links: [{ label: "GitHub", href: "https://github.com/Datwebguy/morrow" }, { label: "Bitget docs", href: "https://www.bitget.com/api-doc/uta/intro" }] },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">Borrow today. Still yours tomorrow.</p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-semibold">{c.title}</h2>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.href.startsWith("http") ? (
                    <a href={l.href} className="text-sm text-muted hover:text-ink" rel="noreferrer">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-sm text-muted hover:text-ink">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
          <p>Built on Bitget · {new Date().getFullYear()}</p>
          <p>Protection reduces risk. It cannot remove it.</p>
        </div>
      </div>
    </footer>
  );
}
