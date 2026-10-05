import { describe, expect, it } from "vitest";
import { checkRules, type Proposal, type RuleContext } from "../src";

// Test fixtures, not product data.
const ctx: RuleContext = {
  paused: false, allowed: ["pay_down", "add_backing"], loanBackingCoin: "rXYZ", idleBorrowed: 500, idleBacking: 3,
  maxPerAction: 300, maxPerWeekend: 400, maxPerMonth: 1000, spentThisWeekend: 0, spentThisMonth: 0,
  dataFresh: true, priceBasisOk: true, hasProjection: true,
};
const pay: Proposal = { kind: "pay_down", amount: 200, valueInBorrowed: 200, backingCoin: "" };

describe("checkRules", () => {
  it("passes a good proposal", () => {
    expect(checkRules(pay, ctx)).toEqual({ ok: true, violations: [] });
  });
  it("refuses when paused", () => {
    expect(checkRules(pay, { ...ctx, paused: true }).violations).toContain("paused");
  });
  it("refuses stale data, missing projection and untrusted price", () => {
    const v = checkRules(pay, { ...ctx, dataFresh: false, hasProjection: false, priceBasisOk: false }).violations;
    expect(v).toEqual(expect.arrayContaining(["data_not_fresh", "no_projection", "price_not_trusted"]));
  });
  it("refuses an action that is not allowed", () => {
    expect(checkRules(pay, { ...ctx, allowed: ["add_backing"] }).violations).toContain("action_not_allowed");
    const bad = { ...pay, kind: "sell" } as unknown as Proposal;
    expect(checkRules(bad, ctx).violations).toContain("action_not_allowed");
  });
  it("refuses bad amounts", () => {
    expect(checkRules({ ...pay, amount: 0 }, ctx).violations).toContain("bad_amount");
    expect(checkRules({ ...pay, amount: Number.NaN }, ctx).violations).toContain("bad_amount");
    expect(checkRules({ ...pay, valueInBorrowed: -1 }, ctx).violations).toContain("bad_amount");
  });
  it("refuses a different backing coin", () => {
    const add: Proposal = { kind: "add_backing", amount: 1, valueInBorrowed: 100, backingCoin: "rOTHER" };
    expect(checkRules(add, ctx).violations).toContain("wrong_backing_coin");
    expect(checkRules({ ...add, backingCoin: "rXYZ" }, ctx).ok).toBe(true);
  });
  it("refuses over the idle balance", () => {
    expect(checkRules({ ...pay, amount: 600, valueInBorrowed: 250 }, ctx).violations).toContain("over_idle_balance");
    const add: Proposal = { kind: "add_backing", amount: 4, valueInBorrowed: 100, backingCoin: "rXYZ" };
    expect(checkRules(add, ctx).violations).toContain("over_idle_balance");
  });
  it("enforces action, weekend and month limits", () => {
    expect(checkRules({ ...pay, amount: 350, valueInBorrowed: 350 }, ctx).violations).toContain("over_action_limit");
    expect(checkRules(pay, { ...ctx, spentThisWeekend: 250 }).violations).toContain("over_weekend_limit");
    expect(checkRules(pay, { ...ctx, spentThisMonth: 900 }).violations).toContain("over_month_limit");
  });
});
