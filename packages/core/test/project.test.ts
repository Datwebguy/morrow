import { describe, expect, it } from "vitest";
import { projectAtReopen, type ProjectInput, type ReopenRisk } from "../src";

const risk: ReopenRisk = { sample: 50, drops: { 99: 0.1 }, maxAbsMove: 0.12, tradesOnWeekends: true };
const base: ProjectInput = {
  position: { debt: 500, backingAmount: 10 },
  limits: { start: 0.5, marginCall: 0.6, liquidation: 0.8 },
  watchBuffer: 0.1, lastClose: 100, livePrice: 90, priceTrusted: true, tradesOnWeekends: true, risk, planningPercentile: 99,
};

describe("projectAtReopen", () => {
  it("uses the live price when trusted and the token trades on weekends", () => {
    const p = projectAtReopen(base);
    expect(p.basis).toBe("live_price");
    expect(p.price).toBe(90);
    expect(p.health!.ratio).toBeCloseTo(500 / 900);
  });
  it("uses the history case when the price is not trusted", () => {
    const p = projectAtReopen({ ...base, priceTrusted: false });
    expect(p.basis).toBe("history_case");
    expect(p.price).toBeCloseTo(90);
  });
  it("uses the history case for a token that does not trade on weekends", () => {
    expect(projectAtReopen({ ...base, tradesOnWeekends: false }).basis).toBe("history_case");
  });
  it("is unavailable with no trusted price and no history", () => {
    const p = projectAtReopen({ ...base, priceTrusted: false, risk: null });
    expect(p).toEqual({ basis: "unavailable", price: null, health: null });
  });
  it("is unavailable when the planning percentile is missing", () => {
    expect(projectAtReopen({ ...base, priceTrusted: false, planningPercentile: 95 }).basis).toBe("unavailable");
  });
});
