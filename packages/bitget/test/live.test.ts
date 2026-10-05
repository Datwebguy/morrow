import { describe, expect, it } from "vitest";
import { fetchCollateralStocks, fetchHourlyHistory, fetchLastTradeMs, fetchLoanCoins, fetchOrderBook, fetchQuote } from "../src";

// Integration test against Bitget's live public endpoints. No key needed.
const MS_PER_DAY = 86_400_000; // test fixture: one day in ms

describe("live public endpoints", () => {
  it("reads live loan limits, stock tokens, prices, book and history", async () => {
    const coins = await fetchLoanCoins();
    expect(coins.backing.length).toBeGreaterThan(0);
    for (const b of coins.backing) {
      expect(b.limits.marginCall).toBeLessThan(b.limits.liquidation);
    }

    const stocks = await fetchCollateralStocks();
    expect(stocks.length).toBeGreaterThan(0);
    // Many stock tokens have an empty book; look for one that is live.
    let symbol = "";
    for (const s of stocks.filter((x) => x.online).slice(0, 40)) {
      const b = await fetchOrderBook(s.symbol, 5);
      if (b.bids.length > 0 && b.asks.length > 0) {
        symbol = s.symbol;
        break;
      }
    }
    expect(symbol).not.toBe("");

    const q = await fetchQuote(symbol);
    expect(q.bid).toBeGreaterThan(0);
    expect(q.ask).toBeGreaterThanOrEqual(q.bid);

    const t = await fetchLastTradeMs(symbol);
    expect(t === null || t > 0).toBe(true);

    const book = await fetchOrderBook(symbol, 5);
    expect(book.bids.length + book.asks.length).toBeGreaterThan(0);

    const now = Date.now();
    const hist = await fetchHourlyHistory(symbol, now - 3 * MS_PER_DAY, now);
    expect(hist.length).toBeGreaterThan(0);
  }, 60_000);
});
