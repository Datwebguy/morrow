import { checkRules, type ActionKind, type Proposal, type Violation } from "@morrow/core";
import { PERCENT, PLANNING_PERCENTILES } from "@morrow/config";
import type { Advisor, Choice, Situation } from "./advisor";
import type { Assessment } from "./assess";
import type { UserSettings } from "./settings";

export type Outcome = "paused" | "blocked" | "safe" | "no_action" | "alert" | "refused" | "propose" | "act";

export interface Decision {
  outcome: Outcome;
  /** One plain line for the user. */
  reason: string;
  choice: Choice | null;
  proposal: (Proposal & { price: number }) | null;
  violations: Violation[];
}

const PLAIN: Record<Violation, string> = {
  paused: "Paused.",
  data_not_fresh: "price data is too old",
  no_projection: "there is no projection",
  price_not_trusted: "the weekend price is not trusted",
  action_not_allowed: "that action is not allowed in your settings",
  bad_amount: "the amount is not valid",
  wrong_backing_coin: "only the token already backing this loan can be added",
  over_idle_balance: "it is more than your idle balance",
  over_action_limit: "it is over your limit per action",
  over_weekend_limit: "it is over your limit for this weekend",
  over_month_limit: "it is over your limit for this month",
};

export interface Spend {
  thisWeekend: number;
  thisMonth: number;
}

function points(x: number): string {
  return `${(x * PERCENT).toFixed(1)}%`;
}

function situation(a: Assessment, settings: UserSettings, news: string[]): Situation {
  const limits = a.limits!;
  const plan = a.plan && a.plan.needed ? (a.plan.payDown > 0 ? { kind: "pay_down" as ActionKind, amount: a.plan.payDown } : a.plan.addBacking > 0 ? { kind: "add_backing" as ActionKind, amount: a.plan.addBacking } : null) : null;
  const drop = a.risk?.drops[PLANNING_PERCENTILES.likely];
  return {
    loan: a.instrument, phase: a.phase, healthNow: a.healthNow?.ratio ?? null, projectedHealth: a.projection?.health?.ratio ?? null,
    projectionBasis: a.projection?.basis ?? "unavailable", marginCallLevel: limits.marginCall, liquidationLevel: limits.liquidation,
    targetLevel: limits.marginCall - settings.targetBufferPoints / PERCENT,
    priceTrust: { trusted: a.trust?.trusted ?? false, failures: a.trust?.failures ?? [] }, moveSinceClose: a.moveSinceClose,
    historicalDrop: drop === undefined ? null : { percentile: PLANNING_PERCENTILES.likely, drop }, plan, allowed: settings.allowed, news,
  };
}

/**
 * The AI chooses the kind of action. Code sizes it and checks every rule before anything is sent.
 * An AI choice that fails a rule check is refused and logged.
 */
export async function decide(a: Assessment, settings: UserSettings, advisor: Advisor, spend: Spend, news: string[]): Promise<Decision> {
  const none = (outcome: Outcome, reason: string, choice: Choice | null = null, violations: Violation[] = []): Decision => ({
    outcome, reason, choice, proposal: null, violations,
  });
  if (settings.paused) return none("paused", "Paused. Morrow is not acting.");
  if (a.problems.length > 0 && (!a.projection || !a.projection.health)) return none("blocked", `No action: ${a.problems[0]}`);
  if (!a.projection || !a.projection.health || !a.limits) {
    return none("blocked", "No action: there is no trusted price and not enough history to project the reopen.");
  }
  const health = a.projection.health;
  const proj = `Projected loan health at reopen ${points(health.ratio)} (margin-call level ${points(a.limits.marginCall)}).`;
  const needed = a.plan?.needed === true;
  if (!needed && health.status === "safe") return none("safe", `Safe. ${proj}`);

  // The loan needs action but Morrow has nothing it is allowed to do: tell the user plainly instead of staying quiet.
  if (needed && a.plan && a.plan.payDown <= 0 && a.plan.addBacking <= 0) {
    const limitMissing = settings.maxPerAction === null;
    const why =
      a.plan.reason === "no_allowed_action"
        ? "no action is allowed in your settings"
        : limitMissing
          ? "you have not set your limits yet. Set your limits in Settings"
          : "there is no idle balance to use within your limits";
    return none("alert", `Needs attention: ${proj} Morrow cannot act because ${why}.`);
  }

  const choice = await advisor.choose(situation(a, settings, news));
  if (choice.action === "none") return none("no_action", `No action: ${choice.reason}`, choice);
  if (choice.action === "alert") return none("alert", choice.reason, choice);

  const plan = a.plan;
  const kind = choice.action;
  const amount = kind === "pay_down" ? plan?.payDown ?? 0 : plan?.addBacking ?? 0;
  if (!plan || !needed || amount <= 0) return none("refused", `No action: the ${kind === "pay_down" ? "pay down" : "add backing"} choice does not match what is needed. ${proj}`, choice);

  const price = a.projection.price ?? 0;
  const proposal: Proposal & { price: number } = {
    kind, amount, valueInBorrowed: kind === "pay_down" ? amount : amount * price, backingCoin: a.loan.backingCoin, price,
  };
  const rules = checkRules(proposal, {
    paused: settings.paused, allowed: settings.allowed, loanBackingCoin: a.loan.backingCoin,
    idleBorrowed: a.idle.borrowed ?? 0, idleBacking: a.idle.backing ?? 0,
    maxPerAction: settings.maxPerAction ?? 0, maxPerWeekend: settings.maxPerWeekend ?? 0, maxPerMonth: settings.maxPerMonth ?? 0,
    spentThisWeekend: spend.thisWeekend, spentThisMonth: spend.thisMonth, dataFresh: a.dataFresh,
    priceBasisOk: a.projection.basis === "history_case" || a.trust?.trusted === true, hasProjection: true,
  });
  if (!rules.ok) {
    const why = rules.violations.map((v) => PLAIN[v]).join("; ");
    const limitMissing = settings.maxPerAction === null || settings.maxPerWeekend === null || settings.maxPerMonth === null;
    const extra = limitMissing && rules.violations.some((v) => v.startsWith("over_")) ? " Set your limits in Settings." : "";
    return { outcome: "refused", reason: `No action: ${why}.${extra}`, choice, proposal, violations: rules.violations };
  }
  const verb = kind === "pay_down" ? `Pay down ${amount.toFixed(2)} ${a.loan.loanCoin}` : `Add ${amount.toFixed(6)} ${a.loan.backingCoin} as backing`;
  return {
    outcome: settings.mode === "auto" ? "act" : "propose",
    reason: `${verb}. ${choice.reason} ${proj}`, choice, proposal, violations: [],
  };
}
