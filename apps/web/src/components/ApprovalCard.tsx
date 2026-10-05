"use client";

import { ActionButton } from "./ActionButton";
import { request } from "@/lib/api";
import { amount, dateTime } from "@/lib/format";
import type { Approval } from "@/lib/types";
import { kindWord } from "@/lib/words";

export function ApprovalCard({ approval, loanCoin, backingCoin, onDone }: { approval: Approval; loanCoin: string; backingCoin: string; onDone: () => void }) {
  const p = approval.proposal;
  const what = p.kind === "pay_down" ? `Pay down ${amount(p.amount, loanCoin)}` : `Add ${amount(p.amount, backingCoin, 6)} as backing`;
  return (
    <article className="rounded-2xl border border-accent/60 bg-surface p-5" aria-label="Waiting for your approval">
      <p className="text-sm text-muted">Waiting for you · {dateTime(approval.createdAt)}</p>
      <h2 className="mt-1 text-lg">{what}</h2>
      <p className="mt-1 text-sm text-muted">{p.reason}</p>
      <div className="mt-4 flex flex-wrap items-start gap-3">
        <ActionButton
          label={`Approve ${kindWord(p.kind).toLowerCase()}`}
          onAction={async () => {
            const r = await request<{ line: string }>(`/api/approvals/${approval.id}/approve`, { method: "POST", body: {} });
            onDone();
            return { line: r.line, receiptHref: "/app/activity" };
          }}
        />
        <ActionButton
          label="Reject"
          variant="secondary"
          onAction={async () => {
            const r = await request<{ line: string }>(`/api/approvals/${approval.id}/reject`, { method: "POST", body: {} });
            onDone();
            return { line: r.line };
          }}
        />
      </div>
    </article>
  );
}
