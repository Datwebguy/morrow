export interface TrustThresholds {
  maxTradeAgeSeconds: number;
  maxSpreadRatio: number;
  depthBandRatio: number;
  minDepthToBackingRatio: number;
  maxMoveVsHistoryMultiple: number;
}

export interface BookLevel {
  price: number;
  /** Size in the backing token. */
  size: number;
}

export interface PriceSnapshot {
  nowMs: number;
  lastTradeMs: number | null;
  bid: number | null;
  ask: number | null;
  bids: BookLevel[];
  asks: BookLevel[];
  lastClose: number | null;
  /** Value of the loan's backing in quote coin. Depth is compared to it. */
  backingValue: number;
  /** Largest absolute reopen move seen in the stock's history, or null when unknown. */
  historyMaxAbsMove: number | null;
}

export type TrustFailure = "no_price" | "stale_trade" | "wide_spread" | "thin_book" | "far_from_close" | "no_history";

export interface TrustResult {
  trusted: boolean;
  /** Mid price when both sides exist. */
  mid: number | null;
  failures: TrustFailure[];
}

/**
 * Price trust check (AGENTS.md section 4). Any failed check means "not trusted".
 * Missing data counts as a failure: a price that cannot be checked is never trusted.
 */
export function priceTrust(s: PriceSnapshot, t: TrustThresholds): TrustResult {
  const failures: TrustFailure[] = [];
  if (s.bid === null || s.ask === null || !(s.bid > 0) || !(s.ask > 0) || s.ask < s.bid) {
    return { trusted: false, mid: null, failures: ["no_price"] };
  }
  const mid = (s.bid + s.ask) / 2;

  if (s.lastTradeMs === null || (s.nowMs - s.lastTradeMs) / 1000 > t.maxTradeAgeSeconds) failures.push("stale_trade");

  if ((s.ask - s.bid) / mid > t.maxSpreadRatio) failures.push("wide_spread");

  const band = mid * t.depthBandRatio;
  const bidDepth = s.bids.filter((l) => l.price >= mid - band).reduce((a, l) => a + l.price * l.size, 0);
  const askDepth = s.asks.filter((l) => l.price <= mid + band).reduce((a, l) => a + l.price * l.size, 0);
  if (Math.min(bidDepth, askDepth) < s.backingValue * t.minDepthToBackingRatio) failures.push("thin_book");

  if (s.historyMaxAbsMove === null) {
    failures.push("no_history");
  } else if (s.lastClose === null || !(s.lastClose > 0)) {
    failures.push("far_from_close");
  } else if (Math.abs(mid / s.lastClose - 1) > s.historyMaxAbsMove * t.maxMoveVsHistoryMultiple) {
    failures.push("far_from_close");
  }

  return { trusted: failures.length === 0, mid, failures };
}
