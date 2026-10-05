# Lighthouse

Home page, run on 2026-10-05 with Lighthouse in headless Chromium. Mobile uses Lighthouse's default mobile profile (slow 4G, 4x slower CPU).

## Live site (https://themorrow.vercel.app), measured from the build sandbox (the same site, before the name changed to themorrow.vercel.app)

- Mobile: performance 89, accessibility 100, best-practices 100, seo 100; FCP 1.9 s, LCP 3.5 s
- Desktop: performance 100, accessibility 100, best-practices 100, seo 100; FCP 0.5 s, LCP 0.5 s

Mobile performance is one point under the 90 target here. The sandbox reaches the internet through a proxy, which slows every request (the same build shows requests arriving 5 to 20 times slower than on a local server), so this number is likely lower than a real phone sees. Google's PageSpeed service would give an independent number, but its daily quota was used up when this was run. Please re-check with https://pagespeed.web.dev/ before you submit.

## Same production build, served locally

- Mobile (default profile): performance 97, accessibility 100; FCP 1.2 s, LCP 2.4 s
- Mobile with real network throttling applied (rtt 150 ms, 1.6 Mbps, 4x CPU): performance 92; FCP 1.5 s, LCP 1.5 s
- Desktop (earlier build): performance 100, accessibility 100, best-practices 100, seo 100; FCP 0.2 s, LCP 0.6 s

## What was changed for speed

- The headline animation is pure CSS, so the words are in the first HTML and nothing waits for scripts.
- Only one font file is preloaded. Before, two were, competing with the scripts for bandwidth.
