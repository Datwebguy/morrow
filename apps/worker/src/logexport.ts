import type { Store, StoredLog } from "./db";

/** One row of the public decision log. No loan or order ids. `mode` is "simulated" or "live" on every row. */
export interface LogRow {
  timestamp: string;
  kind: string;
  instrument: string;
  direction: string;
  price: number | null;
  quantity: number | null;
  balanceChange: string;
  reason: string;
  decidedBy: string;
  mode: "simulated" | "live";
}

function decidedBy(l: StoredLog): string {
  const d = l.detail as { choice?: { by?: string } | null; decision?: { choice?: { by?: string } | null } } | null;
  return d?.decision?.choice?.by ?? d?.choice?.by ?? "";
}

/** Every logged check, decision, action, promise and grade from the given stores, oldest first. */
export function logRows(stores: Store[]): LogRow[] {
  const all = stores.flatMap((s) => s.allLog());
  all.sort((a, b) => a.ts - b.ts);
  return all.map((l) => ({
    timestamp: new Date(l.ts).toISOString(), kind: l.kind, instrument: l.instrument, direction: l.direction, price: l.price, quantity: l.quantity,
    balanceChange: l.balanceChange, reason: l.reason, decidedBy: decidedBy(l), mode: l.simulated ? "simulated" : "live",
  }));
}

const COLUMNS: Array<[keyof LogRow, string]> = [
  ["timestamp", "timestamp"], ["kind", "kind"], ["instrument", "instrument"], ["direction", "direction"], ["price", "price"], ["quantity", "quantity"],
  ["balanceChange", "balance_change"], ["reason", "reason"], ["decidedBy", "decided_by"], ["mode", "mode"],
];

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: LogRow[]): string {
  const head = COLUMNS.map(([, h]) => h).join(",");
  return [head, ...rows.map((r) => COLUMNS.map(([k]) => cell(r[k])).join(","))].join("\n") + "\n";
}
