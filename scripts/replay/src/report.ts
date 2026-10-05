import type { ClosureOutcome } from "./simulate";

export type Row = ClosureOutcome & { period: "train" | "out_of_sample" };

export interface Cell {
  /** Loans simulated (one per token, closure, start health and valuation case). */
  loans: number;
  baselineMarginCalls: number;
  baselineLiquidations: number;
  morrowMarginCalls: number;
  morrowLiquidations: number;
  /** USDT paid down in total. */
  usdtUsed: number;
  /** Total debt of the simulated loans, to read the cost against. */
  totalDebt: number;
  interestSaved: number;
  loansActedOn: number;
}

export interface Summary {
  all: Cell;
  byMode: Record<string, Cell>;
  byStartLtv: Record<string, Cell>;
  byModeAndStart: Record<string, Cell>;
  /** Split by whether the token traded through the closure. */
  byTradesOnWeekends: Record<string, Cell>;
  closures: number;
  tokens: number;
}

const empty = (): Cell => ({
  loans: 0, baselineMarginCalls: 0, baselineLiquidations: 0, morrowMarginCalls: 0, morrowLiquidations: 0,
  usdtUsed: 0, totalDebt: 0, interestSaved: 0, loansActedOn: 0,
});

function add(c: Cell, r: Row): void {
  c.loans += 1;
  c.baselineMarginCalls += r.baseline.marginCall ? 1 : 0;
  c.baselineLiquidations += r.baseline.liquidation ? 1 : 0;
  c.morrowMarginCalls += r.withMorrow.marginCall ? 1 : 0;
  c.morrowLiquidations += r.withMorrow.liquidation ? 1 : 0;
  c.usdtUsed += r.withMorrow.usdtUsed;
  c.totalDebt += r.debt;
  c.interestSaved += r.withMorrow.interestSaved;
  c.loansActedOn += r.withMorrow.actions > 0 ? 1 : 0;
}

function bucket(map: Record<string, Cell>, key: string, r: Row): void {
  add((map[key] ??= empty()), r);
}

export function aggregate(rows: Row[]): Summary {
  const s: Summary = {
    all: empty(), byMode: {}, byStartLtv: {}, byModeAndStart: {}, byTradesOnWeekends: {},
    closures: new Set(rows.map((r) => r.closeTs)).size, tokens: new Set(rows.map((r) => r.symbol)).size,
  };
  for (const r of rows) {
    add(s.all, r);
    bucket(s.byMode, r.mode, r);
    bucket(s.byStartLtv, String(r.startLtv), r);
    bucket(s.byModeAndStart, `${r.mode}@${r.startLtv}`, r);
    bucket(s.byTradesOnWeekends, r.tradesOnWeekends ? "trades_on_weekends" : "paused_on_weekends", r);
  }
  return s;
}

interface GridEntry {
  planningPercentile: number;
  triggerBufferPoints: number;
  summary: Summary;
}

/**
 * Pick rule settings on the earlier period only: among settings whose remaining margin calls and liquidations
 * are within 10% of the lowest found (plus one, so a zero floor does not exclude everything), take the one
 * that pays down the least USDT.
 */
export function chooseParams(grid: GridEntry[]): { planningPercentile: number; triggerBufferPoints: number } {
  if (grid.length === 0) throw new RangeError("empty grid");
  const events = (g: GridEntry): number => g.summary.all.morrowMarginCalls + g.summary.all.morrowLiquidations;
  const best = Math.min(...grid.map(events));
  const ok = grid.filter((g) => events(g) <= best * 1.1 + 1);
  ok.sort((a, b) => a.summary.all.usdtUsed - b.summary.all.usdtUsed);
  const pick = ok[0] as GridEntry;
  return { planningPercentile: pick.planningPercentile, triggerBufferPoints: pick.triggerBufferPoints };
}
