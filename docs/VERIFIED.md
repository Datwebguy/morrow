# Verified facts

Checked on 2026-10-05 (UTC). Every answer has its source. "Unknown" means it could not be confirmed from a public source and is handled in code as unknown, never assumed.

## Live loan parameters (GET https://api.bitget.com/api/v3/loan/coins)

- Backing coins accepted: 257. Stock tokens among them: **185**, all with `isReality: yes` in `GET /api/v3/market/instruments?category=SPOT`.
- Stock tokens in the instruments list overall: 2811 (only 185 are accepted as loan backing).
- Every one of the 185 stock tokens returned the same values on this date: `initRate 0.65`, `supRate 0.75` (margin call), `forceRate 0.91` (liquidation).
- The Bitget help article https://www.bitget.com/support/articles/12560603894535 states 78% / 85% / 91%. That does not match the live API. The live API is the source of truth and the product reads it at run time.
- Borrowable coins: 68 (USDT, USDC, ETH, BTC and others), each with flexible, 7-day and 30-day rates.

## Item 1. Which price Crypto Loans use while the US market is closed

**Unknown.** Bitget states that the collateral index in the Unified Trading Account is held at the previous close on weekends and holidays (https://www.bitget.com/academy/how-bitget-maintains-rtoken-liquidity-outside-us-market-hours-2026-guide). No public page says the same for Crypto Loans. Confirming it needs a real loan read over a closed weekend.
Handling: the core logic and the replay support both cases (live token price, and price held at last close). The replay is run both ways.

## Item 2. Agentic account or main-account key

**Unknown.** The Agentic account guide (https://www.bitget.com/support/articles/12560603894122) does not mention Crypto Loans. The CLI lists the `loan` domain as `private` (needs `BITGET_API_KEY`, `BITGET_SECRET_KEY`, `BITGET_PASSPHRASE`) (https://github.com/Bitget-AI/agent-cli). Needs the owner's key to test.
Handling: Morrow asks for a main-account API key with trade permission and withdrawals disabled, unless a test shows the Agentic account works.

## Item 3. Demo environment and Crypto Loans

**Unknown.** The CLI README says `--paper-trading` applies to write operations across domains and routes to the demo environment with a demo key. It does not say the demo environment holds Crypto Loans. Needs a demo key to test.
Handling: until confirmed, the hackathon log is a shadow ledger: live prices, live loan parameters, `dryRun` previews, every entry labelled "simulated".

## Item 4. Response fields of `borrow-ongoing` and `debts`

**Unknown.** The SDK (`@bitget-ai/bitget-agent-sdk` 3.3.1, `openapi.yaml`) types these responses only as a generic response, with no field list. The online API docs are rendered by script and could not be read. Reading them live needs the owner's key.
Handling: the Bitget layer parses these responses strictly. If a required field is missing it refuses to act and reports why. Loan health is computed from Bitget's own numbers once the fields are known.

## Item 5. Does `revise-pledge` accept other coins

**Unknown.** The request type (`orderId`, `amount`, `pledgeCoin`, `reviseType`) does not say whether `pledgeCoin` must match the loan's current backing coin. Handling: add backing only with the same coin already backing the loan.

## Item 6. Which stock tokens trade on weekends

Bitget says "more than 90 major rTokens support 24/7 trading" and that smaller ones do not (same academy article as item 1). No machine-readable list was found. Stock spot hours are described as 24/5 with limited weekend access (https://www.bitget.com/support/articles/12560603887176).
Observed: of the 185 backing tokens, **68** had hourly candles on a Saturday or Sunday within the last 200 hours; **117** had none (`GET /api/v2/spot/market/history-candles`, run 2026-10-05).
Handling: Morrow detects weekend trading per token from its own recent candles. It never keeps a typed-in list.

## Item 7. Fee on liquidation

**Unknown.** No Bitget page found mentions a liquidation fee for Crypto Loans. Handling: the product states no liquidation cost.

## Write calls (confirmed with `dryRun`, no network, SDK 3.3.1)

- `POST /api/v3/loan/repay` sends `orderId`, `method`, `repayAll`, `amount`. `repayUnlock` defaults to no when omitted.
- `POST /api/v3/loan/revise-pledge` sends `orderId`, `amount`, `pledgeCoin`, `reviseType`.
- The CLI (`bgc loan`) exposes `borrow`, `repay`, `revisePledge` and read actions.

## Does anything block the plan?

No. Repaying with the borrowed coin and adding backing both exist in the official SDK. Items 1, 2, 3, 4 and 5 need the owner's Bitget key to settle; they are built to fail safe until then.
