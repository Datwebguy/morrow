/**
 * Shadow run of one past closure through the real worker cycle.
 * Prices are real Bitget hourly prices. The loan is simulated and declared on the command line. Every write is a dry run
 * and every entry is labelled simulated. Order-book depth, spread and last-trade age are not available for past hours,
 * so they are proxied from the hour's candle (range, traded value, hour end), and the log header says so.
 *
 * Usage: npm run shadow-closure --workspace scripts/replay -- <SYMBOL> <start loan health as a decimal> [reopenDate]
 */
import { writeFileSync } from "node:fs";
import { fetchHourlyHistory, fetchLoanCoins, fetchStockTokens, MorrowBitget, READ_OPERATIONS } from "@morrow/bitget";
import { GRADE_DELAY_MINUTES, MS_PER_HOUR, NYSE_CALENDAR, PERCENT, SCHEDULE } from "@morrow/config";
import { buildClosures, type Candle } from "@morrow/core";
import { rulesAdvisor } from "../../../apps/worker/src/advisor";
import { ProfileCache } from "../../../apps/worker/src/assess";
import { runCycle } from "../../../apps/worker/src/cycle";
import { Store } from "../../../apps/worker/src/db";
import type { Ports } from "../../../apps/worker/src/ports";
import { updateSettings } from "../../../apps/worker/src/settings";

const [symbol, ltvArg, reopenDate] = process.argv.slice(2);
const startLtv = Number(ltvArg);
const BACKING_VALUE_USDT = 10_000; // simulated loan size, declared here and in the log header
const IDLE_FRACTION = 0.25; // simulated idle USDT as a share of the debt

async function main(): Promise<void> {
  if (!symbol || !Number.isFinite(startLtv)) throw new Error("Usage: <SYMBOL> <start loan health, for example a decimal> [reopenDate]");
  const nowMs = Date.now();
  const calendarStart = Date.parse(`${Math.min(...NYSE_CALENDAR.years)}-01-01T00:00:00Z`);
  const done = buildClosures(NYSE_CALENDAR, calendarStart, nowMs).filter((c) => c.reopenTs <= nowMs);
  const closure = reopenDate ? done.find((c) => c.reopenDate === reopenDate) : done[done.length - 1];
  if (!closure) throw new Error("No completed closure found for that date.");

  const [stocks, coins] = await Promise.all([fetchStockTokens(), fetchLoanCoins()]);
  const stock = stocks.find((s) => s.symbol === symbol);
  if (!stock) throw new Error(`${symbol} is not a stock token on Bitget.`);
  const limits = coins.backing.find((b) => b.coin.toUpperCase() === stock.baseCoin.toUpperCase())?.limits;
  if (!limits) throw new Error(`${stock.baseCoin} is not accepted as loan backing right now.`);
  const all = await fetchHourlyHistory(symbol, calendarStart - 7 * 24 * MS_PER_HOUR, closure.reopenTs + 3 * MS_PER_HOUR);

  const clock = { now: closure.closeTs - 2 * MS_PER_HOUR };
  const visible = (): Candle[] =>
    all
      .filter((c) => c.t <= clock.now)
      .map((c) => (c.t + MS_PER_HOUR > clock.now ? { ...c, high: c.open, low: c.open, close: c.open } : c)); // the hour in progress: only its open is known
  const completed = (): Candle[] => all.filter((c) => c.t + MS_PER_HOUR <= clock.now);

  const lastBefore = [...all].reverse().find((c) => c.t < closure.closeTs)!;
  const backingAmount = BACKING_VALUE_USDT / lastBefore.close;
  let debt = startLtv * BACKING_VALUE_USDT;
  let idleUsdt = IDLE_FRACTION * debt;

  const store = new Store(":memory:");
  const orderId = "SIM-1";
  const ports: Ports = {
    nowMs: () => clock.now,
    simulated: true,
    async loans() {
      return { loans: [{ orderId, loanCoin: "USDT", backingCoin: stock.baseCoin, debt, backingAmount }], problems: [] };
    },
    async idleBalances() {
      return { byCoin: { USDT: idleUsdt, [stock.baseCoin]: 0 } };
    },
    async limits() {
      return limits;
    },
    market: {
      async symbolFor() {
        return symbol;
      },
      async quote(s) {
        const c = completed().at(-1);
        if (!c) throw new Error("no completed candle yet");
        const half = (c.high - c.low) / 2;
        return { symbol: s, last: c.close, bid: c.close - half, ask: c.close + half, snapshotMs: c.t + MS_PER_HOUR };
      },
      async lastTradeMs() {
        const c = [...completed()].reverse().find((x) => (x.volume ?? 0) > 0);
        return c ? c.t + MS_PER_HOUR : null;
      },
      async book() {
        const c = completed().at(-1);
        const traded = c ? c.close * (c.volume ?? 0) : 0;
        const mid = c?.close ?? 0;
        return { bids: [{ price: mid, size: traded / 2 / (mid || 1) }], asks: [{ price: mid, size: traded / 2 / (mid || 1) }], ts: clock.now };
      },
      async history(_s, from, to) {
        return visible().filter((c) => c.t >= from && c.t <= to);
      },
    },
    async announcements() {
      return [];
    },
    exec: new MorrowBitget({
      async call(operationId) {
        // A shadow loan has no liquidation or account records, so reads answer with an empty list. Writes are never sent.
        if ((READ_OPERATIONS as readonly string[]).includes(operationId)) return { code: "00000", data: [] };
        throw new Error("The shadow run never sends anything.");
      },
    }),
    async notify() {},
  };
  updateSettings(store, {
    protectedLoans: [orderId], mode: "auto", maxPerAction: BACKING_VALUE_USDT, maxPerWeekend: BACKING_VALUE_USDT, maxPerMonth: BACKING_VALUE_USDT * 4,
  });
  const deps = { store, ports, advisor: rulesAdvisor, liveActions: false, cache: new ProfileCache(ports) };

  let seenActions = 0;
  const end = closure.reopenTs + (GRADE_DELAY_MINUTES + 30) * 60_000;
  const step = SCHEDULE.nearClosurePollSeconds * 1000 * 30; // every 30 minutes keeps the log readable
  for (; clock.now <= end; clock.now += step) {
    await runCycle(deps);
    const actions = store.allLog().filter((l) => l.kind === "action");
    for (const a of actions.slice(seenActions)) {
      const amount = a.quantity ?? 0;
      debt -= amount;
      idleUsdt -= amount;
    }
    seenActions = actions.length;
  }

  const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");
  const lines: string[] = [];
  lines.push(`# Dry-run log of one closure (simulated)`, "");
  lines.push(`**Everything below is simulated.** Prices are real Bitget hourly prices for ${symbol}. The loan is not real: it is declared here, and every action is a dry run (nothing was sent to Bitget).`, "");
  lines.push(`- Closure: ${iso(closure.closeTs)} to ${iso(closure.reopenTs)} (${closure.closeDate} close, ${closure.reopenDate} reopen)`);
  lines.push(`- Simulated loan: ${BACKING_VALUE_USDT} USDT of ${stock.baseCoin} backing, starting at ${(startLtv * PERCENT).toFixed(0)}% loan health at the close, idle USDT ${(IDLE_FRACTION * PERCENT).toFixed(0)}% of the debt`);
  lines.push(`- Live limits read from Bitget: margin-call level ${(limits.marginCall * PERCENT).toFixed(0)}%, liquidation level ${(limits.liquidation * PERCENT).toFixed(0)}%`);
  lines.push(`- Decision maker: rules only (no model configured). Limits set for the run: up to ${BACKING_VALUE_USDT} USDT per action and weekend`);
  lines.push(`- Price trust in this run uses proxies from the hourly candle, because past spreads and order books are not available: spread = the hour's high-low range, depth = the hour's traded value, last trade = the end of the last hour with volume.`, "");
  lines.push(`## Paper log (timestamp, instrument, direction, price, quantity, balance change)`, "");
  lines.push(`| Time (UTC) | Instrument | Direction | Price | Quantity | Balance change | Label |`, `|---|---|---|---|---|---|---|`);
  for (const l of store.allLog().filter((x) => x.kind === "action")) {
    lines.push(`| ${iso(l.ts)} | ${l.instrument} | ${l.direction} | ${l.price?.toFixed(2)} | ${l.quantity} | ${l.balanceChange} | simulated |`);
  }
  if (!store.allLog().some((x) => x.kind === "action")) lines.push(`| (no action was taken) | | | | | | |`);
  lines.push("", `## Everything Morrow did, in order`, "");
  const log = store.allLog();
  for (let i = 0; i < log.length; ) {
    const l = log[i]!;
    let j = i;
    while (j + 1 < log.length && log[j + 1]!.kind === l.kind && log[j + 1]!.reason === l.reason) j++;
    lines.push(`- ${iso(l.ts)} [${l.kind}] ${l.reason}${j > i ? ` (same result at every check until ${iso(log[j]!.ts)})` : ""}`);
    i = j + 1;
  }
  lines.push("", `## Sealed promise`, "");
  for (const p of store.allPromises()) {
    const b = JSON.parse(p.body) as { projectedHealth: number | null; projectionBasis: string; late: boolean };
    lines.push(`- Fingerprint \`${p.fingerprint}\`, sealed ${iso(p.createdAt)}${b.late ? " (late)" : ""}, projected loan health ${b.projectedHealth === null ? "unavailable" : (b.projectedHealth * PERCENT).toFixed(1) + "%"} (${b.projectionBasis})`);
    if (p.grade) {
      const g = JSON.parse(p.grade) as { kept: boolean | null; priceUsed: number; healthAtGrade: number | null; healthWithNoAction: number | null; wouldHaveHadMarginCall: boolean | null; paidDown: number };
      lines.push(`- Grade at ${iso(p.gradedAt ?? 0)}: ${g.kept === null ? "loan closed" : g.kept ? "**kept**" : "**missed**"}. Price used ${g.priceUsed}. Loan health ${g.healthAtGrade === null ? "n/a" : (g.healthAtGrade * PERCENT).toFixed(1) + "%"}; with no action it would have been ${g.healthWithNoAction === null ? "n/a" : (g.healthWithNoAction * PERCENT).toFixed(1) + "%"}${g.wouldHaveHadMarginCall ? " (a margin call)" : ""}. Paid down ${g.paidDown.toFixed(2)} USDT (simulated).`);
    }
  }
  const text = lines.join("\n") + "\n";
  const out = new URL(`../../../docs/closure-dry-run-${symbol}-${closure.reopenDate}.md`, import.meta.url);
  writeFileSync(out, text);
  console.log(text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
