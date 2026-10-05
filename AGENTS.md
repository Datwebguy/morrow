# AGENTS.md

The operating manual for any coding agent working on this product. Follow it exactly. If something here is unclear, stop and ask. Do not guess on anything that touches money.

> **Name:** the product is called **Morrow**. Always written with a capital M in text and lowercase in the logo wordmark (`morrow`). Tagline: **"Borrow today. Still yours tomorrow."**

---

## 0. Ground rules (read first, never break)

1. **The owner is the only author.**
   - No AI names anywhere: no `Co-Authored-By` lines, no "Generated with" footers, no AI attribution in commits, pull requests, README, package.json, code comments, docs, metadata or the website.
   - Commit as the repository owner only.
2. **This product is our own work.**
   - Do not mention, credit, compare against or link to any other hackathon project, team or repository anywhere in the repo, the app, the docs or the submission.
   - Write every design, name and sentence fresh.
3. **Real data only. Never hardcoded, never fake.** Morrow is a real product used with real money. Read §0.1 below. Breaking it is a failed task.
4. **No developer wording on screen.** Use the words in §8.
5. **Nothing may break the build.**
   - Every change ships with tests.
   - Lint, typecheck, unit tests and the production build must all pass before any commit.
   - Never claim something works without running it.
6. **No secrets in the repo.**
   - `.env.example` holds variable names only.
   - Keys are never logged or printed.
7. **Verify before you build.** Anything marked **VERIFY** in this file must be confirmed against Bitget's live docs or API first, and the result written into `docs/VERIFIED.md` with the source link and date.

---

## 0.1 Real data only (the most important rule)

Morrow is a real, live product, not a mock-up. Every number, name, price, rate, list and date a user sees, and every number the product acts on, must come from a real, live source at the moment it is used.

**Never hardcode data:**
- No hardcoded prices, loan limits (65%, 75%, 91% or any other), interest rates, fees, token lists, collateral lists, balances, dates, market hours or holiday dates in code or UI.
- Read them live:
  - **Loan limits and rates:** `GET /api/v3/loan/coins`.
  - **Token list:** `GET /api/v3/market/instruments`.
  - **Prices and order books:** Bitget market endpoints.
  - **The user's loans and balances:** the user's own Bitget account.
  - **Market hours and holidays:** the NYSE official calendar.
- The only constants allowed are true constants (for example, seconds in an hour) and configuration such as API base URLs. They live only in `packages/config`, each with a comment saying what it is and where it comes from.
- If a value must be stored (for example, the holiday calendar), store it with its source link and the date fetched, and re-check it on a schedule. Never type a value in by hand.

**Never fake data:**
- No mock, sample, dummy, demo, placeholder, lorem ipsum, example or "seed" data anywhere the user can see it: not in the UI, the database, seed scripts, screenshots, the video, the README or the submission.
- No invented users, loans, balances, trades, promises, grades, testimonials, statistics or chart lines.
- Marketing numbers on the website (promises kept, margin calls avoided and so on) come only from the live record. Until real data exists, show "Starting", never a made-up number.
- The live price line on the website uses real Bitget prices. If they fail to load, show a still line, never a drawn or random one.
- Test fixtures exist only inside test folders, are clearly named as test fixtures, and never ship to production.
- The one exception is the history replay (§7). It runs hypothetical loans over **real** Bitget price history to test the rules. Its prices are always real. Its loans are labelled "simulated" on every page, chart and number where they appear, and are never shown as real users or real results.

**When data is missing:**
- Say so honestly ("No loans yet. Connect Bitget to start." or "Price not available right now.") and offer the next action.
- Never fill the gap with a guess, a default number or a cached value shown as live. A cached value must be labelled with its time.
- Never act on missing, stale or untrusted data. Do nothing and tell the user.

**How this is enforced (build it in step 2 and keep it on):**
- A check in `npm run lint` that fails the build if the words `mock`, `fake`, `dummy`, `lorem`, `sample data`, `seed data` or `placeholder data` appear (any letter case) in shipped code under `apps/` or `packages/`. Test folders are excluded. The HTML `placeholder` attribute on form fields is allowed, because it is input hint text, not data.
- A check that fails if loan limits or prices appear as numeric literals in `apps/` or `packages/` outside `packages/config`.
- Every value shown on screen is traceable to its source. The proof page and the record show the source and time for each number.
- Before every commit, search the diff for hardcoded numbers and fake data, and report what you found.

---

## 1. The product

**One line:** you borrow against your US stocks on Bitget, and Morrow makes sure you still own them on Monday.

**The problem (checked on 5 Oct 2026, sources in §10):**
- **Borrowing against stocks:** Bitget lets people pledge stock tokens (rTokens) as collateral for crypto loans. The live API lists **185 stock tokens** accepted as loan collateral.
- **Loan limits:** on 5 Oct 2026 every stock token showed the same limits in the live API: start at **65%** loan-to-value, **margin call at 75%**, **forced liquidation at 91%**. These are written here only to explain the problem. They change. The product always reads them live (§0.1) and never hardcodes them.
- **Weekend gaps:** the US market closes on weekends and holidays. Some stock tokens keep trading on Bitget during that time and some pause (Bitget lists which ones). When the US market reopens, prices can gap. Bitget's own guides warn that a gap-down after a weekend or holiday can push a loan into a margin call or liquidation.
- **Nobody is watching:** borrowers are long-term holders. They are asleep or offline when this happens. Liquidation sells their stock at the worst moment.

**What Morrow does:**
1. **Watches every loan, all the time.** It tracks loan-to-value, the distance to margin call and the distance to liquidation.
2. **Sees Monday coming.** During weekends and holidays it reads the stock token's weekend price, where that token trades on weekends, and works out what the loan will look like when the US market reopens. Where a token does not trade on weekends, it plans from that stock's own history of reopening gaps.
3. **Checks the price is trustworthy first.** If the weekend market is too thin, too stale or too far from normal, it does not act on that price. It tells the user and keeps watching.
4. **Acts before it is too late,** only with the two actions the user allowed, inside the user's limits:
   - **Repay part of the loan** with the user's idle balance of the borrowed coin (usually USDT).
   - **Add collateral** from the user's idle balance of the same stock token already backing the loan (VERIFY item 5 in §3 before allowing any other coin).
5. **Makes a weekly promise and keeps score.**
   - **Before each weekend or holiday:** it writes a promise for each protected loan ("this loan will stay below the margin-call level when the market reopens"), timestamps it and publishes its fingerprint.
   - **After the reopen:** it grades the promise in public: kept or missed, what it did, what it cost and what it saved.
6. **Explains everything in one short line.** There is no undo: paying down cannot be reversed without borrowing, and taking backing out is forbidden. That is why "Ask me first" mode exists (§5).

**Who it is for (the hackathon form rejects "all traders"):** a long-term holder with 5,000 to 50,000 USDT of US stock tokens on Bitget, who borrowed USDT against them to use the cash without selling, checks the account a few times a week and does not watch the market on weekends.

**How it makes money:**
- A small monthly subscription per protected loan.
- Later: a protection service other apps and wallets can plug into.

**The pitch (use this wording in the website, X post and form):**
> Morrow keeps your stocks yours. Borrow against them on Bitget, sleep through the weekend, and wake up still owning them. It sees Monday coming, steps in before a margin call, and shows its record in public every week.

---

## 2. Version 1 scope (keep it tight)

**In scope:**
- Bitget Crypto Loans with stock-token collateral.
- Two actions only: partial repay with the borrowed coin, and add more of the same collateral.
- Weekend and US holiday windows, plus continuous monitoring on weekdays.
- Weekly promise and grade, published on a public page.
- Alerts in the app and by Telegram (optional, the user opts in).

**Out of scope for version 1:** trading-account margin, hedging with perpetuals, dividends, borrowing, and any action that adds risk. Do not build these. Leave clean extension points only.

---

## 3. Bitget tools (verified on 5 Oct 2026)

**Official toolkit:**
- Bitget Agent Hub: https://github.com/BitgetLimited/agent_hub
- MCP server: https://github.com/Bitget-AI/agent-mcp. npm `@bitget-ai/bitget-agent-mcp` (3.3.1). Load the loan module with `--modules account,trade,market,cryptoloans`.
- CLI: https://github.com/Bitget-AI/agent-cli. npm `@bitget-ai/bitget-agent-cli` (3.0.0). Command `bgc`, with a `loan` domain. Run `bgc discover` for the exact options. Do not guess flags.
- SDK: npm `@bitget-ai/bitget-agent-sdk` (3.3.1). Use this from server code.
- Research skills (no key needed): https://github.com/Bitget-AI/bitget-signal
- API docs: https://www.bitget.com/api-doc/uta/intro and https://www.bitget.com/api-doc/common/intro
- Agentic account (isolated sub-account, OAuth, no withdrawals): https://www.bitget.com/support/articles/12560603894122
- Safe modes: `--read-only` (no write tools) and `--paper-trading` (Bitget demo environment, separate Demo API key). Every write can be previewed with `dryRun`.

**Crypto Loans operations (confirmed in the official SDK, module `cryptoloans`):**

| Operation | Method and path | Type | Use |
|---|---|---|---|
| getLoanCoins | GET `/api/v3/loan/coins` | read (also answers without a key) | Loan coins, rates, and per-collateral `initRate`, `supRate` (margin call), `forceRate` (liquidation) |
| getBorrowOngoing | GET `/api/v3/loan/borrow-ongoing` | read | The user's open loans |
| getLoanDebts | GET `/api/v3/loan/debts` | read | Outstanding debt |
| getPledgeRateHistory | GET `/api/v3/loan/pledge-rate-history` | read | History of collateral changes |
| getLoanReduces | GET `/api/v3/loan/reduces` | read | Liquidation records (status COMPLETE or WAIT) |
| getRepayHistory | GET `/api/v3/loan/repay-history` | read | Repayments |
| getBorrowHistory | GET `/api/v3/loan/borrow-history` | read | Loans |
| getLoanInterest | GET `/api/v3/loan/interest` | read | Interest quote |
| **repayCoins** | POST `/api/v3/loan/repay` | **write** | Body: `orderId`, `method` (`borrowed_coin` or `collateral`), `repayAll` (`yes`/`no`), `amount`, `repayUnlock` |
| **revisePledge** | POST `/api/v3/loan/revise-pledge` | **write** | Body: `orderId`, `amount`, `pledgeCoin`, `reviseType` (`IN` add, `OUT` remove) |
| borrowCoins | POST `/api/v3/loan/borrow` | write | **Never used by this product** |

**Hard limits on these calls (enforced in code, with tests):**
- **Repay** only with `method=borrowed_coin`. **Never** `method=collateral`, because that sells the user's stock, which is the thing we exist to prevent.
- **Revise pledge** only with `reviseType=IN`, always set explicitly (the field is optional in the API, so never rely on its default). **Never** `OUT`.
- **Never** call `borrowCoins` or `withdraw`. `transfer_funds` is allowed only between the user's own Bitget accounts, and only if VERIFY shows a pay-down needs it.

**VERIFY before building the action layer:**
1. Which price Crypto Loans use to compute loan-to-value during US market closures: the live stock-token price, or a reference held at the last close. Bitget states that the collateral index inside the Unified Trading Account is held at the previous close during weekends and holidays. Confirm whether Crypto Loans do the same. The product must handle both cases correctly.
2. Whether Crypto Loans can be operated from an Agentic account, or need a main-account API key with trade permission and **withdrawals disabled**.
3. Whether Bitget's demo environment supports Crypto Loans. If it does not, the hackathon log runs as a shadow ledger: live prices, live loan parameters and `dryRun` previews, every entry clearly labelled "simulated". If the owner chooses, it can also run on one small real loan. Never fake a fill.
4. The exact response fields of `borrow-ongoing` and `debts`, so loan-to-value is computed from Bitget's numbers, not ours.
5. Whether `revise-pledge` accepts only the coin already pledged on that loan, or other coins too. Until confirmed, add only the same coin.
6. Which stock tokens trade on weekends and holidays, and where Bitget publishes that list.
7. Whether Crypto Loans charge any fee on liquidation, so the product never states a cost it has not confirmed.

**Public market data (verified, no key):**

| Purpose | Endpoint |
|---|---|
| All stock tokens (`symbolType: stock`, `isReality: yes`) | GET `https://api.bitget.com/api/v3/market/instruments?category=SPOT` |
| Hourly price history (more than a year back for liquid names) | GET `https://api.bitget.com/api/v2/spot/market/history-candles?symbol=RNVDAUSDT&granularity=1h&endTime=<ms>&limit=200` |
| Live tickers, bid and ask | GET `https://api.bitget.com/api/v2/spot/market/tickers` |
| Order book depth | Agent Hub `market` intent (order book) |
| Loan parameters | GET `https://api.bitget.com/api/v3/loan/coins` |
| Bitget announcements | GET `https://api.bitget.com/api/v2/public/annoucements?language=en_US&annType=latest_news` ("annoucements" is Bitget's own spelling; do not correct it) |

**Other data:**
- US market hours, holidays and early closes: NYSE official calendar, https://www.nyse.com/markets/hours-calendars. Store the list with its source.
- Optional free market, news and social data: Chainbase AgentKey, https://agentkey.app (reported as announced by @Bitget_AI on 29 Sep 2026; unconfirmed, check before relying on it).

**Model (AI):**
- Qwen through the hackathon gateway if credits are approved. The base URL `https://hackathon.bitgetops.com/v1` and model `qwen3.8-max` were reported by another builder, not by Bitget. **VERIFY** with the details Bitget sends when credits are approved. Credit form (unconfirmed): https://forms.gle/2QeJpvGB5VpipqQ68
- Otherwise any capable model behind an OpenAI-compatible endpoint, set by environment variable.
- Record which model was used, for the form.

---

## 4. How decisions are made

**The AI judges. Code enforces. Nothing else moves money.**

**Code (deterministic, fully tested):**
- **Loan state:** loan-to-value, distance to margin call, distance to liquidation, using Bitget's own parameters.
- **Reopen risk:** for each stock token, the distribution of moves from the last close to the next open, built from its own hourly history (Friday close to Monday open, and around each US holiday). Use the 95th and 99th percentile drops as the planning cases.
- **Projected loan-to-value at reopen,** from the live weekend price when it is trustworthy, and from the historical bad case when it is not.
- **Price trust check:** last trade age, bid-ask spread, book depth near the mid, and distance from the last close against the stock's history. If any check fails, the price is "not trusted" and is never used to trigger an action.
- **Action sizing:** the smallest repay or collateral top-up that brings the projected loan-to-value back under the user's target, capped by the user's limits and idle balance. The default target is "10 points below the margin-call level", where the margin-call level is read live from Bitget (§0.1).
- **Rule checks:** every hard limit in §3 and §5, run before any write.

**AI (logged, never trusted blindly):**
- Reads the situation (the news over the weekend, the size of the move, whether it looks like real news or noise) and chooses between: do nothing, alert only, repay, or add collateral.
- Writes the one-line explanation the user sees.
- Any AI choice that fails a rule check is refused and logged. The user sees "No action: [reason]".

**Every decision is logged** with the inputs, prices and their trust status, the AI's choice and reason, the rule checks, the order or request IDs, and the result. This log is the hackathon paper log, in the format the form asks for: timestamp, instrument, direction, price, quantity, balance change. For loan actions, record them like this:
- **instrument:** the loan (backing token / borrowed coin, e.g. rNVDA / USDT),
- **direction:** "pay down" or "add backing",
- **price:** the stock token price used,
- **quantity:** the amount paid down or added,
- **balance change:** the change in the borrowed coin or the stock token balance.

---

## 5. User controls

**Set once, change any time:**
- **Mode:** "Protect automatically" or "Ask me first" (sends the proposed action; the user taps Approve).
- **Allowed actions:** repay, add collateral, or both.
- **Target safety level:** how far below the margin-call level to stay.
- **Limits:** maximum USDT per action, per weekend and per month.
- **Alerts:** in app, Telegram.

**Always available:**
- **Pause all:** a kill switch that stops every action instantly.
- **Disconnect:** removes keys and stops everything.

---

## 6. The weekly promise and score

1. **Before each closure** (the US close on Friday, the close before a holiday, or an early close), the product writes one promise per protected loan: the loan, the target, the planned action if needed, and the time.
2. **It publishes the promise's SHA-256 fingerprint** on the public record page at once, so the promise cannot be edited afterwards.
3. **After the reopen** (30 minutes after the US open), it grades each promise:
   - kept or missed,
   - the actions taken and their cost,
   - what the loan-to-value would have been with no action,
   - whether that would have meant a margin call or liquidation.
4. **The public record page** shows every week, newest first, with totals: promises kept, margin calls avoided, liquidations avoided, total cost.

Personal details are never shown. Use loan size bands, not exact balances, unless the owner opts in.

---

## 7. Proof for the submission

1. **History replay.**
   - Using real hourly history for the 185 stock tokens accepted as collateral, simulate loans opened at 65%, 70% and 74% loan-to-value across every weekend and US holiday in the available history.
   - Count margin calls and liquidations at the reopen without the product and with it.
   - Run it both ways for VERIFY item 1 in §3 (loan valued at the live weekend price, and held at the last close), unless that item is already confirmed.
   - Report the USDT used and the interest saved.
   - Use the earlier period to set the rules. Report the most recent 30+ days separately as the out-of-sample test.
   - Label every number observed or simulated.
2. **Live record** from now until submission (§6), with Bitget request or order IDs. If Crypto Loans are not available in demo, follow §3 VERIFY item 3.
3. **One full worked case** shown end to end: the closure, the weekend move, the projected margin call, the action, the reopen and the grade.
4. **Tests:**
   - loan-to-value maths,
   - reopen-risk percentiles,
   - price trust checks,
   - action sizing,
   - every forbidden call (`method=collateral`, `reviseType=OUT`, borrow, withdraw) must be refused,
   - an integration test against the live public endpoints.

---

## 8. Design

**Feeling:** calm, trustworthy, premium. Like a modern private bank, not a crypto casino.

**Fonts (professional, not playful):**
- **Interface and headlines:** Geist Sans (600 to 700 for headlines with slightly tight letter spacing; 400 to 500 for body).
- **Every number:** Geist Mono with tabular figures, so amounts line up and do not jump.
- Load self-hosted (the `geist` package with `next/font`). No other fonts.

**Colour (define as tokens, light and dark themes):**

| Token | Light | Dark | Use |
|---|---|---|---|
| Ink | `#0E1116` | `#F2F4F7` | Main text |
| Canvas | `#F7F8FA` | `#0B0D12` | Page background |
| Surface | `#FFFFFF` | `#141821` | Cards |
| Line | `#E3E6EB` | `#252B36` | Borders |
| Muted | `#5B6472` | `#98A2B3` | Secondary text |
| Safe | `#127A5A` | `#3DD39B` | Safe state, kept promises |
| Watch | `#8A5A0B` | `#F2B84B` | Getting close |
| Danger | `#C2362F` | `#FF6B5F` | Margin call or liquidation risk |
| Accent | `#2F5BFF` | `#6E8BFF` | One accent: buttons, links, focus |

**Rules:**
- One accent per screen area.
- Every text and background pair passes WCAG AA.
- **Banned:** purple-to-blue gradients, glowing orbs, glassmorphism, stock 3D blobs, emoji in headings, neon-on-black, generic icon grids, "Revolutionizing DeFi" copy.
- **Icons:** Lucide only, one stroke width.

**Motion (Motion for React; every animation has a reduced-motion version):**
- **Website background:** a slow, live price line drawn across the hero from real stock-token data. When the US market is closed the line keeps moving (the weekend market), and a soft shield band holds steady at the live margin-call level read from Bitget. No invented data. If data fails to load, show a still line.
- **Headlines:** words rise in one by one on first view (40 ms stagger).
- **Sections:** fade and rise 16 px as they scroll into view.
- **"How it works":** a sticky three-step sequence on scroll. Weekend move → Monday projected → protected.
- **Numbers:** count from the previous value to the new one. Never from zero on refresh.
- **App:** 150 ms crossfades between pages, and a smooth fill on the safety gauge.
- No animation longer than 800 ms (except the background line). Never block input.

**Words to use on screen:**

| Never say | Say |
|---|---|
| LTV, loan-to-value | Loan health |
| forceRate, liquidation threshold | Liquidation level |
| supRate | Margin-call level |
| pledge, collateral | Backing |
| revise pledge IN | Add backing |
| repayCoins | Pay down |
| API key, OAuth | Connect Bitget |
| order id, request id, tx hash | Receipt |
| SHA-256, hash | Sealed promise |
| error codes, stack traces | Plain reason + what to do |

**Text rules:**
- No paragraph longer than two lines on desktop.
- At most one helper line per app screen; explanations go in a small "?" tooltip.
- Every button says what happens: "Connect Bitget", "Protect this loan", "Pay down 200 USDT", "Approve", "Pause all".

---

## 9. Pages

**Website (`/`). Short, beautiful, clear in 10 seconds:**
1. **Hero.** Headline: "Borrow today. Still yours tomorrow." Subline: "Morrow watches your Bitget stock loans and steps in before a margin call." Buttons: **Protect my loan** (to `/app`) and **See the record** (to `/record`). The live price-line background.
2. **Live strip.** Three live numbers from the public record: promises kept, margin calls avoided, liquidations avoided. Show "Starting" instead of a zero.
3. **How it works.** Three short steps on a sticky scroll.
4. **Why it matters.** One line and one real example from the record page, if one exists. Otherwise leave this section out.
5. **Your controls.** Four short cards: you choose the limits, pause any time, it never sells your stocks, it never borrows or withdraws.
6. **FAQ.** Accordion, simple words, one answer open at a time.
7. **Final call.** "Your stocks. Still yours on Monday." Both buttons again.
8. **Footer** (§9 end).

**App (`/app`). It must feel like an app, not a document:**
- **Connect.** One card, "Connect Bitget". Explains in one line that the product can only pay down or add backing, never sell, borrow or withdraw.
- **Home.** One card per loan:
  - a large loan-health gauge,
  - the distance to margin call and to liquidation,
  - the next market closure with a countdown,
  - "Projected at reopen" (with the trust status of the price),
  - the planned action, and a **Protect this loan** toggle.
- **Activity.** Every check and action, newest first. Time, one-line reason, amount, receipt link.
- **Record.** This user's own promises and grades.
- **Settings.** The controls from §5.

**Public record (`/record`).** Every week's sealed promises and grades, with totals and the replay report link.

**States everywhere:**
- Every list has an honest empty state with a next action.
- Skeleton loading in the shape of the content.
- Errors in plain words with the next step.
- Every action has four designed states: idle, pending ("Confirm" → "Working"), success with receipt, and error with the next step.

**Footer:**
- Logo and the one-line pitch.
- **Product:** Protect, Record, Pricing.
- **Learn:** How it works, FAQ, Risks.
- **Build:** GitHub, Bitget docs.
- **Bottom row:** "Built on Bitget", the year, and one short risk line ("Protection reduces risk. It cannot remove it.").

**Logo and favicon:**
- **Logo:** a wordmark in Geist Sans 600 beside a monogram: a heavy M cut by a thin horizontal gap (the weekend gap the product protects against), with the two feet below the gap stepping sideways and landing in the accent colour.
- **Exports:** mark only, mark with wordmark, single colour, and a 1024 px app icon.
- **Favicon:** `favicon.svg`, `favicon.ico` (16/32), `apple-touch-icon.png` (180), `icon-512.png`. The mark must stay readable at 16 px.

**Quality bar:**
- Lighthouse 90+ for performance and accessibility on the website.
- Works at 360 px wide with no sideways scrolling.
- Full keyboard use with a visible focus ring.

---

## 10. Sources (5 Oct 2026; items marked unconfirmed came from outside research and must be checked)

**Hackathon:**
- Landing page: https://www.bitget.com/activity-hub/hackathon
- Handbook (English): https://bitget-ai.gitbook.io/bitgetai_hackathons2/ (markdown: https://bitget-ai.gitbook.io/bitgetai_hackathons2/base-camp-hackathon-s2-en.md)
- Submission form (English): https://forms.gle/GyWZCMCPocgJdJon6. The live form says the deadline is **8 Oct 2026, 23:59 UTC+8**.
- Submission form (Chinese, unconfirmed): https://forms.gle/WxCSbXVEky5Z2oYN8
- Deadline extension announced by @Bitget_AI: https://x.com/Bitget_AI/status/2103047860602495198
- Post that must be quoted in the X post: https://x.com/Bitget_AI/status/2100519318824055159
- Official Telegram: https://t.me/+o1tYqQ_lXxllYjgy (from the handbook). A second link, https://t.me/+vF6Cy5Ud2SM5OTIy, was reported from the launch thread (unconfirmed).
- Qwen credit form (unconfirmed): https://forms.gle/2QeJpvGB5VpipqQ68
- Chainbase AgentKey announcement (unconfirmed): https://x.com/Bitget_AI/status/2104878557940031940

**Bitget product facts:**
- Loan parameters and collateral list (live API, no key): https://api.bitget.com/api/v3/loan/coins
- Official SDK (operations confirmed in package version 3.3.1): https://www.npmjs.com/package/@bitget-ai/bitget-agent-sdk
- Stock tokens as margin and collateral: https://www.bitget.com/academy/how-to-use-bitget-rtoken-as-margin-and-collateral-beginner-guide
- Crypto Loans with stock tokens: https://www.bitget.com/support/articles/12560603894535 and https://www.bitget.com/academy/borrow-with-stocks-as-collateral
- Stock tokens for margin and loans: https://www.bitget.com/academy/how-to-use-rtoken-for-margin-and-loans-on-bitget
- Liquidity outside US hours: https://www.bitget.com/academy/how-bitget-maintains-rtoken-liquidity-outside-us-market-hours-2026-guide
- Stock token FAQ: https://www.bitget.com/academy/bitget-rtoken-faq
- Trading hours, fees and dividends: https://www.bitget.com/support/articles/12560603887176
- Unified Trading Account with stock tokens: https://www.bitget.com/academy/where-to-earn-stock-dividends-while-using-assets-as-crypto-margin-2026-guide

---

## 11. Hackathon submission

**Track:** Agentic Trading → **Open Theme**. The AI senses the situation, decides, and acts with risk controls.

**Scoring:** 50% numbers (paper Sharpe, max drawdown, win rate) and 50% judges (explainability, architecture quality, effectiveness of the risk layer). Because this is a protection product, lead with the replay and the live record: margin calls and liquidations avoided, cost of protection, promises kept. Also report the required trading metrics honestly for the actions taken.

**Required materials:**
- runnable demo,
- event → decision → action flow in the description,
- the action log (timestamp, instrument, direction, price, quantity, balance change),
- compliant X post.

**Form fields to draft for the owner:**
1. **Project Description**, in six parts:
   1. thesis (weighted most),
   2. target user and value (the user in §1),
   3. validation data and metrics (§7),
   4. progress,
   5. deliverables,
   6. view on AI trading.
2. **Role of the AI model:** which model, and exactly what it decides versus what code enforces.
3. **Submission Materials Link:** one labelled link per line (website, app, record, repo, replay report, log, video).
4. **X post link.**
5. **Track and sub-theme.**
6. **Optional:** Demo Day, K3 subsidy.

**X post:**
- Include `#BitgetHackathon` and `@Bitget_AI`.
- Quote and retweet https://x.com/Bitget_AI/status/2100519318824055159.
- Introduce the product in plain words, with one short video or image.
- With no X post, the entry is invalid.

**Demo access:** the website, record page and replay must be public with no login. Anything behind "Connect Bitget" needs a short screen recording.

**Deadline:** 8 Oct 2026, 23:59 UTC+8 (15:59 UTC).

---

## 12. Repository layout

```
apps/web        Next.js (App Router), TypeScript strict. Website at /, app at /app, record at /record
apps/worker     Long-running scheduler: checks, promises, grades, actions
packages/core   Pure logic: loan maths, reopen risk, trust checks, sizing, rule checks (no network)
packages/bitget Thin typed client over @bitget-ai/bitget-agent-sdk with the hard limits from §3
packages/config Network URLs, schedule, holiday list with sources (the only place for constants)
scripts/replay  History replay and report generator
docs/           VERIFIED.md, METHOD.md (replay method), RISKS.md, FAQ.md
```

**Commands** (keep them exact once they exist): `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run replay`.

**Stack:** Next.js, TypeScript, Tailwind with the tokens in §8, Motion, Geist fonts, the official Bitget SDK, a small database for promises and the log (Postgres or SQLite), and a scheduler process for the worker.

---

## 13. Order of work

1. **VERIFY** items in §3. Write `docs/VERIFIED.md`. Stop and report if any answer blocks the plan.
2. `packages/core` with tests (loan maths, reopen risk, trust checks, sizing, rule checks).
3. `packages/bitget` with the hard limits and tests that prove forbidden calls are refused.
4. History replay and report.
5. Worker: monitoring, promises, grading, actions (dry run first, then live under the owner's chosen mode).
6. App screens.
7. Website, FAQ, record page, logo, favicon.
8. README (what it is, who it is for, how to run, proof links, private security contact), the MIT licence, the drafted form text and X post, and the screen recording script.

**After each step, report:** what changed, the test results, and anything uncertain.
