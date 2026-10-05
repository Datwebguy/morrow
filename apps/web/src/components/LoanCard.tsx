"use client";

import { useState } from "react";
import { Countdown } from "./Countdown";
import { Gauge } from "./Gauge";
import { Switch } from "./Switch";
import { TrustBadge } from "./TrustBadge";
import { Hint } from "./Hint";
import { request } from "@/lib/api";
import { amount, percent, points } from "@/lib/format";
import type { LoanView } from "@/lib/types";
import { basisWord } from "@/lib/words";

function plannedLine(l: LoanView): string {
  if (!l.plan) return "No action planned";
  if (l.plan.payDown > 0) return `Pay down ${amount(l.plan.payDown, l.loanCoin)}`;
  if (l.plan.addBacking > 0) return `Add ${amount(l.plan.addBacking, l.backingCoin, 6)} as backing`;
  return "Action needed. Nothing available to use.";
}

export function LoanCard({ loan, onChanged }: { loan: LoanView; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const h = loan.health;

  const toggle = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await request("/api/protect", { method: "POST", body: { orderId: loan.orderId, on } });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-label={`${loan.instrument} loan`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">{loan.instrument}</h2>
          <p className="text-sm text-muted">{loan.protected ? "Protected" : "Not protected"}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">Protect this loan</span>
          <Switch checked={loan.protected} onChange={toggle} busy={busy} label={`Protect this loan, ${loan.instrument}`} />
        </div>
      </header>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {h ? (
        <>
          <div className="mt-4">
            <Gauge ratio={h.ratio} marginCall={h.marginCallLevel} liquidation={h.liquidationLevel} status={h.status} />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-canvas p-3">
              <dt className="flex items-center gap-1 text-muted">
                To margin call
                <Hint label="What is the margin-call level?">At the margin-call level ({percent(h.marginCallLevel, 0)}) Bitget asks you to add backing or pay down.</Hint>
              </dt>
              <dd className="num mt-1 text-lg font-semibold">{points(h.distanceToMarginCall)}</dd>
              <dd className="text-xs text-muted">Backing can fall {percent(h.priceDropToMarginCall)}</dd>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <dt className="flex items-center gap-1 text-muted">
                To liquidation
                <Hint label="What is the liquidation level?">At the liquidation level ({percent(h.liquidationLevel, 0)}) Bitget sells your backing to repay the loan.</Hint>
              </dt>
              <dd className="num mt-1 text-lg font-semibold">{points(h.distanceToLiquidation)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="mt-5 rounded-xl bg-canvas p-4 text-sm text-muted">Loan health is not available right now. {loan.problems[0] ?? ""}</p>
      )}

      <div className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">{loan.phase === "closed" ? "Market reopens in" : "Next closure in"}</span>
          {loan.closure ? <Countdown toMs={loan.phase === "closed" ? loan.closure.reopenTs : loan.closure.closeTs} className="font-medium" /> : <span className="text-muted">No closure found</span>}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1 text-muted">
              Projected at reopen
              <Hint label="How is the reopen projected?">
                Morrow works out what your loan health will be when the US market reopens, {loan.projection ? basisWord(loan.projection.basis) : "once a price is available"}.
              </Hint>
            </span>
            {loan.projection ? <span className="num font-medium">{percent(loan.projection.ratio)}</span> : <span className="text-muted">Not available</span>}
          </div>
          <div className="mt-1.5 flex">
            <TrustBadge trust={loan.trust} />
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-muted">Planned action</span>
          <span className="ml-auto text-right font-medium">{plannedLine(loan)}</span>
        </div>
      </div>
    </article>
  );
}
