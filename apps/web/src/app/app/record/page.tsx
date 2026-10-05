"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorNote } from "@/components/EmptyState";
import { Gate } from "@/components/Gate";
import { RowSkeleton } from "@/components/Skeleton";
import { TokenLabel } from "@/components/TokenMark";
import { amount, dateOnly, percent } from "@/lib/format";
import type { OwnPromise } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function Chip({ p }: { p: OwnPromise }) {
  const g = p.grade;
  const [text, cls] = !g ? ["Sealed", "text-accent"] : g.kept === null ? ["Loan closed", "text-muted"] : g.kept ? ["Kept", "text-safe"] : ["Missed", "text-danger"];
  return <span className={`text-sm font-semibold ${cls}`}>{text}</span>;
}

function Row({ p }: { p: OwnPromise }) {
  const [copied, setCopied] = useState(false);
  const g = p.grade;
  return (
    <li className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base">
          <TokenLabel coin={p.body.backingCoin} size={24} /> / {p.body.loanCoin} · {dateOnly(p.closeTs)}
          {p.simulated ? " · preview only" : ""}
        </h2>
        <Chip p={p} />
      </div>
      <p className="mt-1 text-sm text-muted">
        Promise: this loan stays below the margin-call level ({percent(p.body.marginCallLevel, 0)}) when the market reopens.
        {p.body.late ? " Sealed after the closure had started." : ""}
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Projected when sealed</dt>
          <dd className="num font-medium">{p.body.projectedHealth === null ? "Not available" : percent(p.body.projectedHealth)}</dd>
        </div>
        <div>
          <dt className="text-muted">What Morrow did</dt>
          <dd className="font-medium">{p.actions.length === 0 ? "Nothing needed" : p.actions.map((a) => (a.kind === "pay_down" ? `Paid down ${amount(a.amount, p.body.loanCoin)}` : "Added backing")).join(", ")}</dd>
        </div>
        {g && g.healthAtGrade !== null ? (
          <div>
            <dt className="text-muted">Loan health 30 min after the open</dt>
            <dd className="num font-medium">{percent(g.healthAtGrade)}</dd>
          </div>
        ) : null}
        {g && g.healthWithNoAction !== null ? (
          <div>
            <dt className="text-muted">With no action it would have been</dt>
            <dd className="num font-medium">
              {percent(g.healthWithNoAction)}
              {g.wouldHaveHadMarginCall ? " (a margin call)" : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span>Sealed promise</span>
        <code className="num min-w-0 truncate text-ink">{p.fingerprint}</code>
        <button
          type="button"
          aria-label="Copy the sealed promise"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(p.fingerprint);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
          className="inline-flex h-8 items-center gap-1 rounded-full px-2 hover:bg-line/60"
        >
          <Copy size={14} strokeWidth={1.75} aria-hidden /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </li>
  );
}

function List() {
  const rec = useApi<{ promises: OwnPromise[] }>("/api/record");
  if (rec.loading && !rec.data) return <RowSkeleton />;
  if (rec.error && !rec.data) return <ErrorNote message={rec.error} onRetry={rec.refresh} />;
  const list = rec.data?.promises ?? [];
  if (list.length === 0) {
    return <EmptyState title="No promises yet" line="Morrow seals a promise for each protected loan before the next market closure." action={{ label: "Go to your loans", href: "/app" }} />;
  }
  return (
    <ul className="space-y-4">
      {list.map((p) => (
        <Row key={p.id} p={p} />
      ))}
    </ul>
  );
}

export default function Record() {
  return (
    <>
      <h1 className="text-2xl sm:text-3xl">Your record</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Each promise is sealed before the market closes, then graded after it reopens.</p>
      <Gate>
        <List />
      </Gate>
    </>
  );
}
