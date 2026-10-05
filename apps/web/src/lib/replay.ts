/** Reads the replay report (public/replay-report.json) into rows for the record page. Everything shown comes from the file. */

export interface Cell {
  loans: number;
  baselineMarginCalls: number;
  baselineLiquidations: number;
  morrowMarginCalls: number;
  morrowLiquidations: number;
  usdtUsed: number;
  totalDebt: number;
  interestSaved: number;
  loansActedOn: number;
}

export interface Summary {
  all: Cell;
  byStartLtv: Record<string, Cell>;
  closures: number;
  tokens: number;
}

export interface ReplayReport {
  label: string;
  note: string;
  caveats: string[];
  generatedAt: string;
  calendar: { source: string; fetchedAt: string };
  tokens: number;
  closures: number;
  outOfSampleFrom: string;
  chosen: { planningPercentile: number; triggerBufferPoints: number };
  simulatedLoan: { backingValueUsdt: number; idleFractionMain: number };
  results: Array<{ idleFraction: number; train: Summary; outOfSample: Summary }>;
}

export interface ReplayRow {
  /** Loan health at the start of the simulated loan, as a ratio. */
  start: number;
  loans: number;
  withoutMorrow: number;
  withMorrow: number;
  /** USDT paid down as a share of the total debt. */
  costShare: number;
  actedShare: number;
}

export function mainResult(r: ReplayReport): ReplayReport["results"][number] | null {
  return r.results.find((x) => x.idleFraction === r.simulatedLoan.idleFractionMain) ?? null;
}

export function replayRows(s: Summary): ReplayRow[] {
  return Object.entries(s.byStartLtv)
    .map(([k, c]) => ({
      start: Number(k),
      loans: c.loans,
      withoutMorrow: c.baselineMarginCalls + c.baselineLiquidations,
      withMorrow: c.morrowMarginCalls + c.morrowLiquidations,
      costShare: c.totalDebt > 0 ? c.usdtUsed / c.totalDebt : 0,
      actedShare: c.loans > 0 ? c.loansActedOn / c.loans : 0,
    }))
    .sort((a, b) => a.start - b.start);
}
