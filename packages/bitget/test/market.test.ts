import { describe, expect, it } from "vitest";
import { BitgetDataError, fetchHourlyHistory, fetchLoanCoins, fetchOrderBook, fetchQuote, type Fetch } from "../src";

/** Test fixture: canned responses shaped like Bitget's, used only to test parsing. */
function respond(data: unknown, code = "00000"): Fetch {
  return async () => ({ ok: true, status: 200, json: async () => ({ code, msg: "x", data }) });
}

describe("parsing", () => {
  it("reads loan coins and limits", async () => {
    const r = await fetchLoanCoins({
      fetch: respond({
        loanInfos: [{ coin: "USDT" }],
        pledgeInfos: [{ coin: "rXYZ", initRate: "0.5", supRate: "0.6", forceRate: "0.8", maxPledgeAmount: "10" }],
      }),
    });
    expect(r.borrowCoins).toEqual(["USDT"]);
    expect(r.backing[0]?.limits).toEqual({ start: 0.5, marginCall: 0.6, liquidation: 0.8 });
  });
  it("refuses bad numbers instead of guessing", async () => {
    await expect(
      fetchLoanCoins({ fetch: respond({ loanInfos: [], pledgeInfos: [{ coin: "x", initRate: "", supRate: "1", forceRate: "1", maxPledgeAmount: "1" }] }) }),
    ).rejects.toBeInstanceOf(BitgetDataError);
  });
  it("refuses an error answer from Bitget", async () => {
    await expect(fetchQuote("X", { fetch: respond([], "40001") })).rejects.toBeInstanceOf(BitgetDataError);
  });
  it("reads a quote and an order book", async () => {
    const q = await fetchQuote("X", { fetch: respond([{ lastPr: "10", bidPr: "9.9", askPr: "10.1", ts: "5" }]) });
    expect(q).toMatchObject({ last: 10, bid: 9.9, ask: 10.1, snapshotMs: 5 });
    const b = await fetchOrderBook("X", 5, { fetch: respond({ bids: [["9", "2"]], asks: [["11", "3"]], ts: "7" }) });
    expect(b.bids[0]).toEqual({ price: 9, size: 2 });
  });
  it("retries a rate limit and then succeeds", async () => {
    let n = 0;
    const f: Fetch = async () => {
      n++;
      return n < 3
        ? { ok: false, status: 429, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ code: "00000", data: [{ lastPr: "1", bidPr: "1", askPr: "1", ts: "1" }] }) };
    };
    expect((await fetchQuote("X", { fetch: f, retryDelayMs: 0 })).last).toBe(1);
    expect(n).toBe(3);
  });
  it("gives up after repeated rate limits instead of returning partial data", async () => {
    const f: Fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    await expect(fetchQuote("X", { fetch: f, retryDelayMs: 0 })).rejects.toBeInstanceOf(BitgetDataError);
  });
  it("walks history backwards and de-duplicates", async () => {
    const pages: Record<string, string[][]> = {
      "300": [["200", "1", "1", "1", "1", "5"], ["300", "1", "1", "1", "1", "5"]],
      "200": [["100", "1", "1", "1", "1", "5"], ["200", "1", "1", "1", "1", "5"]],
      "100": [],
    };
    const f: Fetch = async (url) => {
      const end = new URL(url).searchParams.get("endTime")!;
      return { ok: true, status: 200, json: async () => ({ code: "00000", data: pages[end] ?? [] }) };
    };
    const c = await fetchHourlyHistory("X", 100, 300, { fetch: f });
    expect(c.map((x) => x.t)).toEqual([100, 200, 300]);
  });
});
