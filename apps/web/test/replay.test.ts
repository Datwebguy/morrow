import { describe, expect, it } from "vitest";
import { headline, type Cell, type ReplayReport } from "../src/lib/replay";

// TEST FIXTURES ONLY. Invented inputs for the arithmetic, never shown on the site.
const cell = (loans: number, without: number, withM: number, used: number, debt: number): Cell => ({
  loans, baselineMarginCalls: without, baselineLiquidations: 0, morrowMarginCalls: withM, morrowLiquidations: 0, usdtUsed: used, totalDebt: debt, interestSaved: 0, loansActedOn: 0,
});
const report = {
  simulatedLoan: { idleFractionMain: 0.25, backingValueUsdt: 1 },
  results: [{ idleFraction: 0.25,
    train: { all: cell(0, 0, 0, 0, 0), byStartLtv: { "0.5": cell(10, 1, 0, 1, 100), "0.9": cell(10, 6, 0, 10, 100) }, closures: 3, tokens: 4 },
    outOfSample: { all: cell(0, 0, 0, 0, 0), byStartLtv: { "0.5": cell(10, 2, 1, 3, 100), "0.9": cell(10, 4, 0, 10, 100) }, closures: 2, tokens: 4 } }],
} as unknown as ReplayReport;

describe("record headline", () => {
  it("adds both periods at the highest and lowest start, and reads the weekends from the report", () => {
    const h = headline(report)!;
    expect(h.weekends).toBe(5);
    expect(h.high).toMatchObject({ start: 0.9, withoutMorrow: 10, withMorrow: 0, loans: 20 });
    expect(h.high.costShare).toBeCloseTo(0.1);
    expect(h.low).toMatchObject({ start: 0.5, withoutMorrow: 3, withMorrow: 1 });
    expect(h.low.costShare).toBeCloseTo(0.02);
  });
  it("returns nothing when the report has no results", () => {
    expect(headline({ ...report, results: [] } as unknown as ReplayReport)).toBeNull();
  });
});
