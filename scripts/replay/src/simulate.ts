import {
  projectAtReopen, reopenRisk, sizeAction,
  type Candle, type LoanLimits, type MarketClosure, type ReopenGap, type TrustThresholds,
} from "@morrow/core";

export type ValuationMode = "live_price" | "last_close";

export interface Params {
  planningPercentile: number;
  /** Act when the projected loan health is within this many points of the margin-call level (as a ratio). */
  triggerBufferRatio: number;
  /** Points below the margin-call level the plan aims for (as a ratio). */
  targetBufferRatio: number;
  /** Idle USDT as a share of the debt. */
  idleFraction: number;
}

export interface Constants {
  hourMs: number;
  minClosures: number;
  /** Multiple of the largest past gap beyond which a weekend move is not trusted. */
  maxMoveVsHistoryMultiple: number;
  /** Interest per hour on the borrowed coin, read live. */
  hourRate: number;
}

export interface ClosureOutcome {
  symbol: string;
  closeTs: number;
  reopenTs: number;
  startLtv: number;
  mode: ValuationMode;
  debt: number;
  tradesOnWeekends: boolean;
  baseline: { marginCall: boolean; liquidation: boolean; worstLtv: number };
  withMorrow: { marginCall: boolean; liquidation: boolean; worstLtv: number; usdtUsed: number; actions: number; interestSaved: number };
}

function lastCloseBefore(candles: Candle[], ts: number): Candle | undefined {
  let found: Candle | undefined;
  for (const c of candles) if (c.t < ts && (!found || c.t > found.t)) found = c;
  return found;
}

function firstAtOrAfter(candles: Candle[], ts: number): Candle | undefined {
  let found: Candle | undefined;
  for (const c of candles) if (c.t >= ts && (!found || c.t < found.t)) found = c;
  return found;
}

/** Whether this closure has enough earlier closures behind it to be scored. */
export function priorGapsFor(gaps: ReopenGap[], closeTs: number): ReopenGap[] {
  return gaps.filter((g) => g.reopenTs <= closeTs);
}

/**
 * Replays one stock token over one closure for one simulated loan.
 * Morrow only uses information available at each decision time: earlier closures and prices up to that hour.
 * Returns null when the closure cannot be scored (no prices on both sides, or too little earlier history).
 */
export function simulateClosure(
  symbol: string,
  candles: Candle[],
  closure: MarketClosure,
  allGaps: ReopenGap[],
  limits: LoanLimits,
  startLtv: number,
  backingValueUsdt: number,
  mode: ValuationMode,
  params: Params,
  k: Constants,
  trust: Pick<TrustThresholds, "maxMoveVsHistoryMultiple">,
): ClosureOutcome | null {
  const before = lastCloseBefore(candles, closure.closeTs);
  const after = firstAtOrAfter(candles, closure.reopenTs);
  if (!before || !after || !(before.close > 0) || !(after.open > 0)) return null;
  const prior = priorGapsFor(allGaps, closure.closeTs);
  const risk = reopenRisk(prior, [params.planningPercentile], k.minClosures);
  if (!risk) return null;

  const p0 = before.close;
  const backingAmount = backingValueUsdt / p0;
  const debt0 = startLtv * backingValueUsdt;
  const byT = new Map(candles.map((c) => [c.t, c]));
  const watchBuffer = params.targetBufferRatio;
  const ratioAt = (debt: number, price: number): number => debt / (backingAmount * price);
  const hours = Math.max(0, Math.floor((closure.reopenTs - closure.closeTs) / k.hourMs));

  // Decision hours: every hour from the close until the hour before the reopen.
  let debt = debt0;
  let idle = params.idleFraction * debt0;
  let usdtUsed = 0;
  let actions = 0;
  let interestSaved = 0;
  let worstWith = ratioAt(debt0, p0);
  let worstBase = ratioAt(debt0, p0);

  for (let i = 0; i < hours; i++) {
    const tau = closure.closeTs + i * k.hourMs;
    const liveCandle = byT.get(tau - k.hourMs);
    const livePrice = liveCandle ? liveCandle.close : null;
    if (livePrice !== null && mode === "live_price") {
      worstBase = Math.max(worstBase, ratioAt(debt0, livePrice));
      worstWith = Math.max(worstWith, ratioAt(debt, livePrice));
    }
    // Trust check from what the candle history can show: traded volume, and a move within what this stock has done before.
    const trusted =
      livePrice !== null &&
      (liveCandle?.volume ?? 0) > 0 &&
      Math.abs(livePrice / p0 - 1) <= risk.maxAbsMove * trust.maxMoveVsHistoryMultiple;
    const proj = projectAtReopen({
      position: { debt, backingAmount },
      limits, watchBuffer, lastClose: p0, livePrice, priceTrusted: trusted,
      tradesOnWeekends: risk.tradesOnWeekends, risk, planningPercentile: params.planningPercentile,
    });
    if (!proj.health || proj.price === null) continue;
    if (proj.health.ratio < limits.marginCall - params.triggerBufferRatio) continue;
    const plan = sizeAction({
      position: { debt, backingAmount }, limits, price: proj.price, targetBufferRatio: params.targetBufferRatio,
      allowed: ["pay_down"], idleBorrowed: idle, idleBacking: 0, maxPerAction: Number.MAX_SAFE_INTEGER,
    });
    if (plan.payDown > 0) {
      debt -= plan.payDown;
      idle -= plan.payDown;
      usdtUsed += plan.payDown;
      actions += 1;
      interestSaved += plan.payDown * k.hourRate * (hours - i);
    }
  }

  const reopenBase = ratioAt(debt0, after.open);
  const reopenWith = ratioAt(debt, after.open);
  worstBase = Math.max(worstBase, reopenBase);
  worstWith = Math.max(worstWith, reopenWith);
  // In the held-at-last-close case the loan is valued at the close until the reopen.
  if (mode === "last_close") {
    worstBase = Math.max(ratioAt(debt0, p0), reopenBase);
    worstWith = Math.max(ratioAt(debt0, p0), reopenWith);
  }

  const flag = (ratio: number): { marginCall: boolean; liquidation: boolean } => ({
    marginCall: ratio >= limits.marginCall,
    liquidation: ratio >= limits.liquidation,
  });
  return {
    symbol, closeTs: closure.closeTs, reopenTs: closure.reopenTs, startLtv, mode, debt: debt0,
    tradesOnWeekends: risk.tradesOnWeekends,
    baseline: { ...flag(worstBase), worstLtv: worstBase },
    withMorrow: { ...flag(worstWith), worstLtv: worstWith, usdtUsed, actions, interestSaved },
  };
}

