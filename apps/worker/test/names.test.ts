import { describe, expect, it } from "vitest";
import { cleanName, CompanyNames, parseDirectory, tickerOf } from "../src/names";

// TEST FIXTURES ONLY: tiny excerpts in the shape of Nasdaq's directory files.
const NASDAQ = ["Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares", "NVDA|NVIDIA Corporation - Common Stock|Q|N|N|100|N|N", "ZZZT|Test Co - Common Stock|Q|Y|N|100|N|N", "File Creation Time: 1005202600:00|||||||"].join("\n");
const OTHER = ["ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol", "BRK.B|Berkshire Hathaway Inc. Class B Common Stock|N|BRK.B|N|100|N|BRK/B", "AGG|iShares Core U.S. Aggregate Bond ETF|P|AGG|Y|100|N|AGG"].join("\n");

describe("company names", () => {
  it("cleans the directory's suffixes", () => {
    expect(cleanName("NVIDIA Corporation - Common Stock")).toBe("NVIDIA Corporation");
    expect(cleanName("Berkshire Hathaway Inc. Class B Common Stock")).toBe("Berkshire Hathaway Inc.");
    expect(cleanName("iShares Core U.S. Aggregate Bond ETF")).toBe("iShares Core U.S. Aggregate Bond ETF");
  });
  it("parses both files, skipping test issues and the footer", () => {
    const m = parseDirectory(NASDAQ);
    expect(m.get("NVDA")).toBe("NVIDIA Corporation");
    expect(m.has("ZZZT")).toBe(false);
    expect(m.size).toBe(1);
  });
  it("maps a stock token to its ticker and finds the name, matching punctuation loosely", async () => {
    expect(tickerOf("rNVDA")).toBe("NVDA");
    const names = new CompanyNames(async (u) => (u.includes("nasdaqlisted") ? NASDAQ : OTHER));
    expect(await names.nameOf("rNVDA")).toBe("NVIDIA Corporation");
    expect(await names.nameOf("rBRKB")).toBe("Berkshire Hathaway Inc.");
    expect(await names.nameOf("rAGG")).toBe("iShares Core U.S. Aggregate Bond ETF");
    expect(await names.nameOf("rNOPE")).toBeNull();
  });
  it("shows the ticker only, and does not crash, when the directory cannot be read", async () => {
    const names = new CompanyNames(async () => Promise.reject(new Error("down")));
    expect(await names.nameOf("rNVDA")).toBeNull();
  });
});
