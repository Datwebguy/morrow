/**
 * Company names for the stock tokens, so people can search "Nvidia" as well as "rNVDA". Bitget's own listing has no names, so they
 * come from Nasdaq's official symbol directory (every Nasdaq and NYSE-family listing, ETFs included), read live and kept in memory.
 * A token with no match shows its ticker only. Nothing here is typed in.
 */
const SOURCES = ["https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt", "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"] as const;
const REFRESH_MS = 24 * 3_600_000; // names change rarely: one read a day

/** "NVIDIA Corporation - Common Stock" becomes "NVIDIA Corporation". */
export function cleanName(raw: string): string {
  const head = raw.split(" - ")[0] ?? raw;
  return head.replace(/\s+(Class [A-Z]\s+)?(Common Stock|Ordinary Shares?|Common Shares?|Capital Stock)\b.*$/i, "").replace(/\s+/g, " ").trim();
}

const key = (ticker: string): string => ticker.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** Parses one of the two pipe-delimited directory files into ticker to name. Test issues and the footer line are skipped. */
export function parseDirectory(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? "").split("|");
  const testCol = header.indexOf("Test Issue");
  for (const line of lines.slice(1)) {
    const c = line.split("|");
    if (c.length < 3 || line.startsWith("File Creation Time")) continue;
    if (testCol >= 0 && c[testCol] === "Y") continue;
    const ticker = c[0] ?? "";
    const name = cleanName(c[1] ?? "");
    if (ticker && name && !out.has(key(ticker))) out.set(key(ticker), name);
  }
  return out;
}

/** The ticker behind a stock token's coin: "rNVDA" is NVDA. */
export function tickerOf(coin: string): string {
  return coin.replace(/^r/i, "");
}

export class CompanyNames {
  private names = new Map<string, string>();
  private at = 0;
  constructor(private readonly fetchText: (url: string) => Promise<string> = async (u) => {
    const res = await fetch(u);
    if (!res.ok) throw new Error(`names source answered ${res.status}`);
    return res.text();
  }, private readonly now: () => number = Date.now) {}

  /** Name for a coin, or null when the directory has none or could not be read. */
  async nameOf(coin: string): Promise<string | null> {
    await this.load();
    return this.names.get(key(tickerOf(coin))) ?? null;
  }

  private async load(): Promise<void> {
    if (this.names.size > 0 && this.now() - this.at < REFRESH_MS) return;
    try {
      const maps = await Promise.all(SOURCES.map(async (u) => parseDirectory(await this.fetchText(u))));
      const merged = new Map<string, string>();
      for (const m of maps) for (const [k, v] of m) if (!merged.has(k)) merged.set(k, v);
      if (merged.size > 0) {
        this.names = merged;
        this.at = this.now();
      }
    } catch {
      this.at = this.now() - REFRESH_MS + 5 * 60_000; // try again in five minutes; names are optional
    }
  }
}
