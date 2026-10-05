/** Number and time formatting. Every number shown goes through here. */

export function percent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function points(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)} pts`;
}

export function amount(n: number, coin: string, digits = 2): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${coin}`;
}

const MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** "2d 4h", "3h 12m", "4m 05s", "now". */
export function countdown(ms: number): string {
  if (ms <= 0) return "now";
  const d = Math.floor(ms / MS.d);
  const h = Math.floor((ms % MS.d) / MS.h);
  const m = Math.floor((ms % MS.h) / MS.m);
  const s = Math.floor((ms % MS.m) / MS.s);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";
}

export function dateOnly(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "5 minutes ago" for activity lists. */
export function ago(nowMs: number, thenMs: number): string {
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}
