import { NYSE_CALENDAR, SCHEDULE, PERCENT } from "@morrow/config";
import { currentOrNextClosure, type MarketClosure } from "@morrow/core";
import { execute, type ActDeps } from "./act";
import type { Advisor } from "./advisor";
import { assessLoan, ProfileCache, type Assessment } from "./assess";
import { decide, type Decision } from "./decide";
import type { Store } from "./db";
import { gradeDue } from "./grade";
import type { Ports } from "./ports";
import { seal, type PromiseBody } from "./promise";
import { loadSettings, type UserSettings } from "./settings";

export interface Deps {
  store: Store;
  ports: Ports;
  advisor: Advisor;
  liveActions: boolean;
  cache: ProfileCache;
}

export interface CycleReport {
  nowMs: number;
  closure: MarketClosure | null;
  outcomes: Array<{ loanId: string; outcome: Decision["outcome"] | "unreadable"; reason: string }>;
  graded: number;
  problems: string[];
}

const HOUR = 3_600_000;

function monthStartMs(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function logQuiet(d: Deps, kind: "check" | "refused" | "alert", a: Assessment, decision: Decision | null, reason: string): void {
  const last = d.store.lastLog(a.loan.orderId, kind);
  if (last && last.reason === reason && a.nowMs - last.ts < HOUR) return; // same message within the hour: do not repeat
  d.store.addLog({
    ts: a.nowMs, kind, loanId: a.loan.orderId, instrument: a.instrument, direction: "", price: a.price, quantity: null, balanceChange: "none",
    simulated: d.ports.simulated, reason,
    detail: {
      phase: a.phase, health: a.healthNow, projection: a.projection, trust: a.trust, plan: a.plan, problems: a.problems, choice: decision?.choice ?? null,
      violations: decision?.violations ?? [],
    },
  });
}

async function notifyUser(d: Deps, settings: UserSettings, a: Assessment, text: string): Promise<void> {
  logQuiet(d, "alert", a, null, text);
  if (settings.telegramChatId) {
    try {
      await d.ports.notify(settings.telegramChatId, `${a.instrument}: ${text}`);
    } catch {
      // The in-app alert is already stored; a failed message is not worth stopping the cycle.
    }
  }
}

/** Writes and seals the weekly promise for a loan once, before the closure (or late, flagged, if the worker was off). */
function ensurePromise(d: Deps, a: Assessment, settings: UserSettings): string | null {
  const c = a.closure;
  if (!c || a.phase === "open" || !a.limits) return null;
  const existing = d.store.promiseFor(a.loan.orderId, c.closeTs);
  if (existing) return existing.id;
  // Actions taken in the run-up to the closure belong to this promise: they were protection against the closure,
  // and the grade must compare with the loan as it was before them.
  const runUp = d.store.actionsSince(a.loan.orderId, c.closeTs - SCHEDULE.nearClosureHours * HOUR).map((l) => {
    const isPay = l.direction === "pay down";
    const amount = l.quantity ?? 0;
    return { ts: l.ts, kind: isPay ? "pay_down" : "add_backing", amount, valueInBorrowed: isPay ? amount : amount * (l.price ?? 0), label: l.simulated ? "simulated" : "sent" };
  });
  const paidBefore = runUp.filter((x) => x.kind === "pay_down").reduce((s, x) => s + x.amount, 0);
  const addedBefore = runUp.filter((x) => x.kind === "add_backing").reduce((s, x) => s + x.amount, 0);
  const plan = a.plan && a.plan.needed ? (a.plan.payDown > 0 ? { kind: "pay_down" as const, amount: a.plan.payDown } : a.plan.addBacking > 0 ? { kind: "add_backing" as const, amount: a.plan.addBacking } : null) : null;
  const body: PromiseBody = {
    version: 1, loanId: a.loan.orderId, loanCoin: a.loan.loanCoin, backingCoin: a.loan.backingCoin, claim: "stays_below_margin_call_at_reopen",
    marginCallLevel: a.limits.marginCall, targetLevel: a.limits.marginCall - settings.targetBufferPoints / PERCENT, plannedAction: plan,
    projectedHealth: a.projection?.health?.ratio ?? null, projectionBasis: a.projection?.basis ?? "unavailable", closeTs: c.closeTs, reopenTs: c.reopenTs,
    sealedAt: a.nowMs, late: a.phase === "closed", debtAtSeal: a.loan.debt + paidBefore, backingAtSeal: a.loan.backingAmount - addedBefore,
  };
  const fingerprint = seal(body);
  const id = `${a.loan.orderId}-${c.closeTs}`;
  d.store.insertPromise({ id, loanId: a.loan.orderId, closeTs: c.closeTs, reopenTs: c.reopenTs, body: JSON.stringify(body), fingerprint, createdAt: a.nowMs, simulated: d.ports.simulated });
  for (const act of runUp) d.store.appendPromiseAction(id, act);
  d.store.addLog({
    ts: a.nowMs, kind: "promise", loanId: a.loan.orderId, instrument: a.instrument, direction: "", price: a.price, quantity: null, balanceChange: "none",
    simulated: d.ports.simulated, reason: `Promise sealed${body.late ? " late (the closure had already started)" : ""}.`, detail: { fingerprint, late: body.late },
  });
  return id;
}

/** One pass over every protected loan, then grading anything due. */
export async function runCycle(d: Deps): Promise<CycleReport> {
  const nowMs = d.ports.nowMs();
  const settings = loadSettings(d.store);
  const report: CycleReport = { nowMs, closure: null, outcomes: [], graded: 0, problems: [] };
  try {
    report.closure = currentOrNextClosure(NYSE_CALENDAR, nowMs);
  } catch (e) {
    report.problems.push(e instanceof Error ? e.message : "The market calendar could not be used.");
  }

  const read = await d.ports.loans();
  report.problems.push(...read.problems);
  let news: string[] | null = null;
  const getNews = async (): Promise<string[]> => (news ??= await d.ports.announcements().catch(() => []));
  const act: ActDeps = { store: d.store, ports: d.ports, liveActions: d.liveActions };

  for (const loanId of settings.protectedLoans) {
    const loan = read.loans.find((l) => l.orderId === loanId);
    if (!loan) {
      report.outcomes.push({ loanId, outcome: "unreadable", reason: "This loan was not found in your account right now." });
      continue;
    }
    const a = await assessLoan(d.ports, d.cache, loan, settings, report.closure);
    const promiseId = ensurePromise(d, a, settings);
    const decision = await decide(a, settings, d.advisor, {
      thisWeekend: d.store.spentForClosure(report.closure?.closeTs ?? 0), thisMonth: d.store.spentSince(monthStartMs(nowMs)),
    }, await getNewsIfNeeded(a, getNews));

    let reason = decision.reason;
    if (decision.outcome === "act") {
      const r = await execute(act, a, decision, promiseId);
      reason = r.line;
    } else if (decision.outcome === "propose" && decision.proposal) {
      const pending = d.store.pendingApprovals(loan.orderId);
      if (pending.length === 0) {
        const id = d.store.addApproval(nowMs, loan.orderId, { kind: decision.proposal.kind, amount: decision.proposal.amount, price: decision.proposal.price, reason: decision.reason, closeTs: report.closure?.closeTs ?? null });
        d.store.addLog({ ts: nowMs, kind: "approval", loanId: loan.orderId, instrument: a.instrument, direction: decision.proposal.kind === "pay_down" ? "pay down" : "add backing", price: a.price, quantity: decision.proposal.amount, balanceChange: "none", simulated: d.ports.simulated, reason: `Waiting for your approval: ${decision.reason}`, detail: { approvalId: id } });
        await notifyUser(d, settings, a, `Approve needed. ${decision.reason}`);
      }
    } else if (decision.outcome === "alert") {
      await notifyUser(d, settings, a, decision.reason);
    } else if (decision.outcome === "refused") {
      logQuiet(d, "refused", a, decision, decision.reason);
    } else {
      logQuiet(d, "check", a, decision, decision.reason);
    }
    report.outcomes.push({ loanId, outcome: decision.outcome, reason });
  }

  report.graded = (await gradeDue(d.store, d.ports)).length;
  return report;
}

async function getNewsIfNeeded(a: Assessment, getNews: () => Promise<string[]>): Promise<string[]> {
  const needed = a.plan?.needed === true || a.projection?.health?.status !== "safe";
  return needed ? (await getNews()).slice(0, SCHEDULE.announcementsForAi) : [];
}

/** Seconds until the next cycle: more often from a few hours before a closure until it reopens. */
export function nextDelaySeconds(nowMs: number, closure: MarketClosure | null): number {
  if (closure && nowMs >= closure.closeTs - SCHEDULE.nearClosureHours * HOUR && nowMs < closure.reopenTs + SCHEDULE.nearClosureHours * HOUR / 2) {
    return SCHEDULE.nearClosurePollSeconds;
  }
  return SCHEDULE.normalPollSeconds;
}
