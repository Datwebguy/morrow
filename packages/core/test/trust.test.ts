import { describe, expect, it } from "vitest";
import { priceTrust, type PriceSnapshot, type TrustThresholds } from "../src";

// Test fixtures: thresholds and a healthy book. Not product data.
const t: TrustThresholds = {
  maxTradeAgeSeconds: 300, maxSpreadRatio: 0.01, depthBandRatio: 0.01, minDepthToBackingRatio: 1, maxMoveVsHistoryMultiple: 1.5,
};
const good: PriceSnapshot = {
  nowMs: 1_000_000, lastTradeMs: 990_000, bid: 99.9, ask: 100.1,
  bids: [{ price: 99.9, size: 100 }], asks: [{ price: 100.1, size: 100 }],
  lastClose: 100, backingValue: 5000, historyMaxAbsMove: 0.05,
};

describe("priceTrust", () => {
  it("trusts a healthy price", () => {
    const r = priceTrust(good, t);
    expect(r.trusted).toBe(true);
    expect(r.mid).toBeCloseTo(100);
  });
  it("fails on a stale last trade", () => {
    expect(priceTrust({ ...good, lastTradeMs: 1_000_000 - 301_000 }, t).failures).toContain("stale_trade");
    expect(priceTrust({ ...good, lastTradeMs: null }, t).trusted).toBe(false);
  });
  it("fails on a wide spread", () => {
    expect(priceTrust({ ...good, bid: 98, ask: 102 }, t).failures).toContain("wide_spread");
  });
  it("fails on a thin book", () => {
    const r = priceTrust({ ...good, bids: [{ price: 99.9, size: 1 }] }, t);
    expect(r.failures).toContain("thin_book");
  });
  it("ignores depth outside the band", () => {
    const r = priceTrust({ ...good, bids: [{ price: 90, size: 1000 }] }, t);
    expect(r.failures).toContain("thin_book");
  });
  it("fails when too far from the last close compared with history", () => {
    const r = priceTrust({ ...good, bid: 91.9, ask: 92.1, bids: [{ price: 91.9, size: 100 }], asks: [{ price: 92.1, size: 100 }] }, t);
    expect(r.failures).toContain("far_from_close");
  });
  it("fails with no history or no last close", () => {
    expect(priceTrust({ ...good, historyMaxAbsMove: null }, t).failures).toContain("no_history");
    expect(priceTrust({ ...good, lastClose: null }, t).failures).toContain("far_from_close");
  });
  it("is not trusted with no price", () => {
    expect(priceTrust({ ...good, bid: null }, t)).toEqual({ trusted: false, mid: null, failures: ["no_price"] });
    expect(priceTrust({ ...good, bid: 101, ask: 100 }, t).trusted).toBe(false);
    expect(priceTrust({ ...good, bid: 0, ask: 0 }, t).trusted).toBe(false);
  });
  it("handles zero backing value", () => {
    expect(priceTrust({ ...good, backingValue: 0 }, t).trusted).toBe(true);
  });
});
