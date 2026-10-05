/** One hourly candle. `t` is the candle start in milliseconds. */
export interface Candle {
  /** Traded volume in the backing token, when the source gives it. */
  volume?: number;
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** A market closure: from the last US close to the next US open, in milliseconds. */
export interface Closure {
  closeTs: number;
  reopenTs: number;
}

/** Loan limits as Bitget reports them (ratios, for example a value read from `supRate`). */
export interface LoanLimits {
  /** Where the loan can start (`initRate`). */
  start: number;
  /** Margin-call level (`supRate`). */
  marginCall: number;
  /** Liquidation level (`forceRate`). */
  liquidation: number;
}

/** A loan as read from the user's account. Amounts are in coin units, price is quote per backing unit. */
export interface LoanPosition {
  /** Outstanding debt in the borrowed coin (which is also the quote coin, usually USDT). */
  debt: number;
  /** Amount of the backing token pledged. */
  backingAmount: number;
}

export type ValuationBasis = "live" | "last_close";

export type ActionKind = "pay_down" | "add_backing";
