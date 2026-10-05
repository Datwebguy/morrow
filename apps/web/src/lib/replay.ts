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

export interface Headline {
  /** Real weekends scored, earlier period plus out-of-sample. */
  weekends: number;
  tokens: number;
  /** Loans that start closest to the margin-call level, and the ones that start at the live start level. */
  high: HeadlineRow;
  low: HeadlineRow;
}

export interface HeadlineRow {
  start: number;
  loans: number;
  withoutMorrow: number;
  withMorrow: number;
  /** USDT paid down as a share of the debt. */
  costShare: number;
}

function combine(a: Cell | undefined, b: Cell | undefined, start: number): HeadlineRow {
  const cells = [a, b].filter((c): c is Cell => c !== undefined);
  const debt = cells.reduce((s, c) => s + c.totalDebt, 0);
  return {
    start,
    loans: cells.reduce((s, c) => s + c.loans, 0),
    withoutMorrow: cells.reduce((s, c) => s + c.baselineMarginCalls + c.baselineLiquidations, 0),
    withMorrow: cells.reduce((s, c) => s + c.morrowMarginCalls + c.morrowLiquidations, 0),
    costShare: debt > 0 ? cells.reduce((s, c) => s + c.usdtUsed, 0) / debt : 0,
  };
}

/** The headline for the record page, from the report only: both periods together, at the highest and lowest simulated start. */
export function headline(r: ReplayReport): Headline | null {
  const main = mainResult(r);
  if (!main) return null;
  const starts = [...new Set([...Object.keys(main.train.byStartLtv), ...Object.keys(main.outOfSample.byStartLtv)])].map(Number).sort((a, b) => a - b);
  if (starts.length === 0) return null;
  const at = (s: number): HeadlineRow => combine(main.train.byStartLtv[String(s)], main.outOfSample.byStartLtv[String(s)], s);
  return {
    weekends: main.train.closures + main.outOfSample.closures,
    tokens: Math.max(main.train.tokens, main.outOfSample.tokens),
    high: at(starts[starts.length - 1] as number),
    low: at(starts[0] as number),
  };
}
