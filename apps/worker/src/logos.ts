import { LOGOS, MS_PER_DAY } from "@morrow/config";
import type { CoinChain } from "@morrow/bitget";
import type { LogoRow, Store } from "./db";

/**
 * Token logos and company names, fetched on a schedule and cached with their source and date. Order of trust:
 * 1. CoinGecko, by the token's contract address from Bitget. 2. The company's own website, found through Wikidata.
 * 3. Nothing: the site then shows initials. A logo is never invented, and a website logo is only used when the site is
 * clearly the same company (its name appears in the page title or address).
 */
export interface Platform {
  id: string;
  name: string;
  shortname?: string;
}

export interface JsonReply {
  status: number;
  body: unknown;
  /** Seconds the service asked us to wait, from a rate-limit answer. */
  retryAfter?: number;
}

export interface LogoDeps {
  fetchJson(url: string): Promise<JsonReply>;
  fetchText(url: string): Promise<string | null>;
  fetchImage(url: string): Promise<{ contentType: string; bytes: Uint8Array } | null>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "Nvidia Tokenized Stock (Reality)" becomes "Nvidia". */
export function companyNameFromCoinGecko(name: string): string {
  return name.replace(/\s*\b(tokeni[sz]ed\s+(stock|etf|fund|share)s?)\b.*$/i, "").replace(/\s*\(reality\)\s*$/i, "").replace(/\s+/g, " ").trim();
}

/** CoinGecko's platform id for a Bitget chain name, matched on id, name and short name ("ArbitrumOne" is arbitrum-one). */
export function platformFor(chain: string, platforms: Platform[]): string | null {
  const c = norm(chain);
  const hit = platforms.find((p) => norm(p.id) === c || norm(p.name) === c || (p.shortname ? norm(p.shortname) === c : false));
  return hit?.id ?? null;
}

interface CoinGeckoCoin {
  name?: unknown;
  image?: { small?: unknown; large?: unknown; thumb?: unknown };
}

function pickImage(c: CoinGeckoCoin): string | null {
  for (const k of ["small", "large", "thumb"] as const) {
    const v = c.image?.[k];
    if (typeof v === "string" && v.startsWith("https://")) return v;
  }
  return null;
}

const ICON = /<link\b[^>]*>/gi;
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3] ?? null) : null;
}

/** The best icon a page declares: an apple-touch-icon first, then the largest declared icon, then /favicon.ico. */
export function iconFromHtml(html: string, pageUrl: string): string {
  let best: { url: string; score: number } | null = null;
  for (const tag of html.match(ICON) ?? []) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/\bicon\b/.test(rel)) continue;
    const size = Math.max(0, ...((attr(tag, "sizes") ?? "").match(/\d+/g) ?? ["0"]).map(Number));
    const score = (rel.includes("apple-touch-icon") ? 10_000 : 0) + size;
    try {
      const url = new URL(href, pageUrl).toString();
      if (!best || score > best.score) best = { url, score };
    } catch {
      // an unusable address: skip it
    }
  }
  return best?.url ?? new URL("/favicon.ico", pageUrl).toString();
}

/** True when the page is clearly the company: a word of its name is in the page title or the web address. */
export function siteMatchesCompany(html: string, siteUrl: string, companyName: string): boolean {
  const words = companyName.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["inc", "corp", "corporation", "company", "the", "etf", "ltd", "group", "holdings", "fund"].includes(w));
  if (words.length === 0) return false;
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").toLowerCase();
  const host = new URL(siteUrl).hostname.toLowerCase();
  return words.some((w) => title.includes(w) || host.includes(w));
}

export class LogoSync {
  private lastCoinGeckoCall = 0;
  private platforms: { at: number; list: Platform[] } | null = null;
  private running = false;

  constructor(
    private readonly store: Store,
    private readonly deps: LogoDeps,
  ) {}

  /** True when this token has no cached answer yet, or its answer is old enough to look up again. */
  isDue(coin: string): boolean {
    const row = this.store.getLogo(coin);
    if (!row) return true;
    const days = row.source === "none" ? LOGOS.retryMissingDays : LOGOS.refreshDays;
    return this.deps.now() - row.fetchedAt >= days * MS_PER_DAY;
  }

  private async coinGecko(path: string): Promise<JsonReply> {
    for (let tries = 0; ; tries++) {
      const wait = this.lastCoinGeckoCall + LOGOS.minSecondsBetweenCoingeckoCalls * 1000 - this.deps.now();
      if (wait > 0) await this.deps.sleep(wait);
      this.lastCoinGeckoCall = this.deps.now();
      const r = await this.deps.fetchJson(`${LOGOS.coingeckoBase}${path}`);
      if (r.status !== 429 || tries + 1 >= LOGOS.maxTriesPerToken) return r;
      await this.deps.sleep((r.retryAfter ?? LOGOS.defaultBackoffSeconds) * 1000);
    }
  }

  private async platformList(): Promise<Platform[] | null> {
    if (this.platforms && this.deps.now() - this.platforms.at < LOGOS.refreshDays * MS_PER_DAY) return this.platforms.list;
    const r = await this.coinGecko("/asset_platforms");
    if (r.status !== 200 || !Array.isArray(r.body)) return null;
    const list = (r.body as Array<Record<string, unknown>>)
      .filter((p) => typeof p["id"] === "string" && typeof p["name"] === "string")
      .map((p) => ({ id: p["id"] as string, name: p["name"] as string, shortname: typeof p["shortname"] === "string" ? (p["shortname"] as string) : undefined }));
    this.platforms = { at: this.deps.now(), list };
    return list;
  }

  /** Looks the token up on CoinGecko by each of its contracts. "transient" means try again next pass rather than record a miss. */
  private async fromCoinGecko(chains: CoinChain[]): Promise<{ name: string; imageUrl: string | null; sourceUrl: string } | "missing" | "transient"> {
    const platforms = await this.platformList();
    if (!platforms) return "transient";
    let transient = false;
    for (const ch of chains) {
      const platform = platformFor(ch.chain, platforms);
      if (!platform) continue;
      const r = await this.coinGecko(`/coins/${platform}/contract/${ch.contractAddress}`);
      if (r.status === 404) continue;
      if (r.status !== 200 || typeof r.body !== "object" || r.body === null) {
        transient = true;
        continue;
      }
      const c = r.body as CoinGeckoCoin;
      if (typeof c.name !== "string") continue;
      return { name: companyNameFromCoinGecko(c.name), imageUrl: pickImage(c), sourceUrl: `${LOGOS.coingeckoBase}/coins/${platform}/contract/${ch.contractAddress}` };
    }
    return transient ? "transient" : "missing";
  }

  /** The company's own logo, through Wikidata's official website for its ticker. Null when nothing trustworthy is found. */
  private async fromCompanySite(ticker: string, nameHint: string | null): Promise<{ site: string; image: { contentType: string; bytes: Uint8Array } } | null> {
    if (!nameHint || !/^[A-Za-z0-9.]{1,8}$/.test(ticker)) return null;
    // A listed company carries its ticker as a qualifier on its stock-exchange statement (P414 with P249); P856 is its official website.
    const query = `SELECT ?site WHERE { ?c p:P414 ?s . ?s pq:P249 "${ticker.toUpperCase()}" . ?c wdt:P856 ?site } LIMIT 3`;
    const r = await this.deps.fetchJson(`${LOGOS.wikidataEndpoint}?format=json&query=${encodeURIComponent(query)}`);
    const rows = (r.body as { results?: { bindings?: Array<{ site?: { value?: string } }> } } | null)?.results?.bindings ?? [];
    for (const row of rows) {
      const site = row.site?.value;
      if (!site || !site.startsWith("https://")) continue;
      const html = await this.deps.fetchText(site);
      if (!html || !siteMatchesCompany(html, site, nameHint)) continue;
      const image = await this.deps.fetchImage(iconFromHtml(html, site));
      if (image) return { site, image };
    }
    return null;
  }

  /** Finds and stores the logo and name for one token. Returns the stored row, or null when it should be retried next pass. */
  async syncOne(coin: string, chains: CoinChain[], nameHint: string | null): Promise<LogoRow | null> {
    const now = this.deps.now();
    const cg = await this.fromCoinGecko(chains);
    if (cg === "transient") return null;
    let row: LogoRow | null = null;
    if (cg !== "missing") {
      const image = cg.imageUrl ? await this.deps.fetchImage(cg.imageUrl) : null;
      if (image) row = { coin, name: cg.name, source: "coingecko", sourceUrl: cg.sourceUrl, contentType: image.contentType, image: image.bytes, fetchedAt: now };
      else row = { coin, name: cg.name, source: "none", sourceUrl: cg.sourceUrl, contentType: null, image: null, fetchedAt: now };
    }
    if (!row || row.image === null) {
      const site = await this.fromCompanySite(coin.replace(/^r/i, ""), row?.name ?? nameHint);
      if (site) row = { coin, name: row?.name ?? nameHint, source: "company_site", sourceUrl: site.site, contentType: site.image.contentType, image: site.image.bytes, fetchedAt: now };
    }
    row ??= { coin, name: null, source: "none", sourceUrl: null, contentType: null, image: null, fetchedAt: now };
    const stored = { ...row, fetchedAt: this.deps.now() }; // dated when it is stored, after any waiting
    this.store.setLogo(stored);
    return stored;
  }

  /** One pass over every token that is due. Safe to call often: a pass already running is not started twice. */
  async runPass(coins: string[], chainsOf: (coin: string) => CoinChain[], nameHint: (coin: string) => string | null): Promise<{ synced: number; skipped: number }> {
    if (this.running) return { synced: 0, skipped: 0 };
    this.running = true;
    let synced = 0;
    let skipped = 0;
    try {
      for (const coin of coins) {
        if (!this.isDue(coin)) continue;
        const row = await this.syncOne(coin, chainsOf(coin), nameHint(coin));
        if (row) synced++;
        else skipped++;
      }
    } finally {
      this.running = false;
    }
    return { synced, skipped };
  }
}

/** The real network behind the service: timeouts, a User-Agent, size limits, and images only. */
export function liveLogoDeps(): LogoDeps {
  const signal = (): AbortSignal => AbortSignal.timeout(LOGOS.requestTimeoutSeconds * 1000);
  const headers = { "user-agent": LOGOS.userAgent, accept: "application/json" };
  return {
    async fetchJson(url) {
      try {
        const res = await fetch(url, { headers, signal: signal() });
        const retry = Number(res.headers.get("retry-after"));
        return { status: res.status, body: await res.json().catch(() => null), retryAfter: Number.isFinite(retry) && retry > 0 ? retry : undefined };
      } catch {
        return { status: 0, body: null };
      }
    },
    async fetchText(url) {
      try {
        const res = await fetch(url, { headers: { "user-agent": LOGOS.userAgent }, signal: signal(), redirect: "follow" });
        if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
        return (await res.text()).slice(0, 1_000_000);
      } catch {
        return null;
      }
    },
    async fetchImage(url) {
      try {
        const res = await fetch(url, { headers: { "user-agent": LOGOS.userAgent }, signal: signal() });
        const type = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
        if (!res.ok || !/^image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        return bytes.length > 0 && bytes.length <= LOGOS.maxImageBytes ? { contentType: type, bytes } : null;
      } catch {
        return null;
      }
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  };
}
