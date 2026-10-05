// The only place for constants (AGENTS.md section 0.1). Each one says what it is and where it comes from.

/** Bitget public REST base URL. Source: https://www.bitget.com/api-doc/common/intro */
export const BITGET_BASE_URL = "https://api.bitget.com";

/** Bitget endpoint paths used by Morrow. Source: AGENTS.md section 3, confirmed in docs/VERIFIED.md. */
export const BITGET_PATHS = {
  loanCoins: "/api/v3/loan/coins",
  instruments: "/api/v3/market/instruments",
  tickers: "/api/v2/spot/market/tickers",
  historyCandles: "/api/v2/spot/market/history-candles",
  candles: "/api/v2/spot/market/candles",
  orderBook: "/api/v2/spot/market/orderbook",
  announcements: "/api/v2/public/annoucements", // Bitget's own spelling
} as const;

/** Unit conversions: true constants. */
export const MS_PER_SECOND = 1000;
export const SECONDS_PER_HOUR = 3600;
export const MS_PER_HOUR = SECONDS_PER_HOUR * MS_PER_SECOND;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Candle size used for reopen history. Source: Bitget candle granularity "1h" (AGENTS.md section 3). */
export const HISTORY_GRANULARITY = "1h";

/** Percent-to-ratio divisor: true constant. */
export const PERCENT = 100;

/**
 * Planning percentiles for the reopen drop (AGENTS.md section 4: "95th and 99th percentile drops").
 * These are policy choices from the product brief, not market data.
 */
export const PLANNING_PERCENTILES = { likely: 95, severe: 99 } as const;

/**
 * Default safety buffer below the margin-call level, in loan-health points.
 * Source: AGENTS.md section 4 ("10 points below the margin-call level"). The user can change it in Settings.
 * The margin-call level itself is always read live from Bitget.
 */
export const DEFAULT_TARGET_BUFFER_POINTS = 10;

/**
 * Default price-trust thresholds. Policy values chosen by the product, changeable per deployment.
 * They are not market data: the data they are compared with is always live.
 */
export const DEFAULT_TRUST_THRESHOLDS = {
  /** A last trade older than this many seconds is stale. */
  maxTradeAgeSeconds: 300,
  /** Spread (ask - bid) / mid above this ratio is too wide. */
  maxSpreadRatio: 0.01,
  /** Depth is counted within this ratio of the mid price on each side. */
  depthBandRatio: 0.01,
  /** Depth near the mid must be at least this multiple of the loan's backing value in quote coin. */
  minDepthToBackingRatio: 1,
  /** A move from last close bigger than this multiple of the stock's largest observed reopen gap is not trusted. */
  maxMoveVsHistoryMultiple: 1.5,
} as const;

/** Minimum number of past closures needed before a reopen history is used. Policy value. */
export const MIN_CLOSURES_FOR_HISTORY = 20;

/** Minutes after the US open before a promise is graded. Source: AGENTS.md section 6. */
export const GRADE_DELAY_MINUTES = 30;
