// TEST FIXTURES ONLY. Nothing in this file ships. Prices, limits and loans are test inputs.
import { MorrowBitget, type OrderBook, type Quote, type Transport } from "@morrow/bitget";
import { MS_PER_HOUR, NYSE_CALENDAR } from "@morrow/config";
import { buildClosures, type Candle, type LoanLimits } from "@morrow/core";
import type { Advisor } from "../src/advisor";
import { ProfileCache } from "../src/assess";
import type { Deps } from "../src/cycle";
import { Store } from "../src/db";
import type { Balances, LoanRead, LoanRecord, Ports } from "../src/ports";
import { rulesAdvisor } from "../src/advisor";

export const LIMITS: LoanLimits = { start: 0.5, marginCall: 0.6, liquidation: 0.8 };
export const SYMBOL = "RXYZUSDT";
export const COIN = "rXYZ";

/** Saturday inside the closure from Friday 2026-09-25 to Monday 2026-09-28. */
export const SATURDAY = Date.parse("2026-09-26T12:00:00Z");
const CLOSURE_FROM = Date.parse("2026-01-01T00:00:00Z");

/** A stock whose weekends gap by a fixed list of moves: a paused token (no candles inside closures). */
export function pausedHistory(until: number, moves: number[] = [-0.03, 0.01, -0.02, 0.0, -0.01]): Candle[] {
  const start = Date.parse("2025-12-29T00:00:00Z");
  const closures = buildClosures(NYSE_CALENDAR, CLOSURE_FROM, until);
  const candles: Candle[] = [];
  let k = 0;
  for (let t = start; t < until; t += MS_PER_HOUR) {
    const inside = closures.find((c) => t >= c.closeTs && t < c.reopenTs);
    if (inside) continue;
    const reopening = closures.find((c) => t >= c.reopenTs && t < c.reopenTs + MS_PER_HOUR);
    let price = 100;
    if (reopening) price = 100 * (1 + (moves[(k++) % moves.length] ?? 0));
    candles.push({ t, open: price, high: price, low: price, close: reopening ? price : 100, volume: 10 });
  }
  return candles;
}

export interface World {
  deps: Deps;
  store: Store;
  calls: Array<{ operationId: string; args: Record<string, unknown> }>;
  notified: string[];
  state: { now: number; loans: LoanRecord[]; balances: Record<string, number> | null; bid: number; ask: number; lastTradeAgeMs: number; quoteAgeMs: number; reduces: unknown };
  ports: Ports;
}

export function world(opts: { advisor?: Advisor; liveActions?: boolean; simulated?: boolean; history?: Candle[] } = {}): World {
  const store = new Store(":memory:");
  const calls: World["calls"] = [];
  const notified: string[] = [];
  const state: World["state"] = {
    now: SATURDAY,
    loans: [{ orderId: "L1", loanCoin: "USDT", backingCoin: COIN, debt: 580, backingAmount: 10 }],
    balances: { USDT: 1000, [COIN]: 5 },
    bid: 99.95, ask: 100.05, lastTradeAgeMs: 30_000, quoteAgeMs: 1000, reduces: [],
  };
  const history = opts.history ?? pausedHistory(Date.parse("2026-10-02T00:00:00Z"));
  const transport: Transport = {
    async call(operationId, args) {
      calls.push({ operationId, args });
      return { code: "00000", data: operationId === "getLoanReduces" ? state.reduces : { orderId: "r-1" } };
    },
  };
  const ports: Ports = {
    nowMs: () => state.now,
    simulated: opts.simulated ?? false,
    async loans(): Promise<LoanRead> {
      return { loans: state.loans, problems: [] };
    },
    async idleBalances(): Promise<Balances> {
      return state.balances ? { byCoin: state.balances } : { byCoin: null, problem: "Balances could not be read." };
    },
    async limits(coin) {
      return coin === COIN ? LIMITS : null;
    },
    market: {
      async symbolFor(coin) {
        return coin === COIN ? SYMBOL : null;
      },
      async quote(symbol): Promise<Quote> {
        return { symbol, last: (state.bid + state.ask) / 2, bid: state.bid, ask: state.ask, snapshotMs: state.now - state.quoteAgeMs };
      },
      async lastTradeMs() {
        return state.now - state.lastTradeAgeMs;
      },
      async book(): Promise<OrderBook> {
        return { bids: [{ price: state.bid, size: 1000 }], asks: [{ price: state.ask, size: 1000 }], ts: state.now };
      },
      async history(_s, from, to) {
        return history.filter((c) => c.t >= from && c.t <= to);
      },
    },
    async announcements() {
      return ["Fixture announcement"];
    },
    exec: new MorrowBitget(transport),
    async notify(_chat, text) {
      notified.push(text);
    },
  };
  const deps: Deps = { store, ports, advisor: opts.advisor ?? rulesAdvisor, liveActions: opts.liveActions ?? false, cache: new ProfileCache(ports) };
  return { deps, store, calls, notified, state, ports };
}

/** A stock that also trades through closures (candles with volume inside them), with the given reopen moves. */
export function weekendHistory(until: number, moves: number[] = [-0.03, 0.01, -0.02, 0.0, -0.01]): Candle[] {
  const start = Date.parse("2025-12-29T00:00:00Z");
  const closures = buildClosures(NYSE_CALENDAR, CLOSURE_FROM, until);
  const candles: Candle[] = [];
  let k = 0;
  for (let t = start; t < until; t += MS_PER_HOUR) {
    const reopening = closures.find((c) => t >= c.reopenTs && t < c.reopenTs + MS_PER_HOUR);
    const price = reopening ? 100 * (1 + (moves[(k++) % moves.length] ?? 0)) : 100;
    candles.push({ t, open: price, high: price, low: price, close: reopening ? price : 100, volume: 10 });
  }
  return candles;
}
