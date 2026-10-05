import type { LoanLimits, LoanPosition } from "./types";

export type LoanStatus = "safe" | "watch" | "margin_call" | "liquidation";

export interface LoanHealth {
  /** Debt divided by backing value. This is the "loan health" number. */
  ratio: number;
  /** Margin-call ratio minus current ratio. Negative once past it. */
  distanceToMarginCall: number;
  /** Liquidation ratio minus current ratio. Negative once past it. */
  distanceToLiquidation: number;
  /** How far the backing price can fall before the margin-call level. 0 when already past it. */
  priceDropToMarginCall: number;
  /** How far the backing price can fall before the liquidation level. 0 when already past it. */
  priceDropToLiquidation: number;
  status: LoanStatus;
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive number`);
}

/** Loan health for a position at a given backing price, against Bitget's own limits. */
export function loanHealth(
  position: LoanPosition,
  price: number,
  limits: LoanLimits,
  watchBuffer: number,
): LoanHealth {
  assertPositive("price", price);
  assertPositive("backingAmount", position.backingAmount);
  if (!Number.isFinite(position.debt) || position.debt < 0) throw new RangeError("debt must be zero or more");
  if (!(limits.marginCall < limits.liquidation)) throw new RangeError("margin-call level must be below liquidation level");

  const backingValue = position.backingAmount * price;
  const ratio = position.debt / backingValue;
  const drop = (level: number): number => (ratio <= 0 ? 1 : Math.max(0, 1 - ratio / level));

  let status: LoanStatus = "safe";
  if (ratio >= limits.liquidation) status = "liquidation";
  else if (ratio >= limits.marginCall) status = "margin_call";
  else if (ratio >= limits.marginCall - watchBuffer) status = "watch";

  return {
    ratio,
    distanceToMarginCall: limits.marginCall - ratio,
    distanceToLiquidation: limits.liquidation - ratio,
    priceDropToMarginCall: drop(limits.marginCall),
    priceDropToLiquidation: drop(limits.liquidation),
    status,
  };
}

/** The price Crypto Loans value the backing at. Which one applies is VERIFY item 1; both are supported. */
export function valuationPrice(basis: "live" | "last_close", livePrice: number, lastClose: number): number {
  return basis === "live" ? livePrice : lastClose;
}
