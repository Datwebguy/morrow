import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
      <Link href="/" aria-label="Morrow home">
        <Logo />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
        <Link href="/#how" className="hidden rounded-full px-3 py-2 text-sm text-muted hover:text-ink md:inline-block">
          How it works
        </Link>
        <Link href="/record" className="hidden rounded-full px-3 py-2 text-sm text-muted hover:text-ink sm:inline-block">
          Record
        </Link>
        <Link href="/#faq" className="hidden rounded-full px-3 py-2 text-sm text-muted hover:text-ink md:inline-block">
          FAQ
        </Link>
        <ThemeToggle />
        <Link href="/app" className="ml-1 inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-medium text-on-accent">
          Protect my loan
        </Link>
      </nav>
    </header>
  );
}
