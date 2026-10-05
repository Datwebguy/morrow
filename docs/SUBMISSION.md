# Submission pack (drafts for you to paste into the form)

Deadline: 8 Oct 2026, 23:59 UTC+8. Form: https://forms.gle/GyWZCMCPocgJdJon6

Read "Before you submit" at the bottom first. Some lines below need your input, and they are marked.

---

## Project name

Morrow

## Track and sub-theme

Agentic Trading, Open Theme.

## Project Description

### 1. Thesis

People borrow USDT against their US stock tokens on Bitget so they do not have to sell. The danger is not the price on a Tuesday. It is the weekend. US markets close for weekends and holidays, then reopen at a new price, and a loan close to its margin-call level can cross it at that moment while the owner is asleep. Bitget's own guides warn about this. A forced sale at the worst moment is the thing the borrower was trying to avoid.

Morrow is a protection agent for exactly that gap. It watches each protected loan, projects loan health at the next US reopening, and steps in before the margin call with one of two actions only: pay down part of the loan with the borrowed coin, or add more of the token already backing it. It never sells, never borrows and never withdraws. Those are refused in code before any request is built, and tests prove it.

The idea that makes it trustworthy is the record. Before each closure Morrow writes a promise for each loan and publishes its fingerprint at once. After the reopen it grades itself in public: kept or missed, what it did, what it cost, and what the loan would have looked like with no action. A protection product that cannot be checked is just a claim.

### 2. Target user and value

A long-term holder with 5,000 to 50,000 USDT of US stock tokens on Bitget, who borrowed USDT against them to use the cash without selling, checks the account a few times a week, and does not watch the market on weekends.

The value is simple: wake up on Monday still owning the stocks. The user chooses the mode (Ask me first, or Protect automatically), the limits per action, per weekend and per month, and can Pause all at any moment.

### 3. Validation data and metrics

All figures in this part are **simulated loans on real Bitget prices**. They are not results from real users. Method: `docs/METHOD.md`. Data: `apps/web/public/replay-report.json`, also at https://themorrow.vercel.app/replay-report.json.

Setup: the 185 stock tokens Bitget accepts as loan backing, hourly prices from 1 January 2026 (the first year the official NYSE calendar covers), 40 closures, loans simulated at 65%, 70% and 74% loan health, run both ways for how Crypto Loans might value backing while the US market is closed (live price, and held at the last close). Rules were set on the earlier period only. The most recent six weeks (6 closures) were run once as the out-of-sample test.

Headline (idle balance 25% of the debt, both valuation cases together):

| Period | Loans simulated | Margin calls and liquidations without Morrow | With Morrow | USDT paid down (share of debt) |
|---|---|---|---|---|
| Earlier (14 closures) | 15,102 | 1,251 | 0 | 8.63% |
| Out-of-sample (6 closures) | 6,588 | 754 | 1 | 8.85% |

Read it honestly:

- A simulated loan that starts at 70% or 74% sits at or above Morrow's trigger, so it is paid down at the start of every closure whatever the weekend does. Most of the cost above is that deleveraging.
- The cleaner view of protection against weekend risk alone is the 65% start. Earlier period: 11 margin calls without Morrow, 0 with, at 0.34% of debt, acting on 3.7% of loans. Out-of-sample: 7 without, 1 with, at 0.58% of debt, acting on 6.0% of loans. These rest on few events.
- Stock tokens only began trading through closures recently. In the earlier period none counted as weekend traders, and in the out-of-sample test only 18 simulated loans did. The path that projects from a trusted live weekend price is barely tested by the replay. The live record will test it.
- The replay trust check uses traded volume and move size from hourly candles. The live check also uses spread, depth and last-trade age.
- Interest saved is small (about 935 USDT across the out-of-sample loans) and is not a profit claim.

Worked case: one full closure, with the action log in the required format, is in `docs/closure-dry-run-RARMUSDT-2026-09-28.md` (simulated loan on rARM, real prices, every action a preview). Without action the loan would have reached 75.9% loan health, a margin call. With the simulated pay-down of 896.45 USDT it was 66.2% and the promise was kept.

Trading metrics (paper Sharpe, maximum drawdown, win rate): Morrow's actions are pay-downs and top-ups of an existing loan, not trades, so these do not describe it, and no return series has been invented to fill them. The live record reports promises kept, margin calls avoided, liquidations avoided and cost.

Live record: starts with the first real protected closure. Until then the site shows "Starting", not a number.

### 4. Progress

Built and tested: core logic (loan maths, reopen risk, price trust, sizing, rules), a Bitget layer that refuses forbidden calls, the history replay, a worker (monitoring, sealed promises, grading, Ask me first and Protect automatically, Pause all, Disconnect), the app, the public site and record page. Lint, typecheck, 183 tests and the production build pass. Lighthouse on the home page: 95 mobile and 100 desktop for performance, 100 for accessibility.

Also built, all public with no login:

- **Check my loan** (`/check`): type the stock token, the backing amount and the amount borrowed, and Morrow shows loan health, the distance to the margin-call and liquidation levels, the projected loan health at the next reopen, the price trust result and the smallest suggested action, from live Bitget prices, live loan limits and the stock's own reopening history. It touches no account, asks for no keys and stores nothing. The token picker searches tickers and company names (names come from Nasdaq's official symbol directory, because Bitget's listing has none).
- **Watch a weekend** (`/watch`): press Start and watch Morrow's real check-and-decide cycle handle one real past weekend from real Bitget hourly prices: the promise is sealed, the weekend price moves, Morrow projects the reopen, the AI decides and explains in one line, the action, the reopen, and the grade. The loan is simulated and labelled "Simulated loan, real prices". It opens on the most dramatic real closure in the replay data and any other stock token can be picked.
- **The record** (`/record`) opens on the replay headline, then the sealed promises, with the full decision log to download as CSV or JSON (every row says simulated or live).

Version 1 scope, said plainly: Morrow acts only on the owner's one connected Bitget account. It never collects or stores anyone else's keys. Multi-user protection is the next step and depends on Bitget's Agentic-account OAuth (`docs/VERIFIED.md`, item 2).

The worker is hosted and running in dry-run mode. No real loan has been protected yet. Bitget's demo environment has no Crypto Loans (`docs/VERIFIED.md`, item 3), so the log runs as a **shadow ledger**: simulated loans on the five stock tokens with the most trading (Bitget publishes no "most borrowed" figure), each opened at three points between the live start and margin-call levels, with live prices, live loan limits and previews only. Each closure it opens a fresh set, seals a promise for every loan an hour before the close, projects, decides and grades. Every entry is labelled simulated and never counted in the public totals. Next market closure after the deadline: the first sealed shadow promises appear on Friday 9 October 2026, one hour before the 20:00 UTC close, after the 8 October deadline, so the submission leans on the replay and Watch a weekend. The owner's one real, small loan follows in "Ask me first" mode with dry run on, and nothing goes live until the owner says "go live". Other Bitget facts still need a working key (see `docs/VERIFIED.md`): which price Crypto Loans use while the market is closed, whether an Agentic account can operate loans, and the exact field names of the loan responses.

### 5. Deliverables

- Runnable demo and code: https://github.com/Datwebguy/morrow (MIT)
- Event, decision, action flow: market closure from the NYSE calendar, then live price and history, then price trust check, then projected loan health, then the AI chooses the kind of action, then code sizes it and checks every rule, then dry run or send, then the paper log, then the sealed promise, then the grade 30 minutes after the open.
- Action log in the required format (timestamp, instrument, direction, price, quantity, balance change): `docs/closure-dry-run-RARMUSDT-2026-09-28.md`.
- History replay and its method.
- Public record page and screenshots in `docs/screenshots`.
- Screen recording script: `docs/VIDEO_SCRIPT.md`.

### 6. View on AI trading

AI should judge, and code should enforce. In Morrow the model reads the situation and picks one of four things: do nothing, alert, pay down, or add backing. It never sets an amount. Amounts, limits, forbidden calls, data freshness and price trust are checked in plain code that can be tested. If the model's choice fails a check, it is refused and logged. For money, a risk layer that cannot be talked out of its rules matters more than a clever model. And an agent that grades itself in public each week earns trust the way a person would: by being checkable.

---

## Role of the AI model

**The model:** Google Gemini through its OpenAI-compatible endpoint, set with `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY` (Google's current fast model is `gemini-3.8-flash`). Switching to another provider, Qwen included, means changing only those three variables (`docs/MODELS.md`). The worker reports the model it is running at `/public/health`, and every logged decision records the model that made it. **Before you submit, confirm the name from `/public/health` and the log.** If the key is not set, Morrow runs "rules only" and the log says so, so the form must say that instead.

What the model decides: for a loan that is projected near its margin-call level, one of none, alert, pay down or add backing, and one plain sentence for the user. It is shown the projected loan health, the price trust result, the move since the close, the stock's historical reopening drop, the code's smallest plan, the actions the user allows, and the latest Bitget announcements.

What code enforces, whatever the model says: the amount (smallest plan that reaches the target), the user's limits, the idle balance, that only the same backing token can be added, that repay uses only the borrowed coin, that backing is never removed, that nothing is borrowed or withdrawn, that price data is fresh and trusted, that Pause all is respected, and that Ask me first waits for the user's Approve. A model answer that is unclear becomes an alert, never an action.

## Submission Materials Links

```
Website: https://themorrow.vercel.app
App: https://themorrow.vercel.app/app
Public record: https://themorrow.vercel.app/record
Check my loan (no login): https://themorrow.vercel.app/check
Watch a weekend (no login): https://themorrow.vercel.app/watch
Decision log (CSV): https://worker-production-b8c5.up.railway.app/public/log.csv
Decision log (JSON): https://worker-production-b8c5.up.railway.app/public/log.json
Repository: https://github.com/Datwebguy/morrow
Replay report (data): https://themorrow.vercel.app/replay-report.json
Replay method: https://github.com/Datwebguy/morrow/blob/HEAD/docs/METHOD.md
Action log (one closure, simulated): https://github.com/Datwebguy/morrow/blob/HEAD/docs/closure-dry-run-RARMUSDT-2026-09-28.md
Video: (add the link after you record it from docs/VIDEO_SCRIPT.md)
```

## X post link

(add after you post it; draft in `docs/X_POST.md`)

## Optional

Demo Day and K3 subsidy: your choice. Not filled in.

---

## Before you submit

1. Post the X post. Without it the entry is invalid.
2. Record the video from `docs/VIDEO_SCRIPT.md` and add its link.
3. Check `/public/health` on the worker shows the Gemini model name, and name that model in the form. If it says "rules only", say "rules only".
4. The app behind "Connect Bitget" is the owner's own account only. In the video, show `/check`, `/watch` (press Start), `/record` and the public view at `/app`, and label anything simulated as simulated.
5. If you connect a real loan, run it in Ask me first mode with dry run until you decide to go live, and replace the simulated case with your own.
