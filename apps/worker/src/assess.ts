import { DEFAULT_TRUST_THRESHOLDS, MIN_CLOSURES_FOR_HISTORY, MS_PER_HOUR, NYSE_CALENDAR, PERCENT, PLANNING_PERCENTILES, SCHEDULE, WEEKEND_TRADING_MIN_COVERAGE } from "@morrow/config";
import {
  buildClosures, loanHealth, priceTrust, projectAtReopen, reopenGaps, reopenRisk, sizeAction,
  type ActionPlan, type Candle, type LoanHealth, type LoanLimits, type MarketClosure, type PriceSnapshot, type Projection, type ReopenRisk, type TrustResult,
} from "@morrow/core";
import type { LoanRecord, Ports } from "./ports";
import type { UserSettings } from "./settings";

export type Phase = "open" | "pre_closure" | "closed";

export interface Profile {
  risk: ReopenRisk | null;
  candles: Candle[];
  fetchedAt: number;
}

/** Reopen history per stock token, rebuilt every few hours from Bitget's hourly candles and the stored NYSE calendar. */
export class ProfileCache {
  private readonly cache = new Map<string, Profile>();
  constructor(private readonly ports: Ports) {}

  async get(symbol: string): Promise<Profile> {
    const now = this.ports.nowMs();
    const hit = this.cache.get(symbol);
    if (hit && now - hit.fetchedAt < SCHEDULE.historyRefreshHours * MS_PER_HOUR) return hit;
    const calendarStart = Date.parse(`${Math.min(...NYSE_CALENDAR.years)}-01-01T00:00:00Z`);
    const candles = await this.ports.market.history(symbol, calendarStart - 7 * 24 * MS_PER_HOUR, now);
    const closures = buildClosures(NYSE_CALENDAR, calendarStart, now).filter((c) => c.reopenTs <= now);
    const gaps = reopenGaps(candles, closures, { hourMs: MS_PER_HOUR, minCoverage: WEEKEND_TRADING_MIN_COVERAGE });
    const risk = reopenRisk(gaps, [PLANNING_PERCENTILES.likely, PLANNING_PERCENTILES.severe], MIN_CLOSURES_FOR_HISTORY);
    const p = { risk, candles, fetchedAt: now };
    this.cache.set(symbol, p);
    return p;
  }
}

export interface Assessment {
  loan: LoanRecord;
  instrument: string;
  nowMs: number;
  phase: Phase;
  closure: MarketClosure | null;
  limits: LoanLimits | null;
  symbol: string | null;
  price: number | null;
  lastClose: number | null;
  healthNow: LoanHealth | null;
  trust: TrustResult | null;
  risk: ReopenRisk | null;
  projection: Projection | null;
  plan: ActionPlan | null;
  /** Things that stop Morrow acting, in plain words. */
  problems: string[];
  idle: { borrowed: number | null; backing: number | null };
  moveSinceClose: number | null;
  dataFresh: boolean;
}

export function phaseFor(nowMs: number, closure: MarketClosure | null): Phase {
  if (!closure) return "open";
  if (nowMs >= closure.closeTs && nowMs < closure.reopenTs) return "closed";
  if (closure.closeTs - nowMs <= SCHEDULE.promiseLeadMinutes * 60_000 && nowMs < closure.closeTs) return "pre_closure";
  return "open";
}

function lastCloseBefore(candles: Candle[], ts: number): number | null {
  let found: Candle | undefined;
  for (const c of candles) if (c.t < ts && (!found || c.t > found.t)) found = c;
  return found ? found.close : null;
}

/** Reads the live facts for one loan and works out loan health, the projection, the price trust and the smallest plan. */
export async function assessLoan(ports: Ports, cache: ProfileCache, loan: LoanRecord, settings: UserSettings, closure: MarketClosure | null): Promise<Assessment> {
  const nowMs = ports.nowMs();
  const phase = phaseFor(nowMs, closure);
  const problems: string[] = [];
  const instrument = `${loan.backingCoin} / ${loan.loanCoin}`;
  const base: Assessment = {
    loan, instrument, nowMs, phase, closure, limits: null, symbol: null, price: null, lastClose: null, healthNow: null, trust: null,
    risk: null, projection: null, plan: null, problems, idle: { borrowed: null, backing: null }, moveSinceClose: null, dataFresh: false,
  };

  const limits = await ports.limits(loan.backingCoin);
  if (!limits) {
    problems.push("Bitget does not list limits for this backing right now.");
    return base;
  }
  base.limits = limits;
  const symbol = await ports.market.symbolFor(loan.backingCoin);
  if (!symbol) {
    problems.push("No market was found for this backing token.");
    return base;
  }
  base.symbol = symbol;

  let snapshot: PriceSnapshot;
  let mid: number;
  try {
    const [quote, lastTradeMs, book, profile] = await Promise.all([
      ports.market.quote(symbol), ports.market.lastTradeMs(symbol), ports.market.book(symbol, SCHEDULE.bookLevels), cache.get(symbol),
    ]);
    base.risk = profile.risk;
    mid = (quote.bid + quote.ask) / 2;
    base.price = mid;
    base.dataFresh = (nowMs - quote.snapshotMs) / 1000 <= SCHEDULE.maxDataAgeSeconds;
    const closeRef = closure && nowMs >= closure.closeTs ? closure.closeTs : nowMs;
    base.lastClose = lastCloseBefore(profile.candles, closeRef);
    base.moveSinceClose = base.lastClose ? mid / base.lastClose - 1 : null;
    snapshot = {
      nowMs, lastTradeMs, bid: quote.bid, ask: quote.ask, bids: book.bids, asks: book.asks, lastClose: base.lastClose,
      backingValue: loan.backingAmount * mid, historyMaxAbsMove: profile.risk?.maxAbsMove ?? null,
    };
  } catch (e) {
    problems.push(`Price data could not be read right now (${e instanceof Error ? e.message : "unknown reason"}).`);
    return base;
  }
  if (!base.dataFresh) problems.push("Price data is too old to act on.");

  const trust = priceTrust(snapshot, DEFAULT_TRUST_THRESHOLDS);
  base.trust = trust;

  const watch = settings.triggerBufferPoints / PERCENT;
  const position = { debt: loan.debt, backingAmount: loan.backingAmount };
  // Which price Crypto Loans use while the market is closed is not confirmed (docs/VERIFIED.md item 1):
  // show the worse of the live price and the last close.
  const ratios = [mid, base.lastClose].filter((p): p is number => p !== null && p > 0).map((p) => loanHealth(position, p, limits, watch));
  base.healthNow = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a));

  const balances = await ports.idleBalances(loan.orderId);
  if (balances.byCoin === null) problems.push(balances.problem ?? "Balances could not be read.");
  else base.idle = { borrowed: balances.byCoin[loan.loanCoin] ?? 0, backing: balances.byCoin[loan.backingCoin] ?? 0 };

  if (base.lastClose === null) {
    problems.push("The last close is not available yet for this token.");
    return base;
  }
  const projection = projectAtReopen({
    position, limits, watchBuffer: watch, lastClose: base.lastClose, livePrice: mid, priceTrusted: trust.trusted,
    tradesOnWeekends: phase === "open" ? true : (base.risk?.tradesOnWeekends ?? false), risk: base.risk,
    planningPercentile: PLANNING_PERCENTILES.likely,
  });
  base.projection = projection;
  if (!projection.health || projection.price === null) return base;

  if (projection.health.ratio >= limits.marginCall - watch) {
    base.plan = sizeAction({
      position, limits, price: projection.price, targetBufferRatio: settings.targetBufferPoints / PERCENT, allowed: settings.allowed,
      idleBorrowed: base.idle.borrowed ?? 0, idleBacking: base.idle.backing ?? 0, maxPerAction: settings.maxPerAction ?? 0,
    });
  }
  return base;
}
