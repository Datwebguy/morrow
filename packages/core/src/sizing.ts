import type { ActionKind, LoanLimits, LoanPosition } from "./types";

export interface SizingInput {
  position: LoanPosition;
  limits: LoanLimits;
  /** Backing price the plan must hold at (the projected reopen price). */
  price: number;
  /** Points below the margin-call level to stay under, as a ratio (for example 10 points is 0.1). */
  targetBufferRatio: number;
  allowed: ActionKind[];
  /** Idle balance of the borrowed coin. */
  idleBorrowed: number;
  /** Idle balance of the same token already backing the loan. */
  idleBacking: number;
  /** Per-action cap in the borrowed coin (the user's limit). */
  maxPerAction: number;
}

export interface ActionPlan {
  needed: boolean;
  payDown: number;
  addBacking: number;
  /** Loan health the plan reaches at `price`. */
  ratioAfter: number;
  reachesTarget: boolean;
  /** Plain reason when no (full) action is possible. */
  reason: "already_safe" | "ok" | "no_allowed_action" | "short_of_target" | "nothing_available";
  targetRatio: number;
}

const EPS = 1e-12;

/**
 * The smallest pay-down or added backing that brings the loan back under the user's target.
 * Singles are compared by cost in the borrowed coin; a tie goes to pay down.
 * If neither alone reaches the target, both are combined. If still short, the plan says so.
 */
export function sizeAction(i: SizingInput): ActionPlan {
  const targetRatio = i.limits.marginCall - i.targetBufferRatio;
  const backingValue = i.position.backingAmount * i.price;
  const ratio = i.position.debt / backingValue;
  if (targetRatio <= 0) throw new RangeError("target buffer leaves no room below the margin-call level");

  const base = { needed: false, payDown: 0, addBacking: 0, ratioAfter: ratio, reachesTarget: true, targetRatio };
  if (ratio <= targetRatio + EPS) return { ...base, reason: "already_safe" };

  const canPay = i.allowed.includes("pay_down");
  const canAdd = i.allowed.includes("add_backing");
  if (!canPay && !canAdd) return { ...base, needed: true, reachesTarget: false, reason: "no_allowed_action" };

  const payNeeded = i.position.debt - targetRatio * backingValue;
  const payCap = Math.max(0, Math.min(i.maxPerAction, i.idleBorrowed, i.position.debt));
  const addNeeded = i.position.debt / (targetRatio * i.price) - i.position.backingAmount;
  const addCapUnits = Math.max(0, Math.min(i.idleBacking, i.maxPerAction / i.price));

  const ratioWith = (pay: number, add: number): number =>
    (i.position.debt - pay) / ((i.position.backingAmount + add) * i.price);
  const make = (pay: number, add: number, reason: ActionPlan["reason"]): ActionPlan => {
    const after = ratioWith(pay, add);
    return { needed: true, payDown: pay, addBacking: add, ratioAfter: after, reachesTarget: after <= targetRatio + EPS, reason, targetRatio };
  };

  const payOk = canPay && payNeeded <= payCap + EPS;
  const addOk = canAdd && addNeeded <= addCapUnits + EPS;

  if (payOk && addOk) {
    return payNeeded <= addNeeded * i.price ? make(payNeeded, 0, "ok") : make(0, addNeeded, "ok");
  }
  if (payOk) return make(payNeeded, 0, "ok");
  if (addOk) return make(0, addNeeded, "ok");

  // Neither alone reaches the target: use all that is allowed, pay down first, then backing for the rest.
  const pay = canPay ? payCap : 0;
  const afterPay = i.position.debt - pay;
  const addRest = canAdd ? Math.min(addCapUnits, Math.max(0, afterPay / (targetRatio * i.price) - i.position.backingAmount)) : 0;
  if (pay <= 0 && addRest <= 0) return { ...base, needed: true, reachesTarget: false, reason: "nothing_available" };
  const plan = make(pay, addRest, "short_of_target");
  return plan.reachesTarget ? { ...plan, reason: "ok" } : plan;
}
