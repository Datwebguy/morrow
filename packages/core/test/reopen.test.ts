import { describe, expect, it } from "vitest";
import { quantile, reopenGaps, reopenRisk, type Candle, type Closure } from "../src";

const H = 3_600_000; // test fixture: one hour in ms
const opts = { hourMs: H, minCoverage: 0.5 };

function candle(t: number, open: number, close: number): Candle {
  return { t, open, close, high: Math.max(open, close), low: Math.min(open, close) };
}

describe("quantile", () => {
  it("interpolates", () => {
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 100)).toBe(4);
    expect(quantile([1, 2, 3, 4], 50)).toBeCloseTo(2.5);
  });
  it("rejects empty input and bad q", () => {
    expect(() => quantile([], 50)).toThrow();
    expect(() => quantile([1], 101)).toThrow();
  });
});

describe("reopenGaps", () => {
  const closure: Closure = { closeTs: 10 * H, reopenTs: 60 * H };
  it("measures close to reopen for a token that pauses", () => {
    const candles = [candle(9 * H, 100, 100), candle(60 * H, 95, 96)];
    const g = reopenGaps(candles, [closure], opts);
    expect(g).toHaveLength(1);
    expect(g[0]!.move).toBeCloseTo(-0.05);
    expect(g[0]!.tradedDuringClosure).toBe(false);
  });
  it("does not call a token a weekend trader because of a few extended-hours candles", () => {
    const candles = [candle(9 * H, 100, 100), candle(10 * H, 99, 98), candle(11 * H, 99, 98), candle(59 * H, 99, 98), candle(60 * H, 97, 97)];
    const g = reopenGaps(candles, [closure], opts)[0]!;
    expect(g.tradedDuringClosure).toBe(false);
    expect(g.coverage).toBeCloseTo(3 / 50);
  });
  it("marks tokens that trade through most of the closure", () => {
    const candles = [candle(9 * H, 100, 100), ...Array.from({ length: 40 }, (_, i) => candle((12 + i) * H, 99, 98)), candle(60 * H, 97, 97)];
    const g = reopenGaps(candles, [closure], opts)[0]!;
    expect(g.tradedDuringClosure).toBe(true);
    expect(g.coverage).toBeCloseTo(0.8);
  });
  it("ignores candles with no volume", () => {
    const quiet = Array.from({ length: 40 }, (_, i) => ({ ...candle((12 + i) * H, 99, 98), volume: 0 }));
    const g = reopenGaps([candle(9 * H, 100, 100), ...quiet, candle(60 * H, 97, 97)], [closure], opts)[0]!;
    expect(g.tradedDuringClosure).toBe(false);
  });
  it("skips a closure with no candle on one side instead of guessing", () => {
    expect(reopenGaps([candle(9 * H, 100, 100)], [closure], opts)).toHaveLength(0);
    expect(reopenGaps([candle(60 * H, 100, 100)], [closure], opts)).toHaveLength(0);
  });
  it("skips bad prices", () => {
    expect(reopenGaps([candle(9 * H, 0, 0), candle(60 * H, 1, 1)], [closure], opts)).toHaveLength(0);
  });
  it("handles a huge gap", () => {
    const g = reopenGaps([candle(9 * H, 100, 100), candle(60 * H, 40, 40)], [closure], opts);
    expect(g[0]!.move).toBeCloseTo(-0.6);
  });
});

describe("reopenRisk", () => {
  const moves = Array.from({ length: 100 }, (_, i) => (i - 90) / 1000); // -0.09 .. +0.009
  const gaps = moves.map((m, i) => ({
    closeTs: i, reopenTs: i + 1, closePrice: 100, openPrice: 100 * (1 + m), move: m, tradedDuringClosure: i % 2 === 0, coverage: 0.5,
  }));
  it("returns null with too little history", () => {
    expect(reopenRisk(gaps.slice(0, 5), [95, 99], 20)).toBeNull();
    expect(reopenRisk([], [95], 0)).toBeNull();
  });
  it("gives larger drops for higher percentiles", () => {
    const r = reopenRisk(gaps, [95, 99], 20)!;
    expect(r.sample).toBe(100);
    expect(r.drops[99]!).toBeGreaterThan(r.drops[95]!);
    expect(r.drops[99]!).toBeCloseTo(0.08901, 5);
    expect(r.maxAbsMove).toBeCloseTo(0.09);
  });
  it("reports zero drop when every closure gapped up", () => {
    const up = gaps.map((g) => ({ ...g, move: 0.02 }));
    expect(reopenRisk(up, [99], 1)!.drops[99]).toBe(0);
  });
  it("detects tokens that trade on weekends", () => {
    const weekend = gaps.map((g) => ({ ...g, tradedDuringClosure: true }));
    expect(reopenRisk(weekend, [95], 1)!.tradesOnWeekends).toBe(true);
    const paused = gaps.map((g) => ({ ...g, tradedDuringClosure: false }));
    expect(reopenRisk(paused, [95], 1)!.tradesOnWeekends).toBe(false);
  });
});
