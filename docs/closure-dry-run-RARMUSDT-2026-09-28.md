# Dry-run log of one closure (simulated)

**Everything below is simulated.** Prices are real Bitget hourly prices for RARMUSDT. The loan is not real: it is declared here, and every action is a dry run (nothing was sent to Bitget).

- Closure: 2026-09-25T20:00:00Z to 2026-09-28T13:30:00Z (2026-09-25 close, 2026-09-28 reopen)
- Simulated loan: 10000 USDT of rARM backing, starting at 70% loan health at the close, idle USDT 25% of the debt
- Live limits read from Bitget: margin-call level 75%, liquidation level 91%
- Decision maker: rules only (no model configured). Limits set for the run: up to 10000 USDT per action and weekend
- Price trust in this run uses proxies from the hourly candle, because past spreads and order books are not available: spread = the hour's high-low range, depth = the hour's traded value, last trade = the end of the last hour with volume.

## Paper log (timestamp, instrument, direction, price, quantity, balance change)

| Time (UTC) | Instrument | Direction | Price | Quantity | Balance change | Label |
|---|---|---|---|---|---|---|
| 2026-09-25T18:00:00Z | rARM / USDT | pay down | 315.51 | 896.445377 | -896.445377 USDT | simulated |

## Everything Morrow did, in order

- 2026-09-25T18:00:00Z [action] Pay down 896.45 USDT. Loan health is projected too close to the margin-call level. Projected loan health at reopen 74.5% (margin-call level 75.0%).
- 2026-09-25T18:30:00Z [check] Safe. Projected loan health at reopen 65.0% (margin-call level 75.0%).
- 2026-09-25T19:00:00Z [promise] Promise sealed.
- 2026-09-25T19:30:00Z [check] Safe. Projected loan health at reopen 65.0% (margin-call level 75.0%). (same result at every check until 2026-09-25T23:30:00Z)
- 2026-09-26T00:00:00Z [check] Safe. Projected loan health at reopen 66.1% (margin-call level 75.0%). (same result at every check until 2026-09-28T13:00:00Z)
- 2026-09-28T13:30:00Z [check] Safe. Projected loan health at reopen 67.9% (margin-call level 75.0%).
- 2026-09-28T14:00:00Z [grade] Promise kept: loan health stayed below the margin-call level.
- 2026-09-28T14:30:00Z [check] Safe. Projected loan health at reopen 67.9% (margin-call level 75.0%).

## Sealed promise

- Fingerprint `ceed95a3b69fe2a680bfc0e90dfa740577a462bc0f2afe38a48ff36609ba7b0a`, sealed 2026-09-25T19:00:00Z, projected loan health 65.0% (history_case)
- Grade at 2026-09-28T14:00:00Z: **kept**. Price used 286.075. Loan health 66.2%; with no action it would have been 75.9% (a margin call). Paid down 896.45 USDT (simulated).
