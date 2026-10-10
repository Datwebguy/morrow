# Morrow

<p align="center">
  <strong>Protect the position. Keep the upside.</strong>
</p>

<p align="center">
  Morrow monitors Bitget stock-token loans through market closures and helps reduce margin-call risk before the market reopens.
</p>

<p align="center">
  <a href="https://themorrow.vercel.app"><img src="https://img.shields.io/badge/Live%20app-2F5BFF?style=flat-square&logo=vercel&logoColor=white" alt="Live app"></a>
  <img src="https://img.shields.io/badge/TypeScript-0E1116?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Next.js-0E1116?style=flat-square&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/License-MIT-8A5A0B?style=flat-square" alt="MIT License">
</p>

> Borrow against your stock tokens without leaving the position unwatched through the weekend.

## Overview

Morrow is a risk-monitoring and protection service for Bitget Crypto Loans backed by stock tokens.

It watches loan health, checks the quality of available market data, projects conditions at the next US market reopening, and prepares a constrained response when a position approaches its configured safety level.

Morrow supports two protective actions:

- **Pay down** part of the loan using the borrowed coin.
- **Add backing** using more of the same token already backing the loan.

Morrow does **not** sell backing, borrow additional funds, withdraw funds, or remove backing. Those operations are blocked by the application rules before a request can be created.

## Product surfaces

| Surface | Purpose |
| --- | --- |
| [Website](https://themorrow.vercel.app) | Product overview and live market context |
| [Check my loan](https://themorrow.vercel.app/check) | Review loan health using live Bitget data without connecting an account |
| [Watch a weekend](https://themorrow.vercel.app/watch) | Follow a replay of the monitoring flow across a real market closure |
| [Public record](https://themorrow.vercel.app/record) | Review sealed promises, grades, and published decision history |
| `/app` | Private account view for connected users |

## How it works

1. **Read live conditions**  
   Morrow reads loan parameters, balances, prices, order-book conditions, and market-calendar data from their respective sources.

2. **Check data quality**  
   Stale trades, wide spreads, insufficient depth, or unusual price moves are treated as untrusted. Untrusted data cannot authorize an action.

3. **Project the reopening**  
   The service estimates how the next market reopening could affect loan health using current conditions and the token's own reopening history where enough history exists.

4. **Build the smallest safe plan**  
   Deterministic code calculates the minimum pay-down or backing addition required to return the position to its configured target, subject to user limits and available balances.

5. **Request or execute within policy**  
   Users may require approval before an action or allow protected actions to proceed automatically. Pausing protection stops action processing immediately.

6. **Record the result**  
   Each decision includes its inputs, data-trust status, reason, selected action, result, and receipt information. Closure promises are sealed before the event and graded after reopening.

## Safety boundary

The decision layer is advisory. It cannot override the safety layer.

Application code independently enforces:

- live loan limits and market data;
- stale-data and price-trust checks;
- configured targets and spending limits;
- available balances;
- allowed action types;
- pause and approval settings;
- same-token backing requirements;
- no-borrow, no-withdraw, no-sell, and no-backing-removal rules.

If data is missing, stale, ambiguous, or unavailable, Morrow alerts or waits. It does not guess and it does not act.

## Real data and replay data

The public product distinguishes between live and simulated information.

- **Live data** comes from Bitget, the connected account, and the official NYSE market calendar.
- **Replay data** uses real historical Bitget prices with hypothetical loans to evaluate the rules.
- **Shadow-ledger data** is a dry-run representation used when live loan operations are unavailable. It is not a real account action.

Replay and shadow-ledger results are labelled as simulated wherever they are shown. They are not claims about customer performance or investment returns.

## Architecture

```text
apps/web       Next.js website, public tools, account interface, and record pages
apps/worker    Monitoring scheduler, HTTP API, decisions, approvals, and action records
packages/core  Loan calculations, reopening risk, data trust, sizing, and safety rules
packages/bitget Typed Bitget integration with write-operation safeguards
packages/config Shared endpoints, schedules, calendars, and product configuration
scripts/replay Historical market replay and report generation
docs/          Product method, risks, verification notes, and operating documentation
```

The repository is an npm workspace. The web application and worker are separate runtime components:

- The **web application** is deployed as a Next.js project.
- The **worker** runs as a separate long-lived service and exposes the account API and public record endpoints.

## Requirements

- Node.js **22.13 or newer**
- npm
- A Bitget account and appropriately restricted API credentials for connected-account operation
- A persistent database path for the worker

Never commit credentials. Store deployment secrets in the hosting provider's encrypted environment-variable settings.

## Local development

Install dependencies:

```bash
npm ci
```

Run validation:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run the web application locally:

```bash
NEXT_PUBLIC_WORKER_URL=http://localhost:8787 npm run build --workspace apps/web
npm run start --workspace apps/web
```

Run the worker locally:

```bash
APP_TOKEN=<long-random-secret> DATABASE_PATH=morrow.db npm start
```

Generate the historical replay report:

```bash
npm run replay
```

## Configuration

The example file lists supported variable names without values:

```text
.env.example
```

Common worker settings include:

| Variable | Purpose |
| --- | --- |
| `APP_TOKEN` | Protects private worker routes |
| `APP_ORIGIN` | Allowed web-app origin for private requests |
| `DATABASE_PATH` | Primary worker database path |
| `SHADOW_DATABASE_PATH` | Optional separate shadow-ledger database path |
| `BITGET_API_KEY` | Bitget account credential, stored only on the worker |
| `BITGET_SECRET_KEY` | Bitget account credential, stored only on the worker |
| `BITGET_PASSPHRASE` | Bitget account credential, stored only on the worker |
| `NEXT_PUBLIC_WORKER_URL` | Web application's worker URL |
| `NEXT_PUBLIC_SITE_URL` | Canonical public site URL |
| `MORROW_LIVE_ACTIONS` | Set to `go-live` only after reviewing the deployment and safety settings |

Keep withdrawals disabled on any Bitget credential used by the worker. Start with dry-run operation and approval-required settings while validating a deployment.

## Deployment notes

For the Next.js project, configure the hosting platform to use:

- Node.js 22.x;
- `npm ci` as the install command;
- `npm run build --workspace apps/web` as the build command;
- `apps/web` as the application workspace or the repository root, depending on the hosting configuration;
- `NEXT_PUBLIC_WORKER_URL` pointing to the deployed worker;
- `NEXT_PUBLIC_SITE_URL` pointing to the public web domain.

The worker should run separately as a persistent service with its own database and server-side credentials. Do not place Bitget credentials or `APP_TOKEN` in any `NEXT_PUBLIC_*` variable.

## Testing and quality

The test suite covers the core calculations, reopening projections, data-trust checks, action sizing, request validation, public endpoints, decision records, and forbidden operation safeguards.

Before merging changes, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Risk disclosure

Morrow is a protection tool, not a guarantee. Market conditions can change quickly, exchange services can become unavailable, liquidity can disappear, and an action may fail or arrive too late. Users remain responsible for their account, credentials, limits, and decisions about whether to enable protection.

Review the product risk notes in [`docs/RISKS.md`](docs/RISKS.md) before connecting an account or enabling live actions.

## Documentation

- [Method](docs/METHOD.md)
- [Risks](docs/RISKS.md)
- [FAQ](docs/FAQ.md)
- [Verification notes](docs/VERIFIED.md)
- [Closure replay](docs/closure-dry-run-RARMUSDT-2026-09-28.md)

## Security

Please report security vulnerabilities privately through [GitHub Security Advisories](https://github.com/Datwebguy/morrow/security/advisories/new). Do not publish sensitive security details in a public issue.

## License

Morrow is released under the [MIT License](LICENSE).
