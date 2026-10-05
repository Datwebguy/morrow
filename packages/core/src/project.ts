import { loanHealth, type LoanHealth } from "./loan";
import type { ReopenRisk } from "./reopen";
import type { LoanLimits, LoanPosition } from "./types";

export type ProjectionBasis = "live_price" | "history_case" | "unavailable";

export interface Projection {
  basis: ProjectionBasis;
  /** Backing price the projection uses. Null when unavailable. */
  price: number | null;
  health: LoanHealth | null;
}

export interface ProjectInput {
  position: LoanPosition;
  limits: LoanLimits;
  watchBuffer: number;
  lastClose: number;
  /** Live weekend price (mid). Only used when `priceTrusted` is true and the token trades on weekends. */
  livePrice: number | null;
  priceTrusted: boolean;
  tradesOnWeekends: boolean;
  risk: ReopenRisk | null;
  /** Which planning percentile to use for the history case, for example the 99. */
  planningPercentile: number;
}

/**
 * Loan health at the reopen (AGENTS.md section 4).
 * Trusted live price (token trades on weekends): use it.
 * Otherwise: the stock's own historical bad case from the last close.
 * No history and no trusted price: unavailable, which blocks any action.
 */
export function projectAtReopen(i: ProjectInput): Projection {
  if (i.tradesOnWeekends && i.priceTrusted && i.livePrice !== null && i.livePrice > 0) {
    return { basis: "live_price", price: i.livePrice, health: loanHealth(i.position, i.livePrice, i.limits, i.watchBuffer) };
  }
  const drop = i.risk?.drops[i.planningPercentile];
  if (i.risk && drop !== undefined && i.lastClose > 0) {
    const price = i.lastClose * (1 - drop);
    return { basis: "history_case", price, health: loanHealth(i.position, price, i.limits, i.watchBuffer) };
  }
  return { basis: "unavailable", price: null, health: null };
}
