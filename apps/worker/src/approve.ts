import { execute, type ActDeps } from "./act";
import type { Advisor } from "./advisor";
import { assessLoan, type ProfileCache } from "./assess";
import { decide } from "./decide";
import type { Store } from "./db";
import type { Ports } from "./ports";
import { loadSettings } from "./settings";
import { currentOrNextClosure } from "@morrow/core";
import { NYSE_CALENDAR } from "@morrow/config";

export interface ApproveDeps {
  store: Store;
  ports: Ports;
  advisor: Advisor;
  cache: ProfileCache;
  liveActions: boolean;
}

export interface ApproveResult {
  ok: boolean;
  line: string;
}

/**
 * "Ask me first": the user tapped Approve. Everything is checked again against fresh data before anything is sent,
 * because the market may have moved since the proposal was made.
 */
export async function approve(d: ApproveDeps, id: number): Promise<ApproveResult> {
  const row = d.store.getApproval(id);
  if (!row) return { ok: false, line: "That request was not found." };
  if (row.status !== "pending") return { ok: false, line: `That request is already ${row.status}.` };
  const now = d.ports.nowMs();
  const settings = loadSettings(d.store);
  const read = await d.ports.loans();
  const loan = read.loans.find((l) => l.orderId === row.loanId);
  if (!loan) {
    d.store.decideApproval(id, "expired", now);
    return { ok: false, line: "The loan was not found in your account, so nothing was sent." };
  }
  const closure = currentOrNextClosure(NYSE_CALENDAR, now);
  const a = await assessLoan(d.ports, d.cache, loan, settings, closure);
  // The user approved, so run the decision as if automatic mode were on; every rule still applies.
  const decision = await decide(a, { ...settings, mode: "auto" }, d.advisor, {
    thisWeekend: d.store.spentForClosure(closure?.closeTs ?? 0),
    thisMonth: d.store.spentSince(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)),
  }, []);
  if (decision.outcome !== "act") {
    d.store.decideApproval(id, "expired", now);
    return { ok: false, line: `Nothing was sent. ${decision.reason}` };
  }
  const act: ActDeps = { store: d.store, ports: d.ports, liveActions: d.liveActions };
  const promise = closure ? d.store.promiseFor(loan.orderId, closure.closeTs) : null;
  const r = await execute(act, a, decision, promise?.id ?? null);
  d.store.decideApproval(id, r.refused ? "expired" : "approved", now);
  return { ok: !r.refused, line: r.line };
}

export function reject(store: Store, id: number, nowMs: number): ApproveResult {
  const row = store.getApproval(id);
  if (!row || row.status !== "pending") return { ok: false, line: "That request is not waiting for an answer." };
  store.decideApproval(id, "rejected", nowMs);
  return { ok: true, line: "Rejected. Nothing was sent." };
}

