"use client";

import { Activity, FileCheck2, House, PauseCircle, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ActionButton } from "./ActionButton";
import { request } from "@/lib/api";
import type { Status } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useKey } from "@/lib/useKey";

const NAV = [
  { href: "/app", label: "Home", Icon: House },
  { href: "/app/activity", label: "Activity", Icon: Activity },
  { href: "/app/record", label: "Record", Icon: FileCheck2 },
  { href: "/app/settings", label: "Settings", Icon: SlidersHorizontal },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const key = useKey();
  const status = useApi<Status>(key ? "/api/status" : null);
  const paused = status.data?.settings.paused === true;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-24 sm:px-6 md:flex-row md:gap-8 md:pb-10">
      <aside className="md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:py-8">
        <div className="flex items-center justify-between py-4 md:block md:py-0">
          <Link href="/" aria-label="Morrow home">
            <Logo />
          </Link>
          <div className="md:mt-6 md:hidden">
            <ThemeToggle />
          </div>
        </div>
        <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface md:static md:mt-8 md:block md:border-0 md:bg-transparent">
          {NAV.map(({ href, label, Icon }) => {
            const active = href === "/app" ? path === "/app" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs md:flex-row md:gap-3 md:rounded-xl md:px-3 md:py-2.5 md:text-sm ${active ? "font-semibold text-accent" : "text-muted hover:text-ink"}`}
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 hidden md:block">
          <ThemeToggle />
        </div>
      </aside>
      <main className="min-w-0 flex-1 py-4 md:py-8" id="main">
        {key && status.data ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            {paused ? (
              <p className="flex items-center gap-2 text-sm text-watch" role="status">
                <PauseCircle size={18} strokeWidth={1.75} aria-hidden /> Paused. Morrow is not acting.
              </p>
            ) : (
              <p className="text-sm text-muted">
                {!status.data.connected
                  ? "Bitget is not connected."
                  : status.data.liveActions
                    ? "Morrow is watching your loans."
                    : "Morrow is watching. Actions are previews only for now."}
              </p>
            )}
            <ActionButton
              label={paused ? "Resume" : "Pause all"}
              variant={paused ? "primary" : "secondary"}
              onAction={async () => {
                await request("/api/pause", { method: "POST", body: { paused: !paused } });
                status.refresh();
                return { line: paused ? "Resumed." : "Paused. Nothing will be sent." };
              }}
            />
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}

