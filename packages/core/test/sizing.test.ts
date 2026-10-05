import { describe, expect, it } from "vitest";
import { sizeAction, type SizingInput } from "../src";

// Test fixture inputs, not product data.
const base: SizingInput = {
  position: { debt: 700, backingAmount: 10 },
  limits: { start: 0.5, marginCall: 0.6, liquidation: 0.8 },
  price: 100, targetBufferRatio: 0.1, allowed: ["pay_down", "add_backing"],
  idleBorrowed: 1000, idleBacking: 5, maxPerAction: 1000,
};

describe("sizeAction", () => {
  it("does nothing when already under the target", () => {
    const p = sizeAction({ ...base, position: { debt: 400, backingAmount: 10 } });
    expect(p.needed).toBe(false);
    expect(p.reason).toBe("already_safe");
  });
  it("sizes the smallest pay down that reaches the target", () => {
    const p = sizeAction({ ...base, allowed: ["pay_down"] });
    expect(p.payDown).toBeCloseTo(200); // 700 - 0.5 * 1000
    expect(p.reachesTarget).toBe(true);
    expect(p.ratioAfter).toBeCloseTo(0.5);
  });
  it("sizes added backing when only that is allowed", () => {
    const p = sizeAction({ ...base, allowed: ["add_backing"] });
    expect(p.addBacking).toBeCloseTo(4); // 700 / (0.5 * 100) - 10
    expect(p.reachesTarget).toBe(true);
  });
  it("prefers the cheaper single and breaks ties to pay down", () => {
    const p = sizeAction(base);
    expect(p.payDown).toBeCloseTo(200);
    expect(p.addBacking).toBe(0);
    const q = sizeAction({ ...base, idleBorrowed: 150, maxPerAction: 1000 });
    expect(q.addBacking).toBeCloseTo(4);
    expect(q.payDown).toBe(0);
  });
  it("caps by idle balance and the user's limit", () => {
    const p = sizeAction({ ...base, allowed: ["pay_down"], idleBorrowed: 50 });
    expect(p.reachesTarget).toBe(false);
    expect(p.payDown).toBeCloseTo(50);
    expect(p.reason).toBe("short_of_target");
    const q = sizeAction({ ...base, allowed: ["pay_down"], maxPerAction: 80 });
    expect(q.payDown).toBeCloseTo(80);
  });
  it("combines both when neither alone is enough", () => {
    const p = sizeAction({ ...base, idleBorrowed: 120, idleBacking: 2 });
    expect(p.payDown).toBeCloseTo(120);
    expect(p.addBacking).toBeGreaterThan(0);
    expect(p.reachesTarget).toBe(true);
    expect(p.ratioAfter).toBeLessThanOrEqual(p.targetRatio + 1e-9);
  });
  it("reports nothing available with zero balances", () => {
    const p = sizeAction({ ...base, idleBorrowed: 0, idleBacking: 0 });
    expect(p.reason).toBe("nothing_available");
    expect(p.payDown + p.addBacking).toBe(0);
  });
  it("reports no allowed action", () => {
    expect(sizeAction({ ...base, allowed: [] }).reason).toBe("no_allowed_action");
  });
  it("handles a huge gap by falling short honestly", () => {
    const p = sizeAction({ ...base, price: 20, idleBorrowed: 300, idleBacking: 1 });
    expect(p.needed).toBe(true);
    expect(p.reachesTarget).toBe(false);
  });
  it("handles a tiny loan", () => {
    const p = sizeAction({ ...base, position: { debt: 0.01, backingAmount: 10 } });
    expect(p.needed).toBe(false);
  });
  it("rejects a buffer that leaves no room", () => {
    expect(() => sizeAction({ ...base, targetBufferRatio: 0.7 })).toThrow();
  });
});
