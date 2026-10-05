/**
 * Scenario settings for the history replay. These are simulation inputs chosen for the test, not market data
 * and not shipped to users. Every result built from them is labelled "simulated".
 */
export const SCENARIO = {
  /** Loan-to-value at the moment the simulated loan is opened (at each closure's start). */
  startLtvs: [0.65, 0.7, 0.74],
  /** Backing value of each simulated loan in USDT. Results are reported as a share of the debt as well. */
  backingValueUsdt: 10_000,
  /** Idle USDT the simulated user holds, as a share of the loan's debt. The main run uses the middle value. */
  idleFractions: [0.1, 0.25, 1],
  mainIdleFraction: 0.25,
  /** The most recent period reported separately as the out-of-sample test. */
  outOfSampleDays: 42,
  /** Start of the history pulled (a little before the first closure the stored calendar covers). */
  historyFrom: "2025-12-29T00:00:00Z",
  /** Rule grid searched on the earlier period only. */
  planningPercentiles: [95, 99],
  triggerBufferPoints: [0, 3, 5, 10],
} as const;
