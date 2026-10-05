import type { Closure } from "./types";

/** The parts of a stored market calendar the logic needs. */
export interface CalendarInput {
  timezone: string;
  years: number[];
  holidays: Array<{ date: string }>;
  earlyCloses: Array<{ date: string }>;
  coreOpen: string;
  coreClose: string;
  earlyCloseTime: string;
}

const DAY_MS = 86_400_000; // one day in ms: a true constant

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Milliseconds since the epoch for a wall-clock time in a named time zone. */
export function zonedTimeToUtcMs(date: string, hhmm: string, timeZone: string): number {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(":").map(Number) as [number, number];
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const offsetAt = (utc: number): number => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(Number(p["year"]), Number(p["month"]) - 1, Number(p["day"]), Number(p["hour"]), Number(p["minute"]));
    return asUtc - utc;
  };
  let utc = wanted - offsetAt(wanted);
  utc = wanted - offsetAt(utc);
  return utc;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export interface MarketClosure extends Closure {
  /** Date of the last trading day before the closure. */
  closeDate: string;
  /** Date of the next trading day. */
  reopenDate: string;
  /** True when the closure starts at an early close. */
  earlyClose: boolean;
}

/**
 * Closures (weekends, holidays, early closes before them) between two moments.
 * A closure is the time from a trading day's close to the next trading day's open, when more than one
 * calendar day sits between them. Throws if the stored calendar does not cover the years asked for.
 */
export function buildClosures(cal: CalendarInput, fromMs: number, toMs: number): MarketClosure[] {
  const covered = new Set(cal.years);
  const yearOf = (ms: number): number => new Date(ms).getUTCFullYear();
  for (let y = yearOf(fromMs); y <= yearOf(toMs); y++) {
    if (!covered.has(y)) throw new RangeError(`The stored market calendar does not cover ${y}`);
  }
  const holidays = new Set(cal.holidays.map((h) => h.date));
  const early = new Set(cal.earlyCloses.map((e) => e.date));
  const isTradingDay = (date: string): boolean => {
    const w = weekday(date);
    return w !== 0 && w !== 6 && !holidays.has(date);
  };

  const out: MarketClosure[] = [];
  const first = new Date(fromMs - DAY_MS * 7);
  let date = `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(first.getUTCDate())}`;
  const last = new Date(toMs + DAY_MS * 7);
  const end = `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`;
  for (; date <= end; date = addDays(date, 1)) {
    if (!isTradingDay(date)) continue;
    let next = addDays(date, 1);
    while (!isTradingDay(next)) next = addDays(next, 1);
    if (next === addDays(date, 1)) continue; // the next day is a trading day: no closure
    const isEarly = early.has(date);
    const closeTs = zonedTimeToUtcMs(date, isEarly ? cal.earlyCloseTime : cal.coreClose, cal.timezone);
    const reopenTs = zonedTimeToUtcMs(next, cal.coreOpen, cal.timezone);
    if (reopenTs < fromMs || closeTs > toMs) continue;
    out.push({ closeTs, reopenTs, closeDate: date, reopenDate: next, earlyClose: isEarly });
  }
  return out;
}

/** The closure that contains `nowMs`, or the next one that starts after it. */
export function currentOrNextClosure(cal: CalendarInput, nowMs: number): MarketClosure | null {
  const closures = buildClosures(cal, nowMs - DAY_MS * 8, nowMs + DAY_MS * 14);
  return closures.find((c) => c.reopenTs > nowMs) ?? null;
}
