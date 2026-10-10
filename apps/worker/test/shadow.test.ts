import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { NYSE_CALENDAR, SIMULATION } from "@morrow/config";
import { currentOrNextClosure } from "@morrow/core";
import { rulesAdvisor } from "../src/advisor";
import { ProfileCache } from "../src/assess";
import { runCycle, type Deps } from "../src/cycle";
import { Store } from "../src/db";
import { publicRecord } from "../src/record";
import { createServer } from "../src/server";
import { ensureBook, loadBook, openBook, pickWithHistory, shadowPorts } from "../src/shadow";
import { COIN, LIMITS, world } from "./fixtures";

const servers: Array<{ close(): void }> = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

function shadowWorld(liveActions = false) {
  const w = world();
  const shadowStore = new Store(":memory:");
  const ports = shadowPorts(w.ports, shadowStore);
  const cache = new ProfileCache(ports);
  const deps: Deps = { store: shadowStore, ports, advisor: rulesAdvisor, liveActions, cache };
  return { w, shadowStore, ports, cache, deps };
}
const sent = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.operationId === "repayCoins" || c.operationId === "revisePledge");

describe("shadow ledger: opening the loans", () => {
  it("places each simulated loan between the live start and margin-call levels, on the given tokens, sized from config", async () => {
    const { w, shadowStore } = shadowWorld();
    const book = await openBook(w.ports, shadowStore, [COIN], null);
    expect(book.loans).toHaveLength(SIMULATION.shadowStartPositions.length);
    for (const [i, l] of book.loans.entries()) {
      const want = LIMITS.start + SIMULATION.shadowStartPositions[i]! * (LIMITS.marginCall - LIMITS.start);
      expect(l.startHealth).toBeCloseTo(want, 10);
      expect(l.debt / (l.backingAmount * 100)).toBeCloseTo(want, 3);
      expect(l.idleBorrowed).toBeCloseTo(SIMULATION.idleShareOfDebt * l.debt, 6);
      expect(l.backingCoin).toBe(COIN);
    }
    expect(new Set(book.loans.map((l) => l.id)).size).toBe(book.loans.length);
  });

  it("skips a token Bitget no longer lists instead of inventing a loan", async () => {
    const { w, shadowStore } = shadowWorld();
    const book = await openBook(w.ports, shadowStore, ["rNOPE", COIN], null);
    expect(book.loans.every((l) => l.backingCoin === COIN)).toBe(true);
  });

  it("opens the first set at once, and a fresh set only when a closure's promise window starts", async () => {
    const { w, shadowStore } = shadowWorld();
    const pick = async () => [COIN];
    // A Tuesday: no closure window yet.
    w.state.now = Date.parse("2026-10-06T15:00:00Z");
    expect(await ensureBook(w.ports, shadowStore, pick, currentOrNextClosure(NYSE_CALENDAR, w.state.now))).toBe(true);
    expect(loadBook(shadowStore).closeTs).toBeNull();
    expect(await ensureBook(w.ports, shadowStore, pick, currentOrNextClosure(NYSE_CALENDAR, w.state.now))).toBe(false);
    // Thursday: still no window.
    w.state.now = Date.parse("2026-10-08T15:00:00Z");
    expect(await ensureBook(w.ports, shadowStore, pick, currentOrNextClosure(NYSE_CALENDAR, w.state.now))).toBe(false);
    // Friday 9 Oct, 30 minutes before the 20:00 UTC close: the window is open.
    w.state.now = Date.parse("2026-10-09T19:30:00Z");
    const closure = currentOrNextClosure(NYSE_CALENDAR, w.state.now)!;
    expect(await ensureBook(w.ports, shadowStore, pick, closure)).toBe(true);
    expect(loadBook(shadowStore).closeTs).toBe(closure.closeTs);
    expect(await ensureBook(w.ports, shadowStore, pick, closure)).toBe(false); // once per closure
  });
});

describe("shadow ledger: a cycle", () => {
  it("seals a simulated promise for every loan, acts only where needed, and sends nothing to Bitget", async () => {
    const { w, shadowStore, deps } = shadowWorld();
    await openBook(w.ports, shadowStore, [COIN], null);
    const r = await runCycle(deps);
    expect(r.outcomes).toHaveLength(SIMULATION.shadowStartPositions.length);
    const promises = shadowStore.allPromises();
    expect(promises).toHaveLength(SIMULATION.shadowStartPositions.length);
    expect(promises.every((p) => p.simulated)).toBe(true);
    const acted = shadowStore.allLog().filter((l) => l.kind === "action");
    expect(acted.length).toBeGreaterThan(0);
    expect(acted.length).toBeLessThan(SIMULATION.shadowStartPositions.length); // the safest loan needs nothing
    expect(acted.every((l) => l.simulated)).toBe(true);
    expect(shadowStore.allLog().every((l) => l.simulated)).toBe(true);
    expect(sent(w)).toHaveLength(0);
    expect(w.calls).toHaveLength(0);
    expect(w.notified).toHaveLength(0);
  });

  it("stays a preview even if live actions were switched on for the real account", async () => {
    const { w, shadowStore, deps } = shadowWorld(true);
    await openBook(w.ports, shadowStore, [COIN], null);
    await runCycle(deps);
    expect(shadowStore.allLog().some((l) => l.kind === "action" && l.simulated)).toBe(true);
    expect(sent(w)).toHaveLength(0);
  });

  it("pays each loan down from its own idle balance only, and applies the preview so the next check does not repeat it", async () => {
    const { w, shadowStore, deps } = shadowWorld();
    const opened = await openBook(w.ports, shadowStore, [COIN], null);
    await runCycle(deps);
    const after = loadBook(shadowStore).loans;
    for (const l of after) {
      const was = opened.loans.find((x) => x.id === l.id)!;
      const paid = was.debt - l.debt;
      expect(was.idleBorrowed - l.idleBorrowed).toBeCloseTo(paid, 6);
      expect(l.idleBorrowed).toBeGreaterThanOrEqual(0);
    }
    const n = shadowStore.allLog().filter((l) => l.kind === "action").length;
    await runCycle(deps);
    expect(shadowStore.allLog().filter((l) => l.kind === "action").length).toBe(n);
  });

  it("answers per-loan balance questions from the right loan, and an unknown loan has none", async () => {
    const { w, shadowStore, ports } = shadowWorld();
    const book = await openBook(w.ports, shadowStore, [COIN], null);
    const first = book.loans[0]!;
    expect((await ports.idleBalances(first.id)).byCoin).toEqual({ USDT: first.idleBorrowed, [COIN]: 0 });
    expect((await ports.idleBalances("nope")).byCoin).toEqual({});
  });

  it("appears on the public record as simulated and is never counted in the totals", async () => {
    const { w, shadowStore, deps } = shadowWorld();
    await openBook(w.ports, shadowStore, [COIN], null);
    await runCycle(deps);
    const rec = publicRecord(w.store, shadowStore);
    expect(rec.totals.promises).toBe(0);
    expect(rec.promises).toHaveLength(0);
    expect(rec.simulated).toHaveLength(SIMULATION.shadowStartPositions.length);
    expect(rec.simulated.every((p) => p.simulated)).toBe(true);
  });
});

describe("shadow ledger: public routes", () => {
  async function start() {
    const s = shadowWorld();
    const server = createServer({
      ...s.w.deps, appToken: "secret", allowedOrigin: "https://app.test", connected: true, shadow: { store: s.shadowStore, ports: s.ports, cache: s.cache },
    });
    await new Promise<void>((r) => server.listen(0, r));
    servers.push(server);
    return { ...s, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  }

  it("shows the simulated loans with loan health, the closure, and each loan's latest decision, with no login", async () => {
    const { base, w, shadowStore, deps } = await start();
    await openBook(w.ports, shadowStore, [COIN], null);
    await runCycle(deps);
    const res = await fetch(`${base}/public/shadow`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulated).toBe(true);
    expect(body.closure.reopenTs).toBeGreaterThan(body.closure.closeTs);
    expect(body.loans).toHaveLength(SIMULATION.shadowStartPositions.length);
    for (const l of body.loans) {
      expect(l.simulated).toBe(true);
      expect(l.health.ratio).toBeGreaterThan(0);
      expect(l.lastDecision.reason.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("serves the decision log as JSON and CSV with simulated or live on every row, and no ids", async () => {
    const { base, w, shadowStore, deps } = await start();
    await openBook(w.ports, shadowStore, [COIN], null);
    await runCycle(deps);
    const json = await (await fetch(`${base}/public/log.json`)).json();
    expect(json.rows.length).toBeGreaterThan(0);
    expect(json.rows.every((r: { mode: string }) => r.mode === "simulated" || r.mode === "live")).toBe(true);
    expect(Object.keys(json.rows[0])).toEqual(["timestamp", "kind", "instrument", "direction", "price", "quantity", "balanceChange", "reason", "decidedBy", "mode"]);
    const csv = await fetch(`${base}/public/log.csv`);
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect(csv.headers.get("content-disposition")).toMatch(/attachment/);
    const text = await csv.text();
    expect(text.split("\n")[0]).toBe("timestamp,kind,instrument,direction,price,quantity,balance_change,reason,decided_by,mode");
    expect(text).toMatch(/simulated/);
    expect(text).not.toMatch(/shadow-|-p\d/); // no loan ids
  });
});

describe("shadow ledger: choosing tokens", () => {
  it("skips a token with too little reopening history and keeps the next one that has enough, in trading order", async () => {
    const { w } = shadowWorld();
    const base = w.ports;
    const symbolFor = base.market.symbolFor.bind(base.market);
    // rNEW has a market but no history at all; rXYZ has the fixture's full history; rGONE has no market.
    const market = { ...base.market, symbolFor: async (c: string) => (c === "rNEW" ? "RNEWUSDT" : symbolFor(c)), history: async (s: string, f: number, t: number) => (s === "RNEWUSDT" ? [] : base.market.history(s, f, t)) };
    const probe = { ...base, market };
    const cache = new ProfileCache(probe);
    expect(await pickWithHistory(probe, cache, ["rNEW", "rGONE", COIN], 2)).toEqual([COIN]);
    expect(await pickWithHistory(probe, cache, [COIN, "rNEW"], 1)).toEqual([COIN]);
  });
});
