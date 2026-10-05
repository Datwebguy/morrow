"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorNote } from "@/components/EmptyState";
import { Gate } from "@/components/Gate";
import { RowSkeleton } from "@/components/Skeleton";
import { ago, amount, dateTime } from "@/lib/format";
import type { LogEntry } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const KIND: Record<string, string> = {
  check: "Check",
  action: "Action",
  refused: "No action",
  alert: "Alert",
  promise: "Promise",
  grade: "Grade",
  approval: "Waiting",
};

/** Looks for an identifier in Bitget's answer to show as the receipt. */
function receiptId(detail: unknown): string | null {
  const find = (v: unknown, depth: number): string | null => {
    if (depth > 4 || v === null || typeof v !== "object") return null;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if ((k === "orderId" || k === "requestId" || k === "id") && (typeof val === "string" || typeof val === "number")) return String(val);
      const hit = find(val, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  const d = detail as { request?: { response?: unknown } } | null;
  return find(d?.request?.response, 0);
}

function Row({ e, now }: { e: LogEntry; now: number }) {
  const [open, setOpen] = useState(false);
  const isAction = e.kind === "action";
  const receipt = isAction ? receiptId(e.detail) : null;
  const coin = e.instrument.split(" / ")[1] ?? "";
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {KIND[e.kind] ?? e.kind} · {e.instrument}
          {e.simulated ? " · preview only" : ""}
        </span>
        <time className="text-xs text-muted" dateTime={new Date(e.ts).toISOString()} title={dateTime(e.ts)}>
          {ago(now, e.ts)}
        </time>
      </div>
      <p className="mt-1.5 text-sm">{e.reason}</p>
      {isAction && e.quantity !== null ? (
        <p className="num mt-1.5 text-sm font-medium">
          {e.direction === "pay down" ? "Paid down" : "Added backing"} {e.direction === "pay down" ? amount(e.quantity, coin) : e.quantity}
        </p>
      ) : null}
      {isAction ? (
        <div className="mt-2">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-sm font-medium text-accent">
            Receipt <ChevronDown size={16} strokeWidth={1.75} className={open ? "rotate-180" : ""} aria-hidden />
          </button>
          {open ? (
            <p className="mt-1 rounded-xl bg-canvas p-3 text-sm text-muted">
              {e.simulated ? "Preview only. Nothing was sent to Bitget, so there is no receipt." : receipt ? <>Receipt <span className="num text-ink">{receipt}</span></> : "Sent to Bitget. Bitget did not give a receipt number."}
              <br />
              Balance change: <span className="num text-ink">{e.balanceChange}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function List() {
  const log = useApi<{ entries: LogEntry[] }>("/api/activity?limit=100");
  if (log.loading && !log.data) return <RowSkeleton />;
  if (log.error && !log.data) return <ErrorNote message={log.error} onRetry={log.refresh} />;
  const entries = log.data?.entries ?? [];
  if (entries.length === 0) {
    return <EmptyState title="Nothing yet" line="Every check and action will show up here, newest first. Protect a loan to get started." action={{ label: "Go to your loans", href: "/app" }} />;
  }
  const now = Date.now();
  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <Row key={e.id} e={e} now={now} />
      ))}
    </ul>
  );
}

export default function Activity() {
  return (
    <>
      <h1 className="text-2xl sm:text-3xl">Activity</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Every check and action, newest first.</p>
      <Gate>
        <List />
      </Gate>
    </>
  );
}
