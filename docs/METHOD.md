# How the history replay works

This page explains, in plain words, how Morrow's proof was produced. Every price in it is a real Bitget price. Every loan in it is **simulated**. Nothing here comes from real users.

## The question

When the US stock market closes for a weekend or a holiday, a stock token can still move, or it can pause and then jump when the market reopens. If a loan backed by that token is close to its margin-call level, the jump can trigger a margin call or a forced sale. The replay asks: across real past closures, how often would that have happened, and how often would Morrow have prevented it, at what cost?

## The data

- **Tokens:** every stock token Bitget accepts as loan backing, read live when the replay runs (`/api/v3/loan/coins` joined with `/api/v3/market/instruments`).
- **Limits:** the margin-call and liquidation levels for each token, read live from the same endpoint. Nothing is typed in.
- **Prices:** Bitget hourly candles (`/api/v2/spot/market/history-candles`), pulled back to the start of the period below.
- **Closures:** built from the official NYSE calendar (holidays, early closes and trading hours), stored in `packages/config/src/nyse-calendar.json` with its source link and fetch date. A closure runs from a trading day's close to the next trading day's open when more than one calendar day sits between them. The stored calendar covers 2026 onward, so the replay starts at 1 January 2026. Earlier holidays are not covered by the official page, so earlier periods are left out rather than guessed.

## The simulated loans

For each token and each closure, three loans are opened at the closure's start, at 65%, 70% and 74% loan health. Each is backed by 10,000 USDT of the token. Results are also shown as a share of the debt, so the loan size does not matter.

## Two ways the loan can be valued

Bitget has not said which price Crypto Loans use while the US market is closed (VERIFY item 1 in `docs/VERIFIED.md`). The replay runs both:

1. **Live price:** the loan is valued at the token's hourly price throughout the closure. A margin call can happen on a Saturday.
2. **Held at the last close:** the loan is valued at the last close until the reopen. The only moment of risk is the reopen price.

## What "without Morrow" and "with Morrow" mean

- **Without Morrow:** the loan is left alone. A margin call is counted if loan health reaches the margin-call level at any checked moment, and a liquidation if it reaches the liquidation level.
- **With Morrow:** every hour of the closure the replay does what the product does, using only what was known at that hour:
  1. It builds the token's reopen history from **earlier closures only** (the move from the last close to the reopen price) and takes the 95th or 99th percentile drop.
  2. If the token traded through earlier closures and the current weekend price passes the trust check, it projects loan health at the reopen from that price. Otherwise it projects from the last close less the historical bad case.
  3. If the projection is within the trigger distance of the margin-call level, it pays down the smallest amount that brings the projection back 10 points below the margin-call level, limited by the idle USDT the simulated user holds.

Only one action is simulated, **pay down with the borrowed coin**. Adding backing is left out because the replay assumes no idle stock tokens, which is the cautious choice.

## The trust check in the replay

The live product also checks the spread and the depth of the order book and the age of the last trade. Those are not available for past hours. The replay uses what the candles can show: the hour must have traded volume, and the move from the last close must stay within a multiple of the largest reopen move seen before. This is weaker than the live check, and the report says so.

## Setting rules, then testing them

- **Earlier period:** closures before the most recent six weeks. The replay searches a small grid (planning percentile 95 or 99, and trigger distance 0, 3, 5 or 10 points) here, and picks the setting that leaves the fewest margin calls and liquidations, breaking near-ties in favour of the least USDT paid down.
- **Out-of-sample test:** the most recent six weeks. The chosen setting is run once on this period and reported separately. It was not used to choose anything.
- Closures with fewer than the minimum number of earlier closures behind them (set in `packages/config`) are left out of both periods, for both cases. Morrow does nothing without history, so counting them would only flatter or punish it for no reason.

## What is reported

For each case: loans simulated, margin calls and liquidations without and with Morrow, USDT paid down, that amount as a share of the debt, and the interest saved. Interest saved is the paid-down amount times Bitget's live USDT hourly rate times the hours left until the reopen. It is small and is not a profit claim. Idle-balance sensitivity (10%, 25% and 100% of the debt) is shown because the real user's idle balance is unknown.

## What this does not show

- It is not a live result. The live record at `/record` starts from the first real week.
- Closure hours and trust are approximated from hourly candles. Real intra-hour moves can be larger.
- The replay window is about nine months. A calmer window flatters any protection and a wilder one flatters it more. The number of closures behind each figure is shown with it.

## Run it

```
npm ci
npm run replay
```

The report is written to `apps/web/public/replay-report.json`. Downloaded history is cached in `scripts/replay/.cache` and is not committed.

## Results of the run on 5 October 2026 (all simulated)

Settings chosen on the earlier period: planning percentile 95, trigger distance 5 points. Main idle balance: 25% of the debt. 185 stock tokens, 40 closures from 1 January 2026, 14 scored closures in the earlier period and 6 in the out-of-sample test.

| Simulated loan starts at | Period | Loans | Margin calls without Morrow | Margin calls with Morrow | Liquidations without / with | USDT paid down (share of debt) |
|---|---|---|---|---|---|---|
| 65% (weekend risk alone) | earlier, valued at the live price | 2,517 | 6 | 0 | 0 / 0 | 0.34% |
| 65% | earlier, held at last close | 2,517 | 5 | 0 | 0 / 0 | 0.34% |
| 65% | out-of-sample, live price | 1,098 | 4 | 1 | 0 / 0 | 0.58% |
| 65% | out-of-sample, held at last close | 1,098 | 3 | 0 | 0 / 0 | 0.58% |
| 70% | earlier, either case | 2,517 | 45 / 42 | 0 | 0 / 0 | 9.86% |
| 70% | out-of-sample, either case | 1,098 | 50 / 45 | 0 | 0 / 0 | 10.09% |
| 74% | earlier, either case | 2,517 | 684 / 467 | 0 | 1 / 0 | 14.73% |
| 74% | out-of-sample, either case | 1,098 | 380 / 270 | 0 | 1 / 0 | 14.93% |

Read this honestly:

- **The 70% and 74% rows are mostly deleveraging.** A loan that starts at or above the trigger is paid down at the start of every closure, so it acts on all of them (2,517 of 2,517) whatever the weekend does. Their cost is the price of holding a loan that close to the margin-call level. The 65% rows show protection against weekend risk alone, and there Morrow acted on 3.7% of loans in the earlier period and 6.0% in the out-of-sample test, using 0.34% and 0.58% of the debt.
- **The 65% rows rest on very few events:** 3 to 6 margin calls without Morrow. One remains with Morrow in the out-of-sample test, in the live-price case.
- **Most of the history is the paused-token case.** Stock tokens only began trading through closures recently. In the earlier period no token counted as a weekend trader, and in the out-of-sample test only 18 simulated loans did. The path that projects from a live weekend price is therefore barely tested by this replay. The live record will test it.
- **Interest saved is small** (for example about 935 USDT across 6,588 out-of-sample loans, with 4.06 million USDT paid down). It is not a profit claim.
- **Idle balance matters.** With only 10% of the debt idle, some margin calls remain after Morrow acts: in the earlier period 4 of the 70% loans and 20 of the 74% loans (both valuation cases together), and in the out-of-sample test 4 and 10. None remain for the 65% loans in the earlier period, and 1 does in the out-of-sample test (`replay-report.json`).
