import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { LOGOS, MS_PER_DAY } from "@morrow/config";
import { Store } from "../src/db";
import { companyNameFromCoinGecko, iconFromHtml, LogoSync, platformFor, siteMatchesCompany, type JsonReply, type LogoDeps } from "../src/logos";
import { createServer } from "../src/server";
import { world } from "./fixtures";

// TEST FIXTURES ONLY: invented tokens, addresses and bytes in the shape of the real services' answers.
const PLATFORMS = [{ id: "arbitrum-one", name: "Arbitrum One", shortname: "Arbitrum" }, { id: "morph", name: "Morph" }, { id: "ethereum", name: "Ethereum", shortname: "Ethereum" }];
const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const CHAINS = [{ chain: "ArbitrumOne", contractAddress: "0xaaa" }, { chain: "Morph", contractAddress: "0xbbb" }];

interface Script {
  json: Array<[RegExp, JsonReply | JsonReply[]]>;
  text?: Record<string, string>;
  images?: Record<string, { contentType: string; bytes: Uint8Array }>;
}

function fakeDeps(script: Script) {
  const clock = { t: Date.UTC(2026, 9, 5) };
  const calls: Array<{ url: string; at: number }> = [];
  const sleeps: number[] = [];
  const queues = new Map<RegExp, JsonReply[]>(script.json.map(([re, r]) => [re, Array.isArray(r) ? [...r] : [r]]));
  const deps: LogoDeps = {
    async fetchJson(url) {
      calls.push({ url, at: clock.t });
      for (const [re, q] of queues) if (re.test(url)) return q.length > 1 ? q.shift()! : q[0]!;
      return { status: 404, body: null };
    },
    async fetchText(url) {
      return script.text?.[url] ?? null;
    },
    async fetchImage(url) {
      return script.images?.[url] ?? null;
    },
    async sleep(ms) {
      sleeps.push(ms);
      clock.t += ms;
    },
    now: () => clock.t,
  };
  return { deps, calls, sleeps, clock };
}

const platformsReply: JsonReply = { status: 200, body: PLATFORMS };
const coinReply = (name: string, img = "https://img.test/small.png"): JsonReply => ({ status: 200, body: { name, image: { small: img, large: "https://img.test/large.png" } } });

describe("names and platforms", () => {
  it("turns CoinGecko's token name into the company name", () => {
    expect(companyNameFromCoinGecko("Nvidia Tokenized Stock (Reality)")).toBe("Nvidia");
    expect(companyNameFromCoinGecko("Schwab US Dividend Equity ETF Tokenized Stock (Reality)")).toBe("Schwab US Dividend Equity ETF");
    expect(companyNameFromCoinGecko("Hims & Hers Health Tokenized Stock (Reality)")).toBe("Hims & Hers Health");
    expect(companyNameFromCoinGecko("Plain Name")).toBe("Plain Name");
  });
  it("matches a Bitget chain name to a CoinGecko platform on id, name or short name", () => {
    expect(platformFor("ArbitrumOne", PLATFORMS)).toBe("arbitrum-one");
    expect(platformFor("Morph", PLATFORMS)).toBe("morph");
    expect(platformFor("Ethereum", PLATFORMS)).toBe("ethereum");
    expect(platformFor("SomethingNew", PLATFORMS)).toBeNull();
  });
});

describe("company website logos", () => {
  it("prefers the apple-touch-icon, then the largest icon, then favicon.ico, and resolves relative addresses", () => {
    expect(iconFromHtml('<link rel="icon" sizes="32x32" href="/a.png"><link rel="apple-touch-icon" href="/touch.png">', "https://x.test/")).toBe("https://x.test/touch.png");
    expect(iconFromHtml('<link rel="icon" sizes="16x16" href="/s.png"><link rel="shortcut icon" sizes="192x192" href="/b.png">', "https://x.test/")).toBe("https://x.test/b.png");
    expect(iconFromHtml("<html></html>", "https://x.test/path")).toBe("https://x.test/favicon.ico");
  });
  it("only accepts a site that is clearly the company", () => {
    expect(siteMatchesCompany("<title>NVIDIA Corporation | AI</title>", "https://www.nvidia.com", "NVIDIA Corporation")).toBe(true);
    expect(siteMatchesCompany("<title>Something else</title>", "https://www.nvidia.com", "NVIDIA")).toBe(true); // the address names it
    expect(siteMatchesCompany("<title>Something else</title>", "https://example.org", "NVIDIA Corporation")).toBe(false);
    expect(siteMatchesCompany("<title>Inc</title>", "https://example.org", "Inc Corp")).toBe(false); // nothing but filler words
  });
});

describe("logo sync", () => {
  it("stores the CoinGecko logo and company name with source and date, and spaces CoinGecko calls apart", async () => {
    const f = fakeDeps({ json: [[/asset_platforms/, platformsReply], [/arbitrum-one\/contract\/0xaaa/, coinReply("Nvidia Tokenized Stock (Reality)")]], images: { "https://img.test/small.png": { contentType: "image/png", bytes: PNG } } });
    const store = new Store(":memory:");
    const row = await new LogoSync(store, f.deps).syncOne("rNVDA", CHAINS, null);
    expect(row).toMatchObject({ coin: "rNVDA", name: "Nvidia", source: "coingecko", contentType: "image/png" });
    expect(row?.sourceUrl).toBe(`${LOGOS.coingeckoBase}/coins/arbitrum-one/contract/0xaaa`);
    expect(store.getLogo("rnvda")?.fetchedAt).toBe(f.clock.t); // case-insensitive lookup, dated
    expect(Array.from(store.getLogo("rNVDA")!.image!)).toEqual(Array.from(PNG));
    const gaps = f.calls.slice(1).map((c, i) => c.at - f.calls[i]!.at);
    expect(gaps.every((g) => g >= LOGOS.minSecondsBetweenCoingeckoCalls * 1000)).toBe(true);
  });

  it("tries the next chain when the first has no entry", async () => {
    const f = fakeDeps({ json: [[/asset_platforms/, platformsReply], [/arbitrum-one/, { status: 404, body: null }], [/morph\/contract\/0xbbb/, coinReply("Apple Tokenized Stock (Reality)")]], images: { "https://img.test/small.png": { contentType: "image/png", bytes: PNG } } });
    const row = await new LogoSync(new Store(":memory:"), f.deps).syncOne("rAAPL", CHAINS, null);
    expect(row?.name).toBe("Apple");
  });

  it("waits and retries after a rate-limit answer, using the time CoinGecko asked for", async () => {
    const f = fakeDeps({ json: [[/asset_platforms/, platformsReply], [/arbitrum-one/, [{ status: 429, body: null, retryAfter: 42 }, coinReply("Visa Tokenized Stock (Reality)")]]], images: { "https://img.test/small.png": { contentType: "image/png", bytes: PNG } } });
    const row = await new LogoSync(new Store(":memory:"), f.deps).syncOne("rV", CHAINS, null);
    expect(row?.source).toBe("coingecko");
    expect(f.sleeps).toContain(42_000);
  });

  it("leaves a token for the next pass, and stores nothing, when CoinGecko keeps refusing or fails", async () => {
    const store = new Store(":memory:");
    const limited = fakeDeps({ json: [[/asset_platforms/, platformsReply], [/arbitrum-one|morph/, { status: 429, body: null }]] });
    expect(await new LogoSync(store, limited.deps).syncOne("rX", CHAINS, null)).toBeNull();
    const broken = fakeDeps({ json: [[/asset_platforms/, platformsReply], [/arbitrum-one|morph/, { status: 500, body: null }]] });
    expect(await new LogoSync(store, broken.deps).syncOne("rX", CHAINS, null)).toBeNull();
    expect(store.getLogo("rX")).toBeNull();
  });

  it("falls back to the company's own website logo when CoinGecko has no entry and the site is clearly the company", async () => {
    const wikidata: JsonReply = { status: 200, body: { results: { bindings: [{ site: { value: "https://www.acme.test" } }] } } };
    const f = fakeDeps({
      json: [[/asset_platforms/, platformsReply], [/coins\//, { status: 404, body: null }], [/wikidata/, wikidata]],
      text: { "https://www.acme.test": '<title>Acme Corporation</title><link rel="apple-touch-icon" href="/touch.png">' },
      images: { "https://www.acme.test/touch.png": { contentType: "image/png", bytes: PNG } },
    });
    const row = await new LogoSync(new Store(":memory:"), f.deps).syncOne("rACME", CHAINS, "Acme Corporation");
    expect(row).toMatchObject({ source: "company_site", sourceUrl: "https://www.acme.test", name: "Acme Corporation" });
  });

  it("never shows a logo from the wrong company: a site that does not match is refused, and so is a token with no name to check against", async () => {
    const wikidata: JsonReply = { status: 200, body: { results: { bindings: [{ site: { value: "https://other.test" } }] } } };
    const f = fakeDeps({
      json: [[/asset_platforms/, platformsReply], [/coins\//, { status: 404, body: null }], [/wikidata/, wikidata]],
      text: { "https://other.test": "<title>Totally Different</title>" },
      images: { "https://other.test/favicon.ico": { contentType: "image/x-icon", bytes: PNG } },
    });
    const store = new Store(":memory:");
    const sync = new LogoSync(store, f.deps);
    expect(await sync.syncOne("rACME", CHAINS, "Acme Corporation")).toMatchObject({ source: "none", image: null });
    expect(await sync.syncOne("rACME2", CHAINS, null)).toMatchObject({ source: "none", image: null });
  });

  it("looks a token up again only when its answer is old: a week for a logo, a day for a miss", async () => {
    const f = fakeDeps({ json: [[/asset_platforms/, platformsReply], [/coins\//, { status: 404, body: null }]] });
    const store = new Store(":memory:");
    const sync = new LogoSync(store, f.deps);
    expect(sync.isDue("rZ")).toBe(true);
    await sync.syncOne("rZ", CHAINS, null); // a miss
    expect(sync.isDue("rZ")).toBe(false);
    f.clock.t += LOGOS.retryMissingDays * MS_PER_DAY;
    expect(sync.isDue("rZ")).toBe(true);
    store.setLogo({ coin: "rY", name: "Y", source: "coingecko", sourceUrl: null, contentType: "image/png", image: PNG, fetchedAt: f.clock.t });
    f.clock.t += LOGOS.refreshDays * MS_PER_DAY - 1;
    expect(sync.isDue("rY")).toBe(false);
    f.clock.t += 1;
    expect(sync.isDue("rY")).toBe(true);
  });

  it("runs a pass over only the tokens that are due, and not twice at once", async () => {
    const f = fakeDeps({ json: [[/asset_platforms/, platformsReply], [/coins\//, coinReply("T Tokenized Stock (Reality)")]], images: { "https://img.test/small.png": { contentType: "image/png", bytes: PNG } } });
    const store = new Store(":memory:");
    store.setLogo({ coin: "rA", name: "A", source: "coingecko", sourceUrl: null, contentType: "image/png", image: PNG, fetchedAt: f.clock.t });
    const sync = new LogoSync(store, f.deps);
    const [first, second] = await Promise.all([sync.runPass(["rA", "rB"], () => CHAINS, () => null), sync.runPass(["rA", "rB"], () => CHAINS, () => null)]);
    expect(first).toEqual({ synced: 1, skipped: 0 });
    expect(second).toEqual({ synced: 0, skipped: 0 });
    expect(store.getLogo("rB")?.source).toBe("coingecko");
  });
});

describe("logo routes", () => {
  const servers: Array<{ close(): void }> = [];
  afterEach(() => servers.splice(0).forEach((s) => s.close()));

  async function start() {
    const w = world();
    w.store.setLogo({ coin: "rNVDA", name: "Nvidia", source: "coingecko", sourceUrl: "https://src.test", contentType: "image/png", image: PNG, fetchedAt: 1_000 });
    w.store.setLogo({ coin: "rNONE", name: null, source: "none", sourceUrl: null, contentType: null, image: null, fetchedAt: 2_000 });
    const server = createServer({ ...w.deps, appToken: "secret", allowedOrigin: "https://app.test", connected: true });
    await new Promise<void>((r) => server.listen(0, r));
    servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("serves the cached image with its source and date, to anyone", async () => {
    const base = await start();
    const res = await fetch(`${base}/public/logo/rNVDA`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-logo-source")).toBe("coingecko");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(PNG));
    expect((await fetch(`${base}/public/logo/rnvda`)).status).toBe(200); // any letter case
  });
  it("says 404 for a token with no real logo, so the site shows initials", async () => {
    const base = await start();
    expect((await fetch(`${base}/public/logo/rNONE`)).status).toBe(404);
    expect((await fetch(`${base}/public/logo/rUNKNOWN`)).status).toBe(404);
    expect((await fetch(`${base}/public/logo/../x`)).status).toBe(404);
  });
  it("lists every token with name, source and date, and no image bytes", async () => {
    const base = await start();
    const body = await (await fetch(`${base}/public/logos`)).json();
    expect(body.logos).toEqual([
      { coin: "rNONE", name: null, source: "none", sourceUrl: null, contentType: null, fetchedAt: 2_000, hasImage: false },
      { coin: "rNVDA", name: "Nvidia", source: "coingecko", sourceUrl: "https://src.test", contentType: "image/png", fetchedAt: 1_000, hasImage: true },
    ]);
  });
});
