import type { ActionKind } from "./types";

export interface Proposal {
  kind: ActionKind;
  /** Pay down: amount of the borrowed coin. Add backing: amount of the backing token. */
  amount: number;
  /** Value of the action in the borrowed coin, used for limits. */
  valueInBorrowed: number;
  /** Backing token the action uses, for add backing. */
  backingCoin: string;
}

export interface RuleContext {
  paused: boolean;
  allowed: ActionKind[];
  /** The token currently backing the loan. */
  loanBackingCoin: string;
  idleBorrowed: number;
  idleBacking: number;
  maxPerAction: number;
  maxPerWeekend: number;
  maxPerMonth: number;
  spentThisWeekend: number;
  spentThisMonth: number;
  /** Data needed to act on was fresh and complete. */
  dataFresh: boolean;
  /** The price behind the plan is trusted, or the plan is based on the stock's own history. */
  priceBasisOk: boolean;
  /** The projection exists. */
  hasProjection: boolean;
}

export type Violation =
  | "paused"
  | "data_not_fresh"
  | "no_projection"
  | "price_not_trusted"
  | "action_not_allowed"
  | "bad_amount"
  | "wrong_backing_coin"
  | "over_idle_balance"
  | "over_action_limit"
  | "over_weekend_limit"
  | "over_month_limit";

export interface RuleResult {
  ok: boolean;
  violations: Violation[];
}

/** Every hard rule, checked before any write. Never relies on the AI's output being sane. */
export function checkRules(p: Proposal, c: RuleContext): RuleResult {
  const v: Violation[] = [];
  if (c.paused) v.push("paused");
  if (!c.dataFresh) v.push("data_not_fresh");
  if (!c.hasProjection) v.push("no_projection");
  if (!c.priceBasisOk) v.push("price_not_trusted");
  if (p.kind !== "pay_down" && p.kind !== "add_backing") v.push("action_not_allowed");
  else if (!c.allowed.includes(p.kind)) v.push("action_not_allowed");
  if (!Number.isFinite(p.amount) || p.amount <= 0 || !Number.isFinite(p.valueInBorrowed) || p.valueInBorrowed <= 0) v.push("bad_amount");
  if (p.kind === "add_backing" && p.backingCoin !== c.loanBackingCoin) v.push("wrong_backing_coin");
  if (p.kind === "pay_down" && p.amount > c.idleBorrowed) v.push("over_idle_balance");
  if (p.kind === "add_backing" && p.amount > c.idleBacking) v.push("over_idle_balance");
  if (p.valueInBorrowed > c.maxPerAction) v.push("over_action_limit");
  if (c.spentThisWeekend + p.valueInBorrowed > c.maxPerWeekend) v.push("over_weekend_limit");
  if (c.spentThisMonth + p.valueInBorrowed > c.maxPerMonth) v.push("over_month_limit");
  return { ok: v.length === 0, violations: v };
}
