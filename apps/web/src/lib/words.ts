/** The words shown on screen (AGENTS.md section 8). Developer terms never reach the user. */

const TRUST: Record<string, string> = {
  no_price: "no price is available",
  stale_trade: "the last trade is old",
  wide_spread: "the buy and sell prices are far apart",
  thin_book: "there are too few orders near the price",
  far_from_close: "the price is further from the last close than this stock usually moves",
  no_history: "there is not enough history for this stock yet",
};

export function trustReason(failures: string[]): string {
  const first = failures[0];
  return first ? (TRUST[first] ?? "the price could not be checked") : "";
}

export function statusWord(status: string): string {
  switch (status) {
    case "safe":
      return "Safe";
    case "watch":
      return "Getting close";
    case "margin_call":
      return "At the margin-call level";
    case "liquidation":
      return "At the liquidation level";
    default:
      return "Unknown";
  }
}

export function basisWord(basis: string): string {
  switch (basis) {
    case "live_price":
      return "from the live weekend price";
    case "history_case":
      return "from this stock's own history of reopening gaps";
    default:
      return "not available";
  }
}

/** Plain version of an approval or action kind. */
export function kindWord(kind: string): string {
  return kind === "pay_down" ? "Pay down" : kind === "add_backing" ? "Add backing" : kind;
}
