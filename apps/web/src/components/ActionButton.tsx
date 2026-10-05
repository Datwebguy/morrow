"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export interface ActionResult {
  line: string;
  receiptHref?: string;
}

type Phase = "idle" | "pending" | "success" | "error";

const STYLES = {
  primary: "bg-accent text-on-accent hover:opacity-90",
  secondary: "border border-muted/50 text-ink hover:bg-line/60",
  danger: "bg-danger text-canvas hover:opacity-90",
} as const;

/** One button, four designed states: idle, pending, success with a receipt, and error with the next step. */
export function ActionButton({
  label,
  pendingLabel = "Working",
  onAction,
  variant = "primary",
  disabled = false,
  className = "",
}: {
  label: string;
  pendingLabel?: string;
  onAction: () => Promise<ActionResult | void>;
  variant?: keyof typeof STYLES;
  disabled?: boolean;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setPhase("pending");
    setError(null);
    try {
      const r = await onAction();
      setResult(r ?? null);
      setPhase("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work. Try again.");
      setPhase("error");
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={run}
        disabled={disabled || phase === "pending"}
        className={`inline-flex h-11 min-w-28 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${STYLES[variant]}`}
        aria-live="polite"
      >
        {phase === "pending" ? (
          <>
            <Loader2 size={16} strokeWidth={1.75} className="animate-spin" aria-hidden />
            {pendingLabel}
          </>
        ) : phase === "success" ? (
          "Done"
        ) : phase === "error" ? (
          "Try again"
        ) : (
          label
        )}
      </button>
      {phase === "success" && result ? (
        <p className="mt-2 text-sm text-safe" role="status">
          {result.line}{" "}
          {result.receiptHref ? (
            <Link href={result.receiptHref} className="font-medium underline underline-offset-2">
              See receipt
            </Link>
          ) : null}
        </p>
      ) : null}
      {phase === "error" && error ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
