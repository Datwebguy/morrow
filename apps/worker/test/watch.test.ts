import { describe, expect, it } from "vitest";
import { rulesAdvisor } from "../src/advisor";
import { pickClosure, watchKey, watchWeekend, WatchError, WATCH_LABEL } from "../src/watch";
import { COIN, pausedHistory, weekendHistory, world } from "./fixtures";
import { NYSE_CALENDAR } from "@morrow/config";
import { buildClosures } from "@morrow/core";

const AFTER = Date.parse("2026-10-06T00:00:00Z"); // a Tuesday after the Oct 5 reopening: every closure through Oct 5 is graded

function setup(history = pausedHistory(AFTER)) {
  const w = world({ history });
  w.state.now = AFTER;
  return w;
}

describe("watch a weekend", () => {
  it("replays one real closure end to end with the real cycle, labelled simulated", async () => {
    const w = setup();
    const r = await watchWeekend(w.ports, rulesAdvisor, { backingCoin: COIN });
    expect(r.label).toBe(WATCH_LABEL);
    expect(r.steps.map((s) => s.id)).toEqual(["seal", "weekend", "project", "decide", "act", "reopen", "grade"]);
    expect(r.loan.basis).toBe("standard");
    expect(r.loan.startHealth).toBeGreaterThan(0.5);
    expect(r.loan.startHealth).toBeLessThan(0.6);
    expect(r.decidedBy).toBe("rules only");
    expect(r.outcome.kept).toBe(true);
    expect(r.outcome.paidDown).toBeGreaterThan(0);
    expect(r.prices.length).toBeGreaterThan(10);
    expect(r.reopenMove).toBeLessThan(0);
  });

  it("grades the loan as it stands after the actions of the same check", async () => {
    const r = await watchWeekend(setup().ports, rulesAdvisor, { backingCoin: COIN });
    const price = Number(r.steps.find((s) => s.id === "grade")!.facts.find((f) => f.label === "Price used")!.value.replace(/[^0-9.]/g, ""));
    expect(r.outcome.healthWithMorrow!).toBeCloseTo((r.loan.debt - r.outcome.paidDown) / (r.loan.backingAmount * price), 3);
  });

  it("seals before it acts, in time order, and never sends anything", async () => {
    const w = setup();
    const r = await watchWeekend(w.ports, rulesAdvisor, { backingCoin: COIN });
    const seal = r.steps.find((s) => s.id === "seal")!;
    const act = r.steps.find((s) => s.id === "act")!;
    const reopen = r.steps.find((s) => s.id === "reopen")!;
    expect(seal.at).toBeLessThanOrEqual(act.at);
    expect(act.at).toBeLessThan(reopen.at);
    expect(seal.facts.some((f) => /Sealed promise/.test(f.label) && /^[0-9a-f]{16}…$/.test(f.value))).toBe(true);
    expect(w.calls).toHaveLength(0);
  });

  it("says plainly when a token pauses over the weekend, and when it keeps trading", async () => {
    const paused = await watchWeekend(setup().ports, rulesAdvisor, { backingCoin: COIN });
    expect(paused.steps.find((s) => s.id === "weekend")!.line).toMatch(/pauses/);
    const trading = await watchWeekend(setup(weekendHistory(AFTER)).ports, rulesAdvisor, { backingCoin: COIN });
    expect(trading.steps.find((s) => s.id === "weekend")!.line).toMatch(/kept trading/);
  });

  it("uses the visitor's own size and loan health, placed on a real weekend", async () => {
    const w = setup();
    // 580 USDT borrowed against 10 backing at a price of 100: 58% loan health now.
    const r = await watchWeekend(w.ports, rulesAdvisor, { backingCoin: COIN, yours: { backingAmount: 10, debt: 580 } });
    expect(r.loan.basis).toBe("yours");
    expect(r.loan.debt).toBe(580);
    expect(r.loan.startHealth).toBeCloseTo(0.58, 1);
    expect(r.notes.join(" ")).toMatch(/Your loan/);
  });

  it("refuses a loan already at the liquidation level, an unlisted token and a missing weekend, in plain words", async () => {
    const w = setup();
    await expect(watchWeekend(w.ports, rulesAdvisor, { backingCoin: COIN, yours: { backingAmount: 10, debt: 900 } })).rejects.toThrow(/liquidation level/);
    await expect(watchWeekend(w.ports, rulesAdvisor, { backingCoin: "rNOPE" })).rejects.toThrow(WatchError);
    await expect(watchWeekend(w.ports, rulesAdvisor, { backingCoin: COIN, closeTs: 123 })).rejects.toThrow(/not enough price history/);
  });

  it("only offers closures that are over and have a grade price, and picks the biggest gap down with enough history", () => {
    const closures = buildClosures(NYSE_CALENDAR, Date.parse("2026-01-01T00:00:00Z"), AFTER);
    const picked = pickClosure(pausedHistory(AFTER), closures, COIN);
    expect(picked).not.toBeNull();
    expect(pickClosure(pausedHistory(AFTER), closures, COIN, picked!.closeTs)?.closeTs).toBe(picked!.closeTs);
  });

  it("gives the same cache key for the same request and a different one for a different loan", () => {
    expect(watchKey({ backingCoin: "rA" })).toBe(watchKey({ backingCoin: "RA" }));
    expect(watchKey({ backingCoin: "rA" })).not.toBe(watchKey({ backingCoin: "rA", yours: { backingAmount: 1, debt: 1 } }));
  });
});
