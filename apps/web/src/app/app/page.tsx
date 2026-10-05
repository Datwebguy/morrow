"use client";

import { ApprovalCard } from "@/components/ApprovalCard";
import { EmptyState, ErrorNote } from "@/components/EmptyState";
import { Gate } from "@/components/Gate";
import { LoanCard } from "@/components/LoanCard";
import { LoanCardSkeleton } from "@/components/Skeleton";
import type { Approval, LoansResponse } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function Loans() {
  const loans = useApi<LoansResponse>("/api/loans");
  const approvals = useApi<{ approvals: Approval[] }>("/api/approvals");
  const refresh = () => {
    loans.refresh();
    approvals.refresh();
  };

  if (loans.loading && !loans.data) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <LoanCardSkeleton />
        <LoanCardSkeleton />
      </div>
    );
  }
  if (loans.error && !loans.data) {
    return (
      <div className="space-y-4">
        <ErrorNote message={loans.error} onRetry={loans.refresh} />
        {loans.status === 401 ? <EmptyState title="Check your access key" line="Enter it again on the Connect screen." action={{ label: "Connect Bitget", href: "/app/connect" }} /> : null}
      </div>
    );
  }
  const data = loans.data;
  if (!data || !data.connected) {
    return <EmptyState title="Bitget is not connected" line="Connect Bitget to see your loans." action={{ label: "Connect Bitget", href: "/app/connect" }} />;
  }
  const pending = approvals.data?.approvals ?? [];
  return (
    <div className="space-y-5">
      {data.problems.length > 0 ? <ErrorNote message={data.problems[0] ?? ""} onRetry={loans.refresh} /> : null}
      {pending.map((a) => {
        const l = data.loans.find((x) => x.orderId === a.loanId);
        return <ApprovalCard key={a.id} approval={a} loanCoin={l?.loanCoin ?? "USDT"} backingCoin={l?.backingCoin ?? ""} onDone={refresh} />;
      })}
      {data.loans.length === 0 ? (
        <EmptyState title="No open loans" line="Open a loan against your stock tokens on Bitget. It will appear here." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.loans.map((l) => (
            <LoanCard key={l.orderId} loan={l} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <h1 className="text-2xl sm:text-3xl">Your loans</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Morrow checks every loan around the clock.</p>
      <Gate>
        <Loans />
      </Gate>
    </>
  );
}
