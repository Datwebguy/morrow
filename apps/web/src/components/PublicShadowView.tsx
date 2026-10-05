"use client";

import Link from "next/link";
import { Countdown, useNow } from "./Countdown";
import { EmptyState, ErrorNote } from "./EmptyState";
import { LoanCardSkeleton } from "./Skeleton";
import { TrustBadge } from "./TrustBadge";
import { WORKER_URL } from "@/lib/api";
import { ago, percent, points } from "@/lib/format";
import type { ShadowLoanView, ShadowView } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { basisWord, statusWord } from "@/lib/words";

const BAR: Record<string, string> = { safe: "var(--safe)", watch: "var(--watch)", margin_call: "var(--danger)", liquidation: "var(--danger)" };

/** Loan health as a slim bar from zero to the liquidation level, with a tick at the margin-call level. */
function HealthBar({ ratio, marginCall, liquidation, status }: { ratio: number; marginCall: number; liquidation: number; status: string }) {
  const pct = (x: number): string => `${Math.min(100, Math.max(0, (x / liquidation) * 100))}%`;
  return (
    <div className="relative mt-3 h-2 rounded-full bg-line" role="img" aria-label={`Loan health ${percent(ratio)}, margin-call level ${percent(marginCall, 0)}, liquidation level ${percent(liquidation, 0)}`}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(ratio), background: BAR[status] ?? "var(--muted)" }} />
      <div className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: pct(marginCall) }} aria-hidden />
    </div>
  );
}

function Card({ loan }: { loan: ShadowLoanView }) {
  const now = useNow(30_000);
  const h = loan.health;
  return (
    <article className="rounded-2xl border border-line bg-surface p-4" aria-label={`Simulated ${loan.instrument} loan`}>
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-base">{loan.instrument}</h3>
        <p className="text-sm font-medium text-accent">Simulated</p>
      </header>
      {h ? (
        <>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <p className="num text-3xl font-semibold">{percent(h.ratio)}</p>
            <p className="text-sm text-muted">{statusWord(h.status)} · opened at <span className="num">{percent(loan.startHealth, 0)}</span></p>
          </div>
          <HealthBar ratio={h.ratio} marginCall={h.marginCallLevel} liquidation={h.liquidationLevel} status={h.status} />
          <p className="mt-3 text-sm text-muted">
            To margin call <span className="num text-ink">{points(h.distanceToMarginCall)}</span> · to liquidation <span className="num text-ink">{points(h.distanceToLiquidation)}</span>
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-xl bg-canvas p-3 text-sm text-muted">Loan health is not available right now. {loan.problems[0] ?? ""}</p>
      )}
      <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">Projected at reopen</span>
          {loan.projection ? <span className="num font-medium" title={basisWord(loan.projection.basis)}>{percent(loan.projection.ratio)}</span> : <span className="text-muted">Not available</span>}
        </div>
        <TrustBadge trust={loan.trust} />
        <p className="text-muted">
          {loan.lastDecision ? (
            <>
              <span className="text-ink">{loan.lastDecision.reason}</span>
              {now !== null ? <span className="ml-1">{ago(now, loan.lastDecision.ts)}</span> : null}
            </>
          ) : (
            "Waiting for its first check."
          )}
        </p>
      </div>
    </article>
  );
}

/** What anyone sees at /app without signing in: the live shadow-ledger loans. Every one is simulated. */
export function PublicShadowView() {
  const view = useApi<ShadowView>(WORKER_URL ? "/public/shadow" : null, 30_000, { key: null });
  if (!WORKER_URL) return <EmptyState title="Not linked to a server yet" line="Once Morrow's server is linked, the live simulated loans appear here." />;
  if (view.loading && !view.data) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <LoanCardSkeleton />
        <LoanCardSkeleton />
        <LoanCardSkeleton />
      </div>
    );
  }
  if (view.error && !view.data) return <ErrorNote message={view.error} onRetry={view.refresh} />;
  const data = view.data;
  if (!data || data.loans.length === 0) {
    return <EmptyState title="The shadow ledger is starting" line="Simulated loans on the most traded stock tokens appear here within a minute." action={{ label: "Watch a weekend", href: "/watch" }} />;
  }
  const byToken = new Map<string, ShadowLoanView[]>();
  for (const l of data.loans) byToken.set(l.backingCoin, [...(byToken.get(l.backingCoin) ?? []), l]);
  const phase = data.loans[0]?.phase ?? "open";
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4 text-sm">
        <span className="text-muted">{phase === "closed" ? "Market reopens in" : "Next closure in"}</span>
        {data.closure ? <Countdown toMs={phase === "closed" ? data.closure.reopenTs : data.closure.closeTs} className="text-base font-semibold" /> : <span className="text-muted">No closure found</span>}
        <Link href="/record" className="font-medium text-accent underline underline-offset-2">See the sealed promises</Link>
      </div>
      {[...byToken.entries()].map(([coin, loans]) => (
        <section key={coin} aria-label={`${coin} simulated loans`}>
          <h2 className="mb-3 text-lg">{coin}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {loans.map((l) => (
              <Card key={l.orderId} loan={l} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
