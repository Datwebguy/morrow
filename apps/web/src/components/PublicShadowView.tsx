"use client";

import Link from "next/link";
import { Countdown, useNow } from "./Countdown";
import { EmptyState, ErrorNote } from "./EmptyState";
import { Gauge } from "./Gauge";
import { LoanCardSkeleton } from "./Skeleton";
import { TrustBadge } from "./TrustBadge";
import { WORKER_URL } from "@/lib/api";
import { ago, percent, points } from "@/lib/format";
import type { ShadowLoanView, ShadowView } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { basisWord } from "@/lib/words";

function Card({ loan, phase }: { loan: ShadowLoanView; phase: ShadowLoanView["phase"] }) {
  const now = useNow(30_000);
  const h = loan.health;
  return (
    <article className="rounded-2xl border border-line bg-surface p-5" aria-label={`Simulated ${loan.instrument} loan`}>
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-base">{loan.instrument}</h3>
        <p className="text-sm font-medium text-accent">Simulated</p>
      </header>
      <p className="text-sm text-muted">Opened at <span className="num">{percent(loan.startHealth, 0)}</span> loan health</p>
      {h ? (
        <>
          <div className="mt-3">
            <Gauge ratio={h.ratio} marginCall={h.marginCallLevel} liquidation={h.liquidationLevel} status={h.status} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-canvas p-3">
              <dt className="text-muted">To margin call</dt>
              <dd className="num mt-1 text-base font-semibold">{points(h.distanceToMarginCall)}</dd>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <dt className="text-muted">To liquidation</dt>
              <dd className="num mt-1 text-base font-semibold">{points(h.distanceToLiquidation)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-canvas p-4 text-sm text-muted">Loan health is not available right now. {loan.problems[0] ?? ""}</p>
      )}
      <div className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">Projected at reopen</span>
          {loan.projection ? <span className="num font-medium" title={basisWord(loan.projection.basis)}>{percent(loan.projection.ratio)}</span> : <span className="text-muted">Not available</span>}
        </div>
        <TrustBadge trust={loan.trust} />
        <p className="text-muted">
          {phase === "open" ? "Market open." : "Market closed."}{" "}
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
              <Card key={l.orderId} loan={l} phase={phase} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
