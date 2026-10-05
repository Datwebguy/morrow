import { describe, expect, it } from "vitest";
import { loanHealth, valuationPrice } from "../src";

// Test fixture: limits shaped like Bitget's loan parameters. Values are test inputs, not product data.
const limits = { start: 0.5, marginCall: 0.6, liquidation: 0.8 };

describe("loanHealth", () => {
  it("computes ratio and distances", () => {
    const h = loanHealth({ debt: 300, backingAmount: 10 }, 100, limits, 0.1);
    expect(h.ratio).toBeCloseTo(0.3);
    expect(h.distanceToMarginCall).toBeCloseTo(0.3);
    expect(h.distanceToLiquidation).toBeCloseTo(0.5);
    expect(h.priceDropToMarginCall).toBeCloseTo(0.5);
    expect(h.status).toBe("safe");
  });
  it("flags watch inside the buffer, margin call and liquidation", () => {
    expect(loanHealth({ debt: 520, backingAmount: 10 }, 100, limits, 0.1).status).toBe("watch");
    expect(loanHealth({ debt: 650, backingAmount: 10 }, 100, limits, 0.1).status).toBe("margin_call");
    expect(loanHealth({ debt: 850, backingAmount: 10 }, 100, limits, 0.1).status).toBe("liquidation");
  });
  it("reports zero drop room once past the margin call", () => {
    const h = loanHealth({ debt: 650, backingAmount: 10 }, 100, limits, 0.1);
    expect(h.priceDropToMarginCall).toBe(0);
    expect(h.distanceToMarginCall).toBeLessThan(0);
  });
  it("handles zero debt", () => {
    const h = loanHealth({ debt: 0, backingAmount: 10 }, 100, limits, 0.1);
    expect(h.ratio).toBe(0);
    expect(h.priceDropToMarginCall).toBe(1);
    expect(h.status).toBe("safe");
  });
  it("rejects zero backing, bad price and inverted limits", () => {
    expect(() => loanHealth({ debt: 1, backingAmount: 0 }, 100, limits, 0.1)).toThrow();
    expect(() => loanHealth({ debt: 1, backingAmount: 1 }, 0, limits, 0.1)).toThrow();
    expect(() => loanHealth({ debt: 1, backingAmount: 1 }, Number.NaN, limits, 0.1)).toThrow();
    expect(() => loanHealth({ debt: -1, backingAmount: 1 }, 1, limits, 0.1)).toThrow();
    expect(() => loanHealth({ debt: 1, backingAmount: 1 }, 1, { start: 0.5, marginCall: 0.9, liquidation: 0.8 }, 0.1)).toThrow();
  });
  it("tiny loan stays safe", () => {
    expect(loanHealth({ debt: 0.01, backingAmount: 1000 }, 100, limits, 0.1).status).toBe("safe");
  });
  it("picks the valuation price for each basis", () => {
    expect(valuationPrice("live", 90, 100)).toBe(90);
    expect(valuationPrice("last_close", 90, 100)).toBe(100);
  });
});
