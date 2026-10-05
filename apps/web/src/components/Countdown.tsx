"use client";

import { useEffect, useState } from "react";
import { countdown } from "@/lib/format";

/** Ticks once a second on the client. Renders a dash until then so the server and browser never disagree. */
export function useNow(everyMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function Countdown({ toMs, className = "" }: { toMs: number; className?: string }) {
  const now = useNow();
  return <span className={`num ${className}`}>{now === null ? "—" : countdown(toMs - now)}</span>;
}
