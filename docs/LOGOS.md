# Token logos and company names

Every stock token on the site shows its real logo and company name ("rNVDA · Nvidia"). None of it is typed in or kept as a file in the repository. The worker fetches it on a schedule and caches it with its source and the date it was fetched.

## Where each logo comes from, in order

1. **CoinGecko, by contract address.** Bitget's coin list (`GET /api/v2/spot/public/coins`) gives each token's contract address on each chain. The worker matches the chain to a CoinGecko platform and asks `GET /api/v3/coins/{platform}/contract/{address}`. The logo is `image.small` and the company name is the coin's `name` without the "Tokenized Stock (Reality)" suffix.
2. **The company's own website.** When CoinGecko has no entry, the worker asks Wikidata for the company's official website (by its ticker), reads the page's declared icon (apple-touch-icon first, then the largest icon, then `/favicon.ico`) and keeps it. It is used only when the page title or web address clearly names the same company, so a logo from the wrong company is never shown.
3. **Initials.** When neither exists, the site shows a neat initials badge. A logo is never invented.

Check on 5 Oct 2026 against 12 of the 185 tokens: CoinGecko had an entry for all 12. The website route was run for real on Apple, Microsoft and NVIDIA with their ticker and name only.

## Schedule and limits

- CoinGecko's free tier is rate limited, so lookups are 8 seconds apart and a rate-limit answer is waited out for as long as CoinGecko says (60 seconds when it does not say). The first full pass over 185 tokens takes about half an hour.
- A logo is looked up again after 7 days. A token with no logo is retried after 1 day. The worker checks what is due every 10 minutes.
- Images are cached in the worker's database (with their source address and date) and served from it at `GET /public/logo/{coin}`, so the site never depends on CoinGecko being up. Larger images than 500 KB are refused.
- `GET /public/logos` lists every token with its name, source, source address and fetch date, and whether it has an image.

All values live in `packages/config` (`LOGOS`). The code is `apps/worker/src/logos.ts`.

## Credit

Logos and names come from [CoinGecko](https://www.coingecko.com) and from company websites. The footer says so.
