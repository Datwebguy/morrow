import { CHECK_MY_LOAN, NYSE_CALENDAR, PLANNING_PERCENTILES } from "@morrow/config";
import { currentOrNextClosure, type MarketClosure } from "@morrow/core";
import { assessLoan, type Assessment, type ProfileCache } from "./assess";
import { DEFAULT_SETTINGS } from "./settings";
import type { Ports } from "./ports";

/** What a visitor types. Nothing else is asked, and none of it is stored or logged. */
export interface CheckInput {
  backingCoin: string;
  backingAmount: number;
  debt: number;
}

/** A plain-words problem with what the visitor typed. */
export class CheckError extends Error {}

function amount(v: unknown, name: string): number {
  const n = typeof v === "string" ? Number(v.trim().replace(/,/g, "")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) throw new CheckError(`${name} must be a number above zero.`);
  if (n > CHECK_MY_LOAN.maxAmount) throw new CheckError(`${name} is too large. Check for a typing slip.`);
  return n;
}

export function parseCheckInput(body: Record<string, unknown>): CheckInput {
  const coin = body["token"];
  if (typeof coin !== "string" || !/^[A-Za-z0-9]{2,20}$/.test(coin.trim())) throw new CheckError("Choose the stock token that backs your loan.");
  return { backingCoin: coin.trim(), backingAmount: amount(body["backingAmount"], "Backing amount"), debt: amount(body["borrowed"], `Amount borrowed (${CHECK_MY_LOAN.loanCoin})`) };
}

export interface CheckResult {
  asOf: number;
  token: string;
  loanCoin: string;
  phase: Assessment["phase"];
  closure: { closeTs: number; reopenTs: number } | null;
  /** Live price used (mid of bid and ask) and the last close, with the move since. */
  price: number | null;
  lastClose: number | null;
  moveSinceClose: number | null;
  health: {
    ratio: number; status: string; distanceToMarginCall: number; distanceToLiquidation: number;
    priceDropToMarginCall: number; marginCallLevel: number; liquidationLevel: number; startLevel: number;
  } | null;
  projection: { ratio: number; status: string; basis: string; price: number | null } | null;
  /** How this stock has gapped at past reopens (from Bitget's own hourly history). Null when there is too little history. */
  history: { closures: number; likelyDrop: number; severeDrop: number; likelyPercentile: number; severePercentile: number; tradesOnWeekends: boolean } | null;
  trust: { trusted: boolean; failures: string[] } | null;
  /** The smallest action that brings the projection back to the target. Amounts assume the visitor has the balance to do it. */
  suggestion: { payDown: number; addBacking: number; ratioAfter: number; targetRatio: number } | null;
  problems: string[];
}

/**
 * Loan health, distances, the projection at the next reopen and the suggested action, from the visitor's three numbers
 * and live Bitget data. It touches no account and writes nothing.
 */
export async function checkLoan(ports: Ports, cache: ProfileCache, input: CheckInput): Promise<CheckResult> {
  const loanCoin = CHECK_MY_LOAN.loanCoin;
  const unlimited = Number.POSITIVE_INFINITY;
  // The suggestion shows what is needed, so no idle balance or limit is assumed to cap it.
  const open: Ports = { ...ports, idleBalances: async () => ({ byCoin: { [loanCoin]: unlimited, [input.backingCoin]: unlimited } }) };
  const settings = { ...DEFAULT_SETTINGS, mode: "ask" as const, maxPerAction: unlimited, maxPerWeekend: unlimited, maxPerMonth: unlimited };
  let closure: MarketClosure | null = null;
  try {
    closure = currentOrNextClosure(NYSE_CALENDAR, ports.nowMs());
  } catch {
    closure = null;
  }
  const a = await assessLoan(open, cache, { orderId: "check", loanCoin, backingCoin: input.backingCoin, debt: input.debt, backingAmount: input.backingAmount }, settings, closure);
  const plan = a.plan?.needed && (a.plan.payDown > 0 || a.plan.addBacking > 0) ? a.plan : null;
  const likely = a.risk?.drops[PLANNING_PERCENTILES.likely];
  const severe = a.risk?.drops[PLANNING_PERCENTILES.severe];
  return {
    asOf: a.nowMs, token: input.backingCoin, loanCoin, phase: a.phase, closure: closure ? { closeTs: closure.closeTs, reopenTs: closure.reopenTs } : null,
    price: a.price, lastClose: a.lastClose, moveSinceClose: a.moveSinceClose,
    health: a.healthNow && a.limits ? {
      ratio: a.healthNow.ratio, status: a.healthNow.status, distanceToMarginCall: a.healthNow.distanceToMarginCall,
      distanceToLiquidation: a.healthNow.distanceToLiquidation, priceDropToMarginCall: a.healthNow.priceDropToMarginCall,
      marginCallLevel: a.limits.marginCall, liquidationLevel: a.limits.liquidation, startLevel: a.limits.start,
    } : null,
    projection: a.projection?.health ? { ratio: a.projection.health.ratio, status: a.projection.health.status, basis: a.projection.basis, price: a.projection.price } : null,
    history: a.risk && likely !== undefined && severe !== undefined
      ? { closures: a.risk.sample, likelyDrop: likely, severeDrop: severe, likelyPercentile: PLANNING_PERCENTILES.likely, severePercentile: PLANNING_PERCENTILES.severe, tradesOnWeekends: a.risk.tradesOnWeekends }
      : null,
    trust: a.trust ? { trusted: a.trust.trusted, failures: a.trust.failures } : null,
    suggestion: plan ? { payDown: plan.payDown, addBacking: plan.addBacking, ratioAfter: plan.ratioAfter, targetRatio: plan.targetRatio } : null,
    problems: a.problems,
  };
}

/** Fixed-window counter per visitor address. Holds addresses and counts only, never loan figures. */
export class RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();
  constructor(private readonly perMinute: number, private readonly now: () => number = Date.now) {}

  allow(key: string): boolean {
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || t - h.windowStart >= 60_000) {
      this.hits.set(key, { windowStart: t, count: 1 });
      if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (t - v.windowStart >= 60_000) this.hits.delete(k);
      return true;
    }
    h.count += 1;
    return h.count <= this.perMinute;
  }
}
