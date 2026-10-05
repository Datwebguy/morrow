# Morrow

**Borrow today. Still yours tomorrow.**

Morrow watches your Bitget stock-token loans and steps in before a margin call, so a weekend or holiday gap does not cost you your stocks.

## Who it is for

A long-term holder with 5,000 to 50,000 USDT of US stock tokens on Bitget, who borrowed USDT against them to use the cash without selling, checks the account a few times a week and does not watch the market on weekends.

## What it does

- Watches every protected loan, more often around a US market closure.
- Projects loan health at the reopen, from a trusted weekend price or from that stock's own history of reopening gaps.
- Checks the price first (last trade age, spread, depth near the price, distance from the last close). A price that fails is never acted on.
- Steps in with two actions only, inside limits you set: pay down with the borrowed coin, or add more of the token already backing the loan.
- Seals a promise before each closure, publishes its fingerprint, and grades it in public after the reopen.

It never sells your stocks, never borrows and never withdraws. Those calls are refused in code before any request is built, and tests prove it (`packages/bitget/test`).

The AI chooses the kind of action. Code sizes it and checks every rule. Nothing else moves money.

## Proof

- Live site: https://themorrow.vercel.app
- Public record: https://themorrow.vercel.app/record
- History replay (real Bitget prices, simulated loans): [docs/METHOD.md](docs/METHOD.md) and `apps/web/public/replay-report.json`
- One full closure, step by step (simulated loan on real prices): [docs/closure-dry-run-RARMUSDT-2026-09-28.md](docs/closure-dry-run-RARMUSDT-2026-09-28.md)
- What was checked against Bitget, with sources and dates: [docs/VERIFIED.md](docs/VERIFIED.md)
- Risks: [docs/RISKS.md](docs/RISKS.md). Questions: [docs/FAQ.md](docs/FAQ.md)

## Run it

Needs Node 22.13 or newer.

```
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Replay (pulls real hourly history from Bitget, then writes `apps/web/public/replay-report.json`):

```
npm run replay
```

Website, app and record page (Next.js):

```
NEXT_PUBLIC_WORKER_URL=http://localhost:8787 npm run build --workspace apps/web
npm run start --workspace apps/web
```

Worker (watches loans, seals and grades promises, serves the record and the app's API):

```
APP_TOKEN=<a long random secret> DATABASE_PATH=morrow.db npm start
```

Without Bitget variables the worker runs, serves an empty public record, and reports "Bitget is not connected". Add `BITGET_API_KEY`, `BITGET_SECRET_KEY` and `BITGET_PASSPHRASE` (a key with trade permission and **withdrawals turned off**) to connect. Every action is a dry run until you set `MORROW_LIVE_ACTIONS=go-live`. See `.env.example` for all variable names.

## Layout

```
apps/web        Website (/), app (/app), public record (/record)
apps/worker     Scheduler: checks, promises, grades, actions, API
packages/core   Pure logic: loan maths, reopen risk, trust checks, sizing, rules
packages/bitget Typed client over the official Bitget SDK with the hard limits
packages/config The only place for constants, and the stored NYSE calendar
scripts/replay  History replay and report
docs/           Verified facts, method, risks, questions, submission pack
```

## Real data only

Prices, limits, rates, token lists, balances and market hours are read live from Bitget, the user's account or the official NYSE calendar. `npm run lint` fails the build if mock-style words or loan-limit numbers appear in shipped code. The history replay uses real prices with simulated loans, and every such number is labelled simulated.

## Security

Report a vulnerability privately through GitHub: https://github.com/Datwebguy/morrow/security/advisories/new

Please do not open a public issue for a security problem.

## Licence

MIT. See [LICENSE](LICENSE).
