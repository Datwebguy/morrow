import type { Candle, Closure } from "./types";

export interface ReopenGap {
  closeTs: number;
  reopenTs: number;
  closePrice: number;
  openPrice: number;
  /** openPrice / closePrice - 1. Negative is a gap down. */
  move: number;
  /** True if the token printed candles inside the closure window (it traded through it). */
  tradedDuringClosure: boolean;
}

function lastCandleBefore(candles: Candle[], ts: number): Candle | undefined {
  let found: Candle | undefined;
  for (const c of candles) {
    if (c.t < ts && (!found || c.t > found.t)) found = c;
  }
  return found;
}

function firstCandleAtOrAfter(candles: Candle[], ts: number): Candle | undefined {
  let found: Candle | undefined;
  for (const c of candles) {
    if (c.t >= ts && (!found || c.t < found.t)) found = c;
  }
  return found;
}

/**
 * Close-to-reopen move for each closure, from the stock token's own hourly candles.
 * Closures without a candle on both sides are skipped, never guessed.
 */
export function reopenGaps(candles: Candle[], closures: Closure[]): ReopenGap[] {
  const gaps: ReopenGap[] = [];
  for (const cl of closures) {
    const before = lastCandleBefore(candles, cl.closeTs);
    const after = firstCandleAtOrAfter(candles, cl.reopenTs);
    if (!before || !after) continue;
    if (!(before.close > 0) || !(after.open > 0)) continue;
    const tradedDuringClosure = candles.some((c) => c.t >= cl.closeTs && c.t < cl.reopenTs);
    gaps.push({
      closeTs: cl.closeTs,
      reopenTs: cl.reopenTs,
      closePrice: before.close,
      openPrice: after.open,
      move: after.open / before.close - 1,
      tradedDuringClosure,
    });
  }
  return gaps;
}

/** Quantile with linear interpolation. `q` is a percentage from 0 to 100. */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) throw new RangeError("no values");
  if (q < 0 || q > 100) throw new RangeError("q must be between 0 and 100");
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (q / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const loV = sorted[lo] as number;
  const hiV = sorted[hi] as number;
  return loV + (hiV - loV) * (pos - lo);
}

export interface ReopenRisk {
  /** Number of closures behind these numbers. */
  sample: number;
  /** Drop (positive number, as a fraction) that was exceeded in only (100 - p)% of closures, for each planning percentile. */
  drops: Record<number, number>;
  /** Largest absolute close-to-reopen move seen. */
  maxAbsMove: number;
  tradesOnWeekends: boolean;
}

/**
 * Reopen risk for a token. Returns null when there are fewer than `minSample` closures:
 * with too little history no number is shown and no action is based on it.
 */
export function reopenRisk(gaps: ReopenGap[], percentiles: number[], minSample: number): ReopenRisk | null {
  if (gaps.length < minSample || gaps.length === 0) return null;
  const moves = gaps.map((g) => g.move);
  const drops: Record<number, number> = {};
  for (const p of percentiles) {
    // The p-th percentile drop is the loss that only (100 - p)% of closures were worse than.
    const worstTail = quantile(moves, 100 - p);
    drops[p] = Math.max(0, -worstTail);
  }
  const traded = gaps.filter((g) => g.tradedDuringClosure).length;
  return {
    sample: gaps.length,
    drops,
    maxAbsMove: Math.max(...moves.map((m) => Math.abs(m))),
    tradesOnWeekends: traded * 2 > gaps.length,
  };
}
