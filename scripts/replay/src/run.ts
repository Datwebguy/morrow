import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCollateralStocks, fetchHourlyHistory, fetchLoanCoins, type CollateralStock } from "@morrow/bitget";
import {
  DEFAULT_TARGET_BUFFER_POINTS, DEFAULT_TRUST_THRESHOLDS, MIN_CLOSURES_FOR_HISTORY, MS_PER_DAY, MS_PER_HOUR, NYSE_CALENDAR, PERCENT,
  WEEKEND_TRADING_MIN_COVERAGE,
} from "@morrow/config";
import { buildClosures, reopenGaps, type Candle } from "@morrow/core";
import { SCENARIO } from "./scenario";
import { aggregate, chooseParams, type Row } from "./report";
import { simulateClosure, type Constants, type Params, type ValuationMode } from "./simulate";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache");
const outFile = join(here, "..", "..", "..", "apps", "web", "public", "replay-report.json");

async function pool<T, R>(items: T[], size: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T, i);
      }
    }),
  );
  return out;
}

async function history(stock: CollateralStock, fromMs: number, toMs: number): Promise<Candle[]> {
  const file = join(cacheDir, `${stock.symbol}.json`);
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8")) as { toMs: number; candles: Candle[] };
    if (cached.toMs === toMs) return cached.candles;
  }
  const candles = await fetchHourlyHistory(stock.symbol, fromMs, toMs);
  writeFileSync(file, JSON.stringify({ toMs, candles }));
  return candles;
}

async function main(): Promise<void> {
  mkdirSync(cacheDir, { recursive: true });
  const nowMs = Math.floor(Date.now() / MS_PER_HOUR) * MS_PER_HOUR;
  const fromMs = Date.parse(SCENARIO.historyFrom);

  console.log("Reading live loan parameters and stock tokens from Bitget...");
  const [stocks, coins] = await Promise.all([fetchCollateralStocks(), fetchLoanCoins()]);
  const usdt = (await (await fetch("https://api.bitget.com/api/v3/loan/coins")).json()) as {
    data: { loanInfos: Array<{ coin: string; hourRateFlexible: string }> };
  };
  const usdtRow = usdt.data.loanInfos.find((l) => l.coin === "USDT");
  if (!usdtRow) throw new Error("USDT is not a borrowable coin right now");
  const hourRate = Number(usdtRow.hourRateFlexible);
  console.log(`${stocks.length} stock tokens accepted as backing (of ${coins.backing.length} backing coins).`);

  const calendarStart = Date.parse(`${Math.min(...NYSE_CALENDAR.years)}-01-01T00:00:00Z`);
  const closures = buildClosures(NYSE_CALENDAR, calendarStart, nowMs).filter((c) => c.reopenTs <= nowMs);
  console.log(`${closures.length} closures from the stored NYSE calendar (fetched ${NYSE_CALENDAR.fetchedAt}).`);

  console.log("Pulling hourly history (cached after the first run)...");
  let done = 0;
  const histories = await pool(stocks, 6, async (s) => {
    const c = await history(s, fromMs, nowMs);
    if (++done % 20 === 0) console.log(`  ${done}/${stocks.length}`);
    return c;
  });

  const k: Constants = {
    hourMs: MS_PER_HOUR,
    minClosures: MIN_CLOSURES_FOR_HISTORY,
    maxMoveVsHistoryMultiple: DEFAULT_TRUST_THRESHOLDS.maxMoveVsHistoryMultiple,
    hourRate,
  };
  const targetBuffer = DEFAULT_TARGET_BUFFER_POINTS / PERCENT;
  const outCutoff = nowMs - SCENARIO.outOfSampleDays * MS_PER_DAY;
  const modes: ValuationMode[] = ["live_price", "last_close"];

  const run = (params: Params): Row[] => {
    const rows: Row[] = [];
    stocks.forEach((s, idx) => {
      const candles = histories[idx] ?? [];
      const gaps = reopenGaps(candles, closures, { hourMs: MS_PER_HOUR, minCoverage: WEEKEND_TRADING_MIN_COVERAGE });
      for (const cl of closures) {
        for (const startLtv of SCENARIO.startLtvs) {
          for (const mode of modes) {
            const r = simulateClosure(s.symbol, candles, cl, gaps, s.limits, startLtv, SCENARIO.backingValueUsdt, mode, params, k, DEFAULT_TRUST_THRESHOLDS);
            if (r) rows.push({ ...r, period: cl.reopenTs >= outCutoff ? "out_of_sample" : "train" });
          }
        }
      }
    });
    return rows;
  };

  const grid = SCENARIO.planningPercentiles.flatMap((p) =>
    SCENARIO.triggerBufferPoints.map((t) => ({ planningPercentile: p, triggerBufferPoints: t })),
  );
  console.log(`Searching ${grid.length} rule settings on the earlier period...`);
  const gridResults = grid.map((g) => {
    const params: Params = {
      planningPercentile: g.planningPercentile, triggerBufferRatio: g.triggerBufferPoints / PERCENT,
      targetBufferRatio: targetBuffer, idleFraction: SCENARIO.mainIdleFraction,
    };
    const train = run(params).filter((r) => r.period === "train");
    return { ...g, summary: aggregate(train) };
  });
  const chosen = chooseParams(gridResults);
  console.log(`Chosen on the earlier period: percentile ${chosen.planningPercentile}, trigger ${chosen.triggerBufferPoints} points.`);

  const sensitivity = SCENARIO.idleFractions.map((idle) => {
    const params: Params = {
      planningPercentile: chosen.planningPercentile, triggerBufferRatio: chosen.triggerBufferPoints / PERCENT,
      targetBufferRatio: targetBuffer, idleFraction: idle,
    };
    const rows = run(params);
    return {
      idleFraction: idle,
      train: aggregate(rows.filter((r) => r.period === "train")),
      outOfSample: aggregate(rows.filter((r) => r.period === "out_of_sample")),
    };
  });

  const report = {
    label: "simulated",
    note: "Prices are real Bitget hourly prices. Every loan in this report is simulated.",
    caveats: [
      "A simulated loan that starts at or above the trigger level is paid down at the start of every closure, whatever the weekend does. Read the 65% rows for protection against weekend risk alone; the 70% and 74% rows mostly show the cost of holding a loan that close to the margin-call level.",
      "The replay trust check uses traded volume and move size from hourly candles. The live check also uses spread, depth and last-trade age, which are not available for past hours.",
      "Closures start on 1 January 2026, the first year the stored official calendar covers. The number of closures behind each figure is shown with it.",
    ],
    generatedAt: new Date(nowMs).toISOString(),
    calendar: { source: NYSE_CALENDAR.source, fetchedAt: NYSE_CALENDAR.fetchedAt },
    tokens: stocks.length,
    closures: closures.length,
    historyFrom: SCENARIO.historyFrom,
    outOfSampleFrom: new Date(outCutoff).toISOString(),
    liveLimits: [...new Set(stocks.map((s) => `${s.limits.start}/${s.limits.marginCall}/${s.limits.liquidation}`))],
    usdtHourlyRate: hourRate,
    simulatedLoan: { backingValueUsdt: SCENARIO.backingValueUsdt, startLtvs: SCENARIO.startLtvs, idleFractionMain: SCENARIO.mainIdleFraction },
    chosen,
    grid: gridResults.map((g) => ({ planningPercentile: g.planningPercentile, triggerBufferPoints: g.triggerBufferPoints, train: g.summary })),
    results: sensitivity,
  };
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n");
  console.log(`Saved ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
