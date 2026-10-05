"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { CountNumber } from "./CountNumber";
import { EmptyState } from "./EmptyState";
import { RowSkeleton } from "./Skeleton";
import { WORKER_URL } from "@/lib/api";
import { amount, dateOnly } from "@/lib/format";
import type { PublicPromise } from "@/lib/types";
import { usePublicRecord } from "@/lib/usePublicRecord";

function Chip({ p }: { p: PublicPromise }) {
  const [text, cls] = p.status === "sealed" ? ["Sealed", "text-accent"] : p.kept === null ? ["Loan closed", "text-muted"] : p.kept ? ["Kept", "text-safe"] : ["Missed", "text-danger"];
  return <span className={`text-sm font-semibold ${cls}`}>{text}</span>;
}

function Row({ p }: { p: PublicPromise }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base">
          {dateOnly(p.closeTs)} · {p.backingCoin} · {p.sizeBand}
        </h3>
        <Chip p={p} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {p.status === "graded" ? (
          <>
            {p.actions === 0 ? "Morrow did not need to act." : `Morrow acted ${p.actions} time${p.actions === 1 ? "" : "s"}, using ${amount(p.cost ?? 0, "USDT")}.`}
            {p.wouldHaveHadMarginCall ? " Without action this loan would have reached a margin call." : ""}
            {p.wouldHaveBeenLiquidated ? " It would have been liquidated." : ""}
          </>
        ) : (
          "Waiting for the market to reopen, then Morrow grades it."
        )}
        {p.late ? " Sealed after the closure had started." : ""}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span className="shrink-0">Sealed promise</span>
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
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 hover:bg-line/60"
        >
          <Copy size={14} strokeWidth={1.75} aria-hidden /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </li>
  );
}

export function RecordView() {
  const { data, failed, loading } = usePublicRecord();
  if (!WORKER_URL) {
    return <EmptyState title="Starting" line="The live record starts with the first protected closure. It will appear here, newest first." />;
  }
  if (loading) return <RowSkeleton />;
  if (failed || !data) return <EmptyState title="The record could not load" line="Try again in a minute. Nothing has been changed." />;
  const t = data.totals;
  const stats = [
    { label: "Promises sealed", value: t.promises },
    { label: "Promises kept", value: t.kept },
    { label: "Margin calls avoided", value: t.marginCallsAvoided },
    { label: "Liquidations avoided", value: t.liquidationsAvoided },
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col justify-between gap-2 bg-surface px-5 py-4">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="text-2xl font-semibold">{t.graded > 0 || s.label === "Promises sealed" ? <CountNumber value={s.value} format={(n) => String(Math.round(n))} /> : "Starting"}</dd>
          </div>
        ))}
        <div className="col-span-2 flex flex-col justify-between gap-2 bg-surface px-5 py-4 lg:col-span-1">
          <dt className="text-sm text-muted">Total cost</dt>
          <dd className="text-2xl font-semibold">{t.graded > 0 ? <CountNumber value={t.totalCost} format={(n) => amount(n, "USDT")} /> : "Starting"}</dd>
        </div>
      </dl>
      {data.promises.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="No promises yet" line="Morrow seals a promise for each protected loan before every weekend or holiday. The first one will show here." />
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {data.promises.map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </ul>
      )}
      {data.simulated.length > 0 ? (
        <details className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <summary className="cursor-pointer text-sm font-medium">Practice runs (simulated, not counted above)</summary>
          <ul className="mt-4 space-y-4">
            {data.simulated.map((p) => (
              <Row key={p.id} p={p} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
