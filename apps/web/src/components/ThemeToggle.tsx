"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STROKE = 1.75;

function current(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => setTheme(current()), []);
  const flip = () => {
    const next = current() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("morrow.theme", next);
    } catch {
      // The choice still applies for this visit.
    }
    setTheme(next);
  };
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-muted/40 text-ink transition-colors hover:bg-line/60"
    >
      {theme === "dark" ? <Sun size={18} strokeWidth={STROKE} /> : <Moon size={18} strokeWidth={STROKE} />}
    </button>
  );
}
