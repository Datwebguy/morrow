"use client";

import { HelpCircle } from "lucide-react";
import { useId, useState } from "react";

/** A small "?" that opens a short explanation. Keeps helper text off the screen until it is wanted. */
export function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <HelpCircle size={16} strokeWidth={1.75} />
      </button>
      {open ? (
        <span id={id} role="tooltip" className="absolute left-0 top-7 z-20 w-64 rounded-xl border border-line bg-surface p-3 text-left text-sm font-normal normal-case tracking-normal text-ink shadow-lg">
          {children}
        </span>
      ) : null}
    </span>
  );
}
