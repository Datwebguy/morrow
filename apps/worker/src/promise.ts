import { createHash } from "node:crypto";
import { LOAN_SIZE_BANDS } from "@morrow/config";

export interface PromiseBody {
  version: 1;
  loanId: string;
  loanCoin: string;
  backingCoin: string;
  claim: "stays_below_margin_call_at_reopen";
  /** Margin-call level read live from Bitget when sealed. */
  marginCallLevel: number;
  /** Loan health the plan aims to stay under. */
  targetLevel: number;
  /** What Morrow planned if action is needed. */
  plannedAction: { kind: "pay_down" | "add_backing"; amount: number } | null;
  projectedHealth: number | null;
  projectionBasis: string;
  closeTs: number;
  reopenTs: number;
  sealedAt: number;
  /** True if the promise was written after the closure had already started. */
  late: boolean;
  /** Loan as it was before any protective action in the run-up to the closure. Needed to grade later. Never shown publicly. */
  debtAtSeal: number;
  backingAtSeal: number;
}

/** Stable JSON: keys sorted at every level, so the same promise always gives the same fingerprint. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/** The sealed promise: SHA-256 of the canonical body. */
export function seal(body: PromiseBody): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

export function verifySeal(bodyJson: string, fingerprint: string): boolean {
  return createHash("sha256").update(canonicalJson(JSON.parse(bodyJson))).digest("hex") === fingerprint;
}

/** Size band for public pages, so exact balances are never shown. */
export function sizeBand(valueInBorrowed: number): string {
  for (const b of LOAN_SIZE_BANDS) if (valueInBorrowed < b.below) return b.label;
  return LOAN_SIZE_BANDS[LOAN_SIZE_BANDS.length - 1]?.label ?? "";
}
