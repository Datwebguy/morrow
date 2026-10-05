import {
  fetchHourlyHistory, fetchLastTradeMs, fetchLoanCoins, fetchOrderBook, fetchQuote, fetchStockTokens, MorrowBitget, sdkTransport,
  type Transport,
} from "@morrow/bitget";
import { BITGET_BASE_URL, BITGET_PATHS, MS_PER_HOUR } from "@morrow/config";
import { parseBalances, parseLoans } from "./loans";
import type { Balances, LoanRead, MarketPort, Ports } from "./ports";

export interface Keys {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

/** Reads the three Bitget variables. Missing keys are a plain state, not a crash. */
export function keysFromEnv(env: NodeJS.ProcessEnv): Keys | null {
  const apiKey = env["BITGET_API_KEY"];
  const secretKey = env["BITGET_SECRET_KEY"];
  const passphrase = env["BITGET_PASSPHRASE"];
  return apiKey && secretKey && passphrase ? { apiKey, secretKey, passphrase } : null;
}

export function liveMarket(): MarketPort {
  let symbols: Map<string, string> | null = null;
  let loadedAt = 0;
  return {
    async symbolFor(coin) {
      if (!symbols || Date.now() - loadedAt > 6 * MS_PER_HOUR) {
        const stocks = await fetchStockTokens();
        symbols = new Map(stocks.map((s) => [s.baseCoin.toUpperCase(), s.symbol]));
        loadedAt = Date.now();
      }
      return symbols.get(coin.toUpperCase()) ?? null;
    },
    quote: (s) => fetchQuote(s),
    lastTradeMs: (s) => fetchLastTradeMs(s),
    book: (s, levels) => fetchOrderBook(s, levels),
    history: (s, from, to) => fetchHourlyHistory(s, from, to),
  };
}

async function announcementTitles(): Promise<string[]> {
  const url = `${BITGET_BASE_URL}${BITGET_PATHS.announcements}?language=en_US&annType=latest_news`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: Array<{ annTitle?: string }> };
  return (body.data ?? []).map((x) => x.annTitle ?? "").filter((t) => t.length > 0);
}

export interface LiveOptions {
  keys: Keys | null;
  /** True after the user pressed Disconnect. Reads and writes stop until they connect again. */
  isDisconnected?: () => boolean;
  telegramToken: string | undefined;
  transport?: Transport;
}

/** The real thing: Bitget account and market over the official SDK. Without keys, loans and balances read as empty with a reason. */
export function livePorts(o: LiveOptions): Ports {
  const real = o.transport ?? (o.keys ? sdkTransport(o.keys) : null);
  const disconnected = (): boolean => o.isDisconnected?.() === true;
  const transport: Transport | null = real
    ? {
        async call(op, args) {
          if (disconnected()) throw new Error("Bitget is disconnected.");
          return real.call(op, args);
        },
      }
    : null;
  const exec = new MorrowBitget(
    transport ?? {
      async call() {
        throw new Error("Bitget is not connected yet.");
      },
    },
  );
  let limitsCache: { at: number; map: Map<string, { start: number; marginCall: number; liquidation: number }> } | null = null;
  return {
    nowMs: () => Date.now(),
    simulated: false,
    async loans(): Promise<LoanRead> {
      if (!transport || disconnected()) return { loans: [], problems: ["Bitget is not connected."] };
      try {
        return parseLoans(await exec.ongoingLoans());
      } catch (e) {
        return { loans: [], problems: [`Your loans could not be read (${e instanceof Error ? e.message : "unknown reason"}).`] };
      }
    },
    async idleBalances(): Promise<Balances> {
      if (!transport || disconnected()) return { byCoin: null, problem: "Bitget is not connected." };
      try {
        return parseBalances(await exec.read("getAccountAssets"));
      } catch (e) {
        return { byCoin: null, problem: `Balances could not be read (${e instanceof Error ? e.message : "unknown reason"}).` };
      }
    },
    async limits(coin) {
      if (!limitsCache || Date.now() - limitsCache.at > 60_000) {
        const coins = await fetchLoanCoins();
        limitsCache = { at: Date.now(), map: new Map(coins.backing.map((b) => [b.coin.toUpperCase(), b.limits])) };
      }
      return limitsCache.map.get(coin.toUpperCase()) ?? null;
    },
    market: liveMarket(),
    announcements: announcementTitles,
    exec,
    async notify(chatId, text) {
      if (!o.telegramToken) return;
      await fetch(`https://api.telegram.org/bot${o.telegramToken}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }),
      });
    },
  };
}
