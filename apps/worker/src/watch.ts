import { createHash } from "node:crypto";
import { MorrowBitget, READ_OPERATIONS, type PayDownRequest, type WriteResult, type AddBackingRequest } from "@morrow/bitget";
import { CHECK_MY_LOAN, FEATURED_CLOSURE, GRADE_DELAY_MINUTES, MIN_CLOSURES_FOR_HISTORY, MS_PER_HOUR, NYSE_CALENDAR, PERCENT, SCHEDULE, SIMULATION, WATCH_A_WEEKEND, WEEKEND_TRADING_MIN_COVERAGE } from "@morrow/config";
import { buildClosures, reopenGaps, type Candle, type LoanLimits, type MarketClosure } from "@morrow/core";
import type { Advisor } from "./advisor";
import { ProfileCache } from "./assess";
import { runCycle } from "./cycle";
import { Store, type StoredLog } from "./db";
import type { Grade } from "./grade";
import type { LoanRecord, Ports } from "./ports";
import type { PromiseBody } from "./promise";
import { updateSettings } from "./settings";

/**
 * "Watch a weekend": Morrow's real check-and-decide cycle, run over one real past closure from Bitget's real hourly prices.
 * The loan is simulated and says so. Order-book depth, spread and last-trade age do not exist for past hours, so the price
 * trust check uses the hour's candle as a proxy (range, traded value, hour end) and the result says so.
 */
export const WATCH_LABEL = "Simulated loan, real prices";

export class WatchError extends Error {}

export interface WatchInput {
  backingCoin: string;
  /** The visitor's own numbers from "Check my loan". Absent: the standard simulated loan. */
  yours?: { backingAmount: number; debt: number };
  /** A specific closure by its close time. Absent: the biggest real gap down for this token. */
  closeTs?: number;
}

export interface WatchStep {
  id: "seal" | "weekend" | "project" | "decide" | "act" | "reopen" | "grade";
  /** When it happened in the replay, UTC milliseconds. */
  at: number;
  title: string;
  /** One or two plain sentences. */
  line: string;
  facts: Array<{ label: string; value: string }>;
}

export interface WatchResult {
  label: typeof WATCH_LABEL;
  token: string;
  symbol: string;
  closure: { closeTs: number; reopenTs: number; closeDate: string; reopenDate: string };
  /** What the token did over this closure from its last close to its reopen price. */
  reopenMove: number;
  loan: { backingAmount: number; backingValue: number; debt: number; startHealth: number; idleBorrowed: number; basis: "standard" | "yours" };
  limits: { marginCall: number; liquidation: number };
  decidedBy: string;
  /** Real hourly prices around the closure, for the chart. */
  prices: Array<{ t: number; price: number }>;
  steps: WatchStep[];
  outcome: { kept: boolean | null; healthWithMorrow: number | null; healthWithoutMorrow: number | null; marginCallWithoutMorrow: boolean | null; paidDown: number };
  /** True for any step that rests on a stand-in (past order books do not exist). */
  notes: string[];
}

const pct = (x: number, d = 1): string => `${(x * PERCENT).toFixed(d)}%`;
const usdt = (n: number): string => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
const when = (ms: number): string =>
  new Date(ms).toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";

/** The closures that are over and have a graded price available. */
function finishedClosures(nowMs: number): MarketClosure[] {
  const start = Date.parse(`${Math.min(...NYSE_CALENDAR.years)}-01-01T00:00:00Z`);
  const graceMs = (GRADE_DELAY_MINUTES * 60_000) + 2 * MS_PER_HOUR;
  return buildClosures(NYSE_CALENDAR, start, nowMs).filter((c) => c.reopenTs + graceMs <= nowMs);
}

/** Picks the closure: the featured one when it is for this token, else the biggest real gap down with enough earlier history. */
export function pickClosure(candles: Candle[], closures: MarketClosure[], coin: string, closeTs?: number): MarketClosure | null {
  if (closeTs !== undefined) return closures.find((c) => c.closeTs === closeTs) ?? null;
  const gaps = reopenGaps(candles, closures, { hourMs: MS_PER_HOUR, minCoverage: WEEKEND_TRADING_MIN_COVERAGE });
  const f = FEATURED_CLOSURE.featured;
  if (f && f.coin.toUpperCase() === coin.toUpperCase()) {
    const hit = closures.find((c) => c.closeTs === f.closeTs);
    if (hit) return hit;
  }
  let best: { move: number; closeTs: number } | null = null;
  gaps.forEach((g, i) => {
    if (i < MIN_CLOSURES_FOR_HISTORY) return;
    if (best === null || g.move < best.move) best = { move: g.move, closeTs: g.closeTs };
  });
  const chosen = best as { move: number; closeTs: number } | null;
  return chosen ? closures.find((c) => c.closeTs === chosen.closeTs) ?? null : null;
}

interface Clock {
  now: number;
}

/** Previews only. Each previewed action is applied to the simulated loan at once, as a real one would be, so the grade in the same check sees it. */
class PastExec extends MorrowBitget {
  constructor(private readonly apply: (kind: "pay_down" | "add_backing", amount: number) => void) {
    super({
      async call(operationId) {
        // A simulated loan has no liquidation or account records. Writes are never sent.
        if ((READ_OPERATIONS as readonly string[]).includes(operationId)) return { code: "00000", data: [] };
        throw new Error("Watch a weekend never sends anything.");
      },
    });
  }

  override async payDown(req: PayDownRequest): Promise<WriteResult> {
    const r = await super.payDown(req, { dryRun: true });
    this.apply("pay_down", Number(req.amount));
    return r;
  }

  override async addBacking(req: AddBackingRequest): Promise<WriteResult> {
    const r = await super.addBacking(req, { dryRun: true });
    this.apply("add_backing", Number(req.amount));
    return r;
  }
}

/** Ports whose clock, prices and loan are those of a past closure. Nothing here can reach an account. */
function pastPorts(base: Ports, o: { coin: string; symbol: string; limits: LoanLimits; candles: Candle[]; clock: Clock; loan: () => LoanRecord; idle: () => number; apply: (kind: "pay_down" | "add_backing", amount: number) => void }): Ports {
  const visible = (): Candle[] =>
    o.candles.filter((c) => c.t <= o.clock.now).map((c) => (c.t + MS_PER_HOUR > o.clock.now ? { ...c, high: c.open, low: c.open, close: c.open } : c)); // the hour in progress: only its open is known
  const completed = (): Candle[] => o.candles.filter((c) => c.t + MS_PER_HOUR <= o.clock.now);
  return {
    ...base,
    nowMs: () => o.clock.now,
    simulated: true,
    async loans() {
      return { loans: [o.loan()], problems: [] };
    },
    async idleBalances() {
      return { byCoin: { [CHECK_MY_LOAN.loanCoin]: o.idle(), [o.coin]: 0 } };
    },
    async limits() {
      return o.limits;
    },
    market: {
      async symbolFor() {
        return o.symbol;
      },
      async quote(s) {
        const c = completed().at(-1);
        if (!c) throw new Error("no completed candle yet");
        const half = (c.high - c.low) / 2;
        return { symbol: s, last: c.close, bid: c.close - half, ask: c.close + half, snapshotMs: c.t + MS_PER_HOUR };
      },
      async lastTradeMs() {
        const c = [...completed()].reverse().find((x) => (x.volume ?? 0) > 0);
        return c ? c.t + MS_PER_HOUR : null;
      },
      async book() {
        const c = completed().at(-1);
        const mid = c?.close ?? 0;
        const traded = c ? c.close * (c.volume ?? 0) : 0;
        return { bids: [{ price: mid, size: traded / 2 / (mid || 1) }], asks: [{ price: mid, size: traded / 2 / (mid || 1) }], ts: o.clock.now };
      },
      async history(_s, from, to) {
        return visible().filter((c) => c.t >= from && c.t <= to);
      },
    },
    async announcements() {
      return []; // Bitget's past announcements are not replayed
    },
    exec: new PastExec(o.apply),
    async notify() {},
  };
}

export async function watchWeekend(base: Ports, advisor: Advisor, input: WatchInput): Promise<WatchResult> {
  const nowMs = base.nowMs();
  const coin = input.backingCoin;
  const [symbol, limits] = await Promise.all([base.market.symbolFor(coin), base.limits(coin)]);
  if (!symbol || !limits) throw new WatchError("Bitget does not list that token as loan backing right now.");
  const calendarStart = Date.parse(`${Math.min(...NYSE_CALENDAR.years)}-01-01T00:00:00Z`);
  const closures = finishedClosures(nowMs);
  const candles = await base.market.history(symbol, calendarStart - 7 * 24 * MS_PER_HOUR, nowMs);
  const closure = pickClosure(candles, closures, coin, input.closeTs);
  if (!closure) throw new WatchError("There is not enough price history for this token yet to replay a weekend.");

  const before = [...candles].reverse().find((c) => c.t < closure.closeTs);
  const after = candles.find((c) => c.t >= closure.reopenTs);
  if (!before || !after || !(before.close > 0) || !(after.open > 0)) throw new WatchError("Bitget has no prices on both sides of that weekend for this token.");

  // The simulated loan: standard (10,000 USDT of backing, halfway between the live start and margin-call levels), or the visitor's own
  // size and loan health today, placed on that weekend.
  let backingValue: number = SIMULATION.backingValueUsdt;
  let startHealth = limits.start + SIMULATION.watchStartPosition * (limits.marginCall - limits.start);
  let debt = startHealth * backingValue;
  let basis: "standard" | "yours" = "standard";
  if (input.yours) {
    const q = await base.market.quote(symbol);
    const healthNow = input.yours.debt / (input.yours.backingAmount * ((q.bid + q.ask) / 2));
    if (!(healthNow > 0) || healthNow >= limits.liquidation) throw new WatchError("Your loan is already at the liquidation level, so there is nothing to replay. Add backing or pay down first.");
    startHealth = healthNow;
    debt = input.yours.debt;
    backingValue = debt / healthNow;
    basis = "yours";
  }
  const backingAmount = backingValue / before.close;
  const idle0 = SIMULATION.idleShareOfDebt * debt;
  const debt0 = debt;
  startHealth = debt0 / (backingAmount * before.close);

  const clock: Clock = { now: closure.closeTs - SCHEDULE.promiseLeadMinutes * 60_000 }; // the first check is the one that seals the promise, as it is live
  const state = { debt, idle: idle0 };
  const orderId = "WATCH-1";
  const loan = (): LoanRecord => ({ orderId, loanCoin: CHECK_MY_LOAN.loanCoin, backingCoin: coin, debt: state.debt, backingAmount });
  const apply = (kind: "pay_down" | "add_backing", amount: number): void => {
    if (!Number.isFinite(amount)) return;
    if (kind === "pay_down") {
      state.debt -= amount;
      state.idle -= amount;
    }
  };
  const ports = pastPorts(base, { coin, symbol, limits, candles, clock, loan, idle: () => state.idle, apply });
  const store = new Store(":memory:");
  updateSettings(store, { protectedLoans: [orderId], mode: "auto", maxPerAction: backingValue, maxPerWeekend: backingValue, maxPerMonth: backingValue * 4 });
  const deps = { store, ports, advisor, liveActions: false, cache: new ProfileCache(ports) };

  const end = closure.reopenTs + (GRADE_DELAY_MINUTES + 30) * 60_000;
  for (; clock.now <= end; clock.now += WATCH_A_WEEKEND.stepMinutes * 60_000) await runCycle(deps);

  const logs = store.allLog();
  const promise = store.allPromises()[0];
  const body = promise ? (JSON.parse(promise.body) as PromiseBody) : null;
  const grade = promise?.grade ? (JSON.parse(promise.grade) as Grade) : null;
  const actions = logs.filter((l) => l.kind === "action");
  const paidDown = actions.reduce((s, a) => s + (a.quantity ?? 0), 0);
  const inClosure = candles.filter((c) => c.t >= closure.closeTs && c.t < closure.reopenTs && (c.volume === undefined || c.volume > 0));
  const around = candles.filter((c) => c.t >= closure.closeTs - WATCH_A_WEEKEND.chartHoursAround * MS_PER_HOUR && c.t <= closure.reopenTs + WATCH_A_WEEKEND.chartHoursAround * MS_PER_HOUR);
  const decisionLogs = logs.filter((l) => l.kind === "action" || l.kind === "approval" || l.kind === "alert" || l.kind === "refused");
  const firstDecision: StoredLog | undefined = decisionLogs[0] ?? logs.find((l) => l.kind === "check");
  const decided = (firstDecision?.detail as { choice?: { by?: string; reason?: string } | null; decision?: { choice?: { by?: string; reason?: string } | null } } | undefined);
  const choice = decided?.decision?.choice ?? decided?.choice ?? null;
  const decidedBy = choice?.by ?? "rules only";
  const lastProjection = [...logs].reverse().find((l) => l.ts < closure.reopenTs && (l.detail as { projection?: { health?: unknown } | null })?.projection?.health);
  const proj = (lastProjection?.detail as { projection?: { health: { ratio: number }; basis: string; price: number } } | undefined)?.projection ?? null;
  const healthWithoutAtOpen = debt0 / (backingAmount * after.open);
  const healthWithAtOpen = state.debt / (backingAmount * after.open);
  const reopenMove = after.open / before.close - 1;

  const steps: WatchStep[] = [];
  if (body && promise) {
    steps.push({
      id: "seal", at: promise.createdAt, title: "The promise is sealed",
      line: `Before the market closes, Morrow writes down what it will protect and publishes the fingerprint, so it cannot be changed later.`,
      facts: [
        { label: "Loan", value: `${usdt(debt0)} borrowed against ${backingAmount.toFixed(4)} ${coin}` },
        { label: "Loan health at the close", value: pct(startHealth) },
        { label: "Margin-call level", value: pct(limits.marginCall) },
        { label: "Promise", value: `Stay below ${pct(limits.marginCall)} when the market reopens` },
        { label: "Sealed promise", value: `${promise.fingerprint.slice(0, 16)}…` },
      ],
    });
  }
  steps.push({
    id: "weekend", at: closure.closeTs, title: "The weekend price moves",
    line: inClosure.length > 0
      ? `${coin} kept trading while the US market was shut. Morrow watches its price every check.`
      : `${coin} pauses while the US market is shut, so there is no weekend price. Morrow plans from this stock's own history of reopening gaps.`,
    facts: inClosure.length > 0
      ? [
          { label: "Last close", value: `${before.close.toFixed(2)} USDT` },
          { label: "Lowest weekend price", value: `${Math.min(...inClosure.map((c) => c.low)).toFixed(2)} USDT` },
          { label: "Hours with trades", value: `${inClosure.length}` },
        ]
      : [{ label: "Last close", value: `${before.close.toFixed(2)} USDT` }, { label: "Weekend market", value: "Paused" }],
  });
  steps.push({
    id: "project", at: lastProjection?.ts ?? closure.closeTs, title: "Morrow projects the reopen",
    line: proj
      ? `Morrow works out what loan health will be when the market reopens, ${proj.basis === "live_price" ? "from the live weekend price" : "from this stock's own history of reopening gaps"}.`
      : "Morrow could not project the reopen from the data it had, so it does not act.",
    facts: proj
      ? [
          { label: "Projected loan health", value: pct(proj.health.ratio) },
          { label: "Projected price", value: `${proj.price.toFixed(2)} USDT` },
          { label: "Margin-call level", value: pct(limits.marginCall) },
        ]
      : [],
  });
  steps.push({
    id: "decide", at: firstDecision?.ts ?? closure.closeTs, title: "The AI decides",
    line: choice?.reason ?? firstDecision?.reason ?? "No action was needed.",
    facts: [{ label: "Decided by", value: decidedBy }, { label: "Code checks", value: "Amount, limits and every rule are checked in code before anything is sent" }],
  });
  steps.push({
    id: "act", at: actions[0]?.ts ?? closure.closeTs, title: actions.length > 0 ? "Morrow acts" : "No action",
    line: actions.length > 0
      ? `Morrow pays down ${usdt(paidDown)} of the loan with idle USDT. It never sells your stock.`
      : "Loan health stayed far enough from the margin-call level, so Morrow did nothing.",
    facts: actions.length > 0
      ? actions.map((a) => ({ label: when(a.ts), value: `Pay down ${usdt(a.quantity ?? 0)} at ${a.price?.toFixed(2) ?? "n/a"} USDT (simulated)` }))
      : [],
  });
  steps.push({
    id: "reopen", at: closure.reopenTs, title: "Monday: the market reopens",
    line: `${coin} reopens ${reopenMove >= 0 ? "up" : "down"} ${pct(Math.abs(reopenMove))} from Friday's close.`,
    facts: [
      { label: "Reopen price", value: `${after.open.toFixed(2)} USDT` },
      { label: "Loan health with no action", value: pct(healthWithoutAtOpen) },
      { label: "Loan health with Morrow", value: pct(healthWithAtOpen) },
    ],
  });
  if (grade) {
    steps.push({
      id: "grade", at: grade.gradedAt, title: grade.kept ? "Graded: promise kept" : "Graded: promise missed",
      line: grade.kept
        ? grade.wouldHaveHadMarginCall
          ? "Thirty minutes after the open, the loan is below the margin-call level. Without Morrow it would have been a margin call."
          : "Thirty minutes after the open, the loan is below the margin-call level."
        : "Thirty minutes after the open, the loan was at the margin-call level or beyond.",
      facts: [
        { label: "Price used", value: `${grade.priceUsed?.toFixed(2) ?? "n/a"} USDT` },
        { label: "Loan health now", value: grade.healthAtGrade === null ? "n/a" : pct(grade.healthAtGrade) },
        { label: "With no action", value: grade.healthWithNoAction === null ? "n/a" : pct(grade.healthWithNoAction) },
        { label: "Cost", value: usdt(paidDown) },
      ],
    });
  }

  const noteList = ["Order-book depth, spread and last-trade age do not exist for past hours, so the price check uses each hour's candle instead."];
  if (basis === "yours") noteList.push("Your loan's size and loan health today are placed on that weekend.");
  return {
    label: WATCH_LABEL, token: coin, symbol,
    closure: { closeTs: closure.closeTs, reopenTs: closure.reopenTs, closeDate: closure.closeDate, reopenDate: closure.reopenDate },
    reopenMove,
    loan: { backingAmount, backingValue, debt: debt0, startHealth, idleBorrowed: idle0, basis },
    limits: { marginCall: limits.marginCall, liquidation: limits.liquidation },
    decidedBy,
    prices: around.map((c) => ({ t: c.t, price: c.open })),
    steps,
    outcome: {
      kept: grade?.kept ?? null, healthWithMorrow: grade?.healthAtGrade ?? null, healthWithoutMorrow: grade?.healthWithNoAction ?? null,
      marginCallWithoutMorrow: grade?.wouldHaveHadMarginCall ?? null, paidDown,
    },
    notes: noteList,
  };
}

/** A short key for the in-memory cache of finished replays. */
export function watchKey(input: WatchInput): string {
  return createHash("sha256").update(JSON.stringify([input.backingCoin.toUpperCase(), input.yours ?? null, input.closeTs ?? null])).digest("hex");
}
