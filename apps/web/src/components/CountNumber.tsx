"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/** Counts from the previous value to the new one. Never from zero on a refresh. */
export function CountNumber({ value, format, className = "" }: { value: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    const el = ref.current;
    if (!el) return;
    if (from === value || reduce) {
      el.textContent = format(value);
      return;
    }
    const c = animate(from, value, { duration: 0.5, ease: "easeOut", onUpdate: (v) => (el.textContent = format(v)) });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);
  return (
    <span ref={ref} className={`num ${className}`}>
      {format(value)}
    </span>
  );
}
