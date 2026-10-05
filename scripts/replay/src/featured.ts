/**
 * Finds the most dramatic real closure in the replay data: the biggest gap down from the last close to the reopen price,
 * among closures the product could have acted on (at least the minimum number of earlier closures behind them).
 * It uses the same real Bitget hourly history and cache as the replay, and stops at the replay report's own time so the
 * two stay consistent. Writes packages/config/src/featured-closure.json.
 *
 * Usage: npm run featured --workspace scripts/replay
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCollateralStocks, fetchHourlyHistory } from "@morrow/bitget";
import { MIN_CLOSURES_FOR_HISTORY, MS_PER_HOUR, NYSE_CALENDAR, WEEKEND_TRADING_MIN_COVERAGE } from "@morrow/config";
import { buildClosures, reopenGaps, type Candle } from "@morrow/core";
import { SCENARIO } from "./scenario";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache");
const report = JSON.parse(readFileSync(join(here, "..", "..", "..", "apps", "web", "public", "replay-report.json"), "utf8")) as { generatedAt: string };
const out = join(here, "..", "..", "..", "packages", "config", "src", "featured-closure.json");

async function main(): Promise<void> {
  const toMs = Math.floor(Date.parse(report.generatedAt) / MS_PER_HOUR) * MS_PER_HOUR;
  const fromMs = Date.parse(SCENARIO.historyFrom);
  const calendarStart = Date.parse(`${Math.min(...NYSE_CALENDAR.years)}-01-01T00:00:00Z`);
  const closures = buildClosures(NYSE_CALENDAR, calendarStart, toMs).filter((c) => c.reopenTs <= toMs);
  const stocks = await fetchCollateralStocks();
  let best: { coin: string; symbol: string; closeTs: number; reopenTs: number; move: number } | null = null;
  for (const s of stocks) {
    const file = join(cacheDir, `${s.symbol}.json`);
    let candles: Candle[];
    if (existsSync(file) && (JSON.parse(readFileSync(file, "utf8")) as { toMs: number }).toMs === toMs) {
      candles = (JSON.parse(readFileSync(file, "utf8")) as { candles: Candle[] }).candles;
    } else {
      candles = await fetchHourlyHistory(s.symbol, fromMs, toMs);
    }
    const gaps = reopenGaps(candles, closures, { hourMs: MS_PER_HOUR, minCoverage: WEEKEND_TRADING_MIN_COVERAGE });
    gaps.forEach((g, i) => {
      if (i < MIN_CLOSURES_FOR_HISTORY) return;
      if (best === null || g.move < best.move) best = { coin: s.baseCoin, symbol: s.symbol, closeTs: g.closeTs, reopenTs: g.reopenTs, move: g.move };
    });
  }
  const file = {
    source: "scripts/replay/src/featured.ts: biggest gap down from the last close to the reopen price, from Bitget hourly candles, among closures with enough earlier history",
    generatedAt: new Date().toISOString(),
    replayGeneratedAt: report.generatedAt,
    featured: best,
  };
  writeFileSync(out, JSON.stringify(file, null, 2) + "\n");
  console.log(file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
