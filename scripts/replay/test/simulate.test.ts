import { describe, expect, it } from "vitest";
import { reopenGaps, type Candle, type MarketClosure } from "@morrow/core";
import { aggregate, chooseParams, type Row } from "../src/report";
import { simulateClosure, type Constants, type Params } from "../src/simulate";

// Test fixtures: a synthetic stock that closes every "week" at 100 and reopens at a chosen price. Not market data.
const H = 3_600_000;
const WEEK = 168 * H;
const limits = { start: 0.5, marginCall: 0.6, liquidation: 0.8 };
const k: Constants = { hourMs: H, minClosures: 3, maxMoveVsHistoryMultiple: 2, hourRate: 0.00001 };
const params: Params = { planningPercentile: 99, triggerBufferRatio: 0.05, targetBufferRatio: 0.1, idleFraction: 1 };

function world(reopenPrices: number[], weekendTrades: boolean): { candles: Candle[]; closures: MarketClosure[] } {
  const candles: Candle[] = [];
  const closures: MarketClosure[] = [];
  reopenPrices.forEach((rp, w) => {
    const base = w * WEEK;
    const closeTs = base + 100 * H;
    const reopenTs = base + 148 * H;
    candles.push({ t: closeTs - H, open: 100, high: 100, low: 100, close: 100, volume: 10 });
    if (weekendTrades) for (let t = closeTs; t < reopenTs; t += H) candles.push({ t, open: 100, high: 100, low: 100, close: 100, volume: 10 });
    candles.push({ t: reopenTs, open: rp, high: rp, low: rp, close: rp, volume: 10 });
    closures.push({ closeTs, reopenTs, closeDate: "", reopenDate: "", earlyClose: false });
  });
  return { candles, closures };
}
const run = (w: ReturnType<typeof world>, closureIdx: number, ltv: number, mode: "live_price" | "last_close", p: Params = params) =>
  simulateClosure("X", w.candles, w.closures[closureIdx]!, reopenGaps(w.candles, w.closures, { hourMs: H, minCoverage: 0.5 }), limits, ltv, 10_000, mode, p, k, { maxMoveVsHistoryMultiple: 2 });

describe("simulateClosure", () => {
  // Three calm weeks (history), then one gap down of 20%.
  const w = world([99, 98, 97, 80], false);
  it("skips closures with too little earlier history", () => {
    expect(run(w, 1, 0.5, "last_close")).toBeNull();
  });
  it("without Morrow, a 20% gap takes a 0.5 loan past the margin call", () => {
    const r = run(w, 3, 0.5, "last_close", { ...params, planningPercentile: 99, triggerBufferRatio: -1 })!;
    expect(r.baseline.marginCall).toBe(true); // 0.5 / 0.8 = 0.625 >= 0.6
    expect(r.baseline.liquidation).toBe(false);
  });
  it("Morrow pays down ahead of the gap when history says the bad case is large enough", () => {
    const calm = world([99, 98, 97, 80], false);
    // history drops are only about 1-3%, so a loan near the margin call is paid down but not far enough for a 20% gap
    const r = run(calm, 3, 0.58, "last_close")!;
    expect(r.withMorrow.usdtUsed).toBeGreaterThan(0);
    expect(r.withMorrow.worstLtv).toBeLessThan(r.baseline.worstLtv);
  });
  it("does nothing for a safe loan", () => {
    const r = run(w, 3, 0.3, "last_close")!;
    expect(r.withMorrow.usdtUsed).toBe(0);
    expect(r.withMorrow.actions).toBe(0);
  });
  it("never pays more than the idle balance", () => {
    const r = run(w, 3, 0.58, "last_close", { ...params, idleFraction: 0.01 })!;
    expect(r.withMorrow.usdtUsed).toBeLessThanOrEqual(0.01 * 0.58 * 10_000 + 1e-6);
  });
  it("uses the live weekend price when the token trades through the closure", () => {
    const t = world([99, 98, 97, 80], true);
    const r = run(t, 3, 0.5, "live_price")!;
    expect(r.tradesOnWeekends).toBe(true);
    expect(r.baseline.worstLtv).toBeCloseTo(0.625);
  });
});

describe("report", () => {
  const row = (over: Partial<Row>): Row => ({
    symbol: "X", closeTs: 1, reopenTs: 2, startLtv: 0.7, mode: "last_close", debt: 7000, tradesOnWeekends: false, period: "train",
    baseline: { marginCall: true, liquidation: false, worstLtv: 0.8 },
    withMorrow: { marginCall: false, liquidation: false, worstLtv: 0.5, usdtUsed: 100, actions: 1, interestSaved: 0.1 },
    ...over,
  });
  it("adds counts and cost", () => {
    const s = aggregate([row({}), row({ symbol: "Y", closeTs: 2, baseline: { marginCall: false, liquidation: false, worstLtv: 0.5 } })]);
    expect(s.all.loans).toBe(2);
    expect(s.all.baselineMarginCalls).toBe(1);
    expect(s.all.usdtUsed).toBe(200);
    expect(s.closures).toBe(2);
    expect(s.tokens).toBe(2);
    expect(s.byModeAndStart["last_close@0.7"]?.loans).toBe(2);
  });
  it("chooses the cheapest setting among those near the fewest remaining events", () => {
    const g = (p: number, t: number, events: number, usdt: number) => ({
      planningPercentile: p, triggerBufferPoints: t,
      summary: aggregate(
        Array.from({ length: 100 }, (_, i) =>
          row({ symbol: `S${i}`, withMorrow: { marginCall: i < events, liquidation: false, worstLtv: 0, usdtUsed: usdt / 100, actions: 1, interestSaved: 0 } }),
        ),
      ),
    });
    expect(chooseParams([g(95, 0, 20, 10), g(99, 10, 0, 1000), g(99, 5, 0, 50)])).toEqual({ planningPercentile: 99, triggerBufferPoints: 5 });
  });
  it("rejects an empty grid", () => {
    expect(() => chooseParams([])).toThrow();
  });
});
