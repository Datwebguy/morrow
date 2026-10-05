import { BITGET_BASE_URL, BITGET_PATHS, HISTORY_GRANULARITY, MS_PER_HOUR } from "@morrow/config";
import type { BookLevel, Candle, LoanLimits } from "@morrow/core";

export type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface MarketOptions {
  fetch?: Fetch;
  baseUrl?: string;
  /** Pause between retries in ms. Tests set it to 0. */
  retryDelayMs?: number;
}

/** Retries for rate limits and server errors: 5 tries, doubling the pause each time. */
const MAX_TRIES = 5;
const FIRST_RETRY_DELAY_MS = 400;

export class BitgetDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BitgetDataError";
  }
}

function num(value: unknown, what: string): number {
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (value === "" || !Number.isFinite(n)) throw new BitgetDataError(`${what} is not a number`);
  return n;
}

function obj(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BitgetDataError(`${what} is not an object`);
  return value as Record<string, unknown>;
}

function arr(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new BitgetDataError(`${what} is not a list`);
  return value;
}

async function getData(path: string, query: Record<string, string | number>, o: MarketOptions): Promise<unknown> {
  const f: Fetch = o.fetch ?? ((url) => fetch(url));
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  const url = `${o.baseUrl ?? BITGET_BASE_URL}${path}${qs ? `?${qs}` : ""}`;
  let res = await f(url);
  for (let attempt = 1; !res.ok && (res.status === 429 || res.status >= 500) && attempt < MAX_TRIES; attempt++) {
    const wait = (o.retryDelayMs ?? FIRST_RETRY_DELAY_MS) * 2 ** (attempt - 1);
    await new Promise((r) => setTimeout(r, wait));
    res = await f(url);
  }
  if (!res.ok) throw new BitgetDataError(`Bitget answered with status ${res.status}`);
  const body = obj(await res.json(), "response");
  if (body["code"] !== "00000") throw new BitgetDataError(`Bitget refused the request: ${String(body["msg"] ?? "no reason given")}`);
  return body["data"];
}

export interface BackingCoin {
  coin: string;
  limits: LoanLimits;
  maxPledgeAmount: number;
}

export interface LoanCoins {
  fetchedAt: number;
  borrowCoins: string[];
  backing: BackingCoin[];
}

/** Loan coins and per-backing limits, live from Bitget. No key needed. */
export async function fetchLoanCoins(o: MarketOptions = {}): Promise<LoanCoins> {
  const data = obj(await getData(BITGET_PATHS.loanCoins, {}, o), "loan coins");
  const loans = arr(data["loanInfos"], "loanInfos").map((x) => String(obj(x, "loan coin")["coin"]));
  const backing = arr(data["pledgeInfos"], "pledgeInfos").map((x) => {
    const r = obj(x, "backing coin");
    return {
      coin: String(r["coin"]),
      limits: {
        start: num(r["initRate"], "initRate"),
        marginCall: num(r["supRate"], "supRate"),
        liquidation: num(r["forceRate"], "forceRate"),
      },
      maxPledgeAmount: num(r["maxPledgeAmount"], "maxPledgeAmount"),
    };
  });
  return { fetchedAt: Date.now(), borrowCoins: loans, backing };
}

export interface StockToken {
  symbol: string;
  baseCoin: string;
  online: boolean;
}

/** Stock tokens that are real (not synthetic) listings, live from Bitget. */
export async function fetchStockTokens(o: MarketOptions = {}): Promise<StockToken[]> {
  const data = arr(await getData(BITGET_PATHS.instruments, { category: "SPOT" }, o), "instruments");
  return data
    .map((x) => obj(x, "instrument"))
    .filter((r) => r["symbolType"] === "stock" && r["isReality"] === "yes")
    .map((r) => ({ symbol: String(r["symbol"]), baseCoin: String(r["baseCoin"]), online: r["status"] === "online" }));
}

export interface CollateralStock extends StockToken {
  limits: LoanLimits;
  maxPledgeAmount: number;
}

/** Stock tokens Bitget accepts as loan backing, with their live limits. */
export async function fetchCollateralStocks(o: MarketOptions = {}): Promise<CollateralStock[]> {
  const [coins, stocks] = await Promise.all([fetchLoanCoins(o), fetchStockTokens(o)]);
  const byCoin = new Map(coins.backing.map((b) => [b.coin.toUpperCase(), b]));
  const out: CollateralStock[] = [];
  for (const s of stocks) {
    const b = byCoin.get(s.baseCoin.toUpperCase());
    if (b) out.push({ ...s, limits: b.limits, maxPledgeAmount: b.maxPledgeAmount });
  }
  return out;
}

export interface Quote {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  /** When Bitget produced this snapshot. */
  snapshotMs: number;
}

export async function fetchQuote(symbol: string, o: MarketOptions = {}): Promise<Quote> {
  const rows = arr(await getData(BITGET_PATHS.tickers, { symbol }, o), "tickers");
  const r = obj(rows[0], "ticker");
  return {
    symbol,
    last: num(r["lastPr"], "lastPr"),
    bid: num(r["bidPr"], "bidPr"),
    ask: num(r["askPr"], "askPr"),
    snapshotMs: num(r["ts"], "ts"),
  };
}

export interface CoinChain {
  chain: string;
  contractAddress: string;
}

/** Every coin's chains and contract addresses in one call. Chains with no contract address are left out. No key needed. */
export async function fetchCoinChains(o: MarketOptions = {}): Promise<Map<string, CoinChain[]>> {
  const rows = arr(await getData(BITGET_PATHS.coins, {}, o), "coins");
  const out = new Map<string, CoinChain[]>();
  for (const x of rows) {
    const r = obj(x, "coin");
    if (typeof r["coin"] !== "string") continue;
    const chains = (Array.isArray(r["chains"]) ? r["chains"] : [])
      .map((c) => obj(c, "chain"))
      .filter((c) => typeof c["chain"] === "string" && typeof c["contractAddress"] === "string" && c["contractAddress"] !== "")
      .map((c) => ({ chain: String(c["chain"]), contractAddress: String(c["contractAddress"]) }));
    out.set(r["coin"].toUpperCase(), chains);
  }
  return out;
}

/** Traded value over the last 24 hours in USDT for every spot symbol, live from Bitget. No key needed. */
export async function fetchTradedValues(o: MarketOptions = {}): Promise<Map<string, number>> {
  const rows = arr(await getData(BITGET_PATHS.tickers, {}, o), "tickers");
  const out = new Map<string, number>();
  for (const x of rows) {
    const r = obj(x, "ticker");
    const v = Number(r["usdtVolume"] ?? r["quoteVolume"]);
    if (typeof r["symbol"] === "string" && Number.isFinite(v)) out.set(r["symbol"], v);
  }
  return out;
}

/** Time of the most recent trade, from Bitget's recent trades. Null when there are none. */
export async function fetchLastTradeMs(symbol: string, o: MarketOptions = {}): Promise<number | null> {
  const rows = arr(await getData("/api/v2/spot/market/fills", { symbol, limit: 1 }, o), "trades");
  if (rows.length === 0) return null;
  return num(obj(rows[0], "trade")["ts"], "ts");
}

export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
  ts: number;
}

export async function fetchOrderBook(symbol: string, limit: number, o: MarketOptions = {}): Promise<OrderBook> {
  const d = obj(await getData(BITGET_PATHS.orderBook, { symbol, type: "step0", limit }, o), "order book");
  const levels = (x: unknown, what: string): BookLevel[] =>
    arr(x, what).map((l) => {
      const p = arr(l, "level");
      return { price: num(p[0], "price"), size: num(p[1], "size") };
    });
  return { bids: levels(d["bids"], "bids"), asks: levels(d["asks"], "asks"), ts: num(d["ts"], "ts") };
}

function parseCandle(x: unknown): Candle {
  const r = arr(x, "candle");
  return {
    t: num(r[0], "t"), open: num(r[1], "open"), high: num(r[2], "high"), low: num(r[3], "low"), close: num(r[4], "close"),
    volume: num(r[5], "volume"),
  };
}

/** Largest page Bitget returns for hourly history. Source: Bitget history-candles docs (limit up to 200). */
const CANDLE_PAGE = 200;

/** Hourly candles from `fromMs` to `toMs`, oldest first, walking backwards page by page. */
export async function fetchHourlyHistory(symbol: string, fromMs: number, toMs: number, o: MarketOptions = {}): Promise<Candle[]> {
  const seen = new Map<number, Candle>();
  let end = toMs;
  for (let guard = 0; guard < 1000; guard++) {
    const page = arr(
      await getData(BITGET_PATHS.historyCandles, { symbol, granularity: HISTORY_GRANULARITY, endTime: end, limit: CANDLE_PAGE }, o),
      "candles",
    ).map(parseCandle);
    if (page.length === 0) break;
    for (const c of page) if (c.t >= fromMs && c.t <= toMs) seen.set(c.t, c);
    const oldest = Math.min(...page.map((c) => c.t));
    if (oldest <= fromMs || oldest >= end) break;
    end = oldest;
  }
  return [...seen.values()].sort((a, b) => a.t - b.t);
}

/** True constant helper re-exported for callers that step by hours. */
export const HOUR_MS = MS_PER_HOUR;
