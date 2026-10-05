"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { CountNumber } from "./CountNumber";
import { EmptyState } from "./EmptyState";
import { RowSkeleton } from "./Skeleton";
import { TokenLabel } from "./TokenMark";
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
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <TokenLabel coin={p.backingCoin} size={24} />
            <span className="text-muted">· {dateOnly(p.closeTs)} · {p.sizeBand}</span>
          </span>
          {p.simulated ? <span className="ml-2 text-sm font-medium text-accent">Simulated</span> : null}
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

const SHOWN_AT_FIRST = 6;

/** The live record: real sealed promises when there are any, then the shadow ledger's simulated ones, labelled. Never a row of zeros. */
export function RecordView() {
  const { data, failed, loading } = usePublicRecord();
  const [all, setAll] = useState(false);
  if (!WORKER_URL) {
    return <EmptyState title="Starting" line="The live record starts with the next market closure. It will appear here, newest first." />;
  }
  if (loading) return <RowSkeleton />;
  if (failed || !data) return <EmptyState title="The record could not load" line="Try again in a minute. Nothing has been changed." />;
  const t = data.totals;
  const sim = [...data.simulated].sort((a, b) => b.closeTs - a.closeTs || a.backingCoin.localeCompare(b.backingCoin));
  const simGraded = sim.filter((p) => p.status === "graded");
  const stats = [
    { label: "Promises kept", value: t.kept },
    { label: "Margin calls avoided", value: t.marginCallsAvoided },
    { label: "Liquidations avoided", value: t.liquidationsAvoided },
  ];
  if (data.promises.length === 0 && sim.length === 0) {
    return <EmptyState title="The first promises are sealed before the next closure" line="Morrow seals one promise per simulated loan an hour before the US market closes, then grades it after the reopen." />;
  }
  return (
    <>
      {t.graded > 0 ? (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col justify-between gap-2 bg-surface px-5 py-4">
              <dt className="text-sm text-muted">{s.label}</dt>
              <dd className="text-2xl font-semibold"><CountNumber value={s.value} format={(n) => String(Math.round(n))} /></dd>
            </div>
          ))}
          <div className="flex flex-col justify-between gap-2 bg-surface px-5 py-4">
            <dt className="text-sm text-muted">Total cost</dt>
            <dd className="text-2xl font-semibold"><CountNumber value={t.totalCost} format={(n) => amount(n, "USDT")} /></dd>
          </div>
        </dl>
      ) : null}
      {data.promises.length > 0 ? (
        <ul className="mt-8 space-y-4">
          {data.promises.map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </ul>
      ) : null}
      {sim.length > 0 ? (
        <div className={data.promises.length > 0 ? "mt-10" : ""}>
          <h3 className="text-xl">Shadow ledger <span className="ml-2 align-middle text-sm font-medium text-accent">Simulated</span></h3>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Simulated loans on the most traded stock tokens, with live Bitget prices and loan limits. <span className="num">{sim.length}</span> promises sealed, <span className="num">{simGraded.length}</span> graded. Not counted as real results.
          </p>
          <ul className="mt-4 space-y-4">
            {(all ? sim : sim.slice(0, SHOWN_AT_FIRST)).map((p) => (
              <Row key={p.id} p={p} />
            ))}
          </ul>
          {sim.length > SHOWN_AT_FIRST ? (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-4 inline-flex h-11 items-center rounded-full border border-muted/50 px-5 text-sm font-medium text-ink hover:bg-line/60">
              {all ? "Show fewer" : `Show all ${sim.length}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
