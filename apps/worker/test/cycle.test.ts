import { describe, expect, it } from "vitest";
import { approve, reject } from "../src/approve";
import type { Advisor } from "../src/advisor";
import { nextDelaySeconds, runCycle } from "../src/cycle";
import { verifySeal } from "../src/promise";
import { publicRecord } from "../src/record";
import { updateSettings } from "../src/settings";
import { SATURDAY, world, pausedHistory, weekendHistory } from "./fixtures";
import { NYSE_CALENDAR } from "@morrow/config";
import { currentOrNextClosure } from "@morrow/core";

const limits = { maxPerAction: 500, maxPerWeekend: 800, maxPerMonth: 2000 };

function protect(w: ReturnType<typeof world>, extra: Record<string, unknown> = {}): void {
  updateSettings(w.store, { protectedLoans: ["L1"], ...limits, ...extra });
}

describe("a cycle during a closure", () => {
  it("seals one promise before acting and never writes twice", async () => {
    const w = world();
    protect(w, { mode: "auto" });
    const r1 = await runCycle(w.deps);
    expect(r1.outcomes[0]?.outcome).toBe("act");
    const promises = w.store.allPromises();
    expect(promises).toHaveLength(1);
    expect(verifySeal(promises[0]!.body, promises[0]!.fingerprint)).toBe(true);
    const promiseLog = w.store.allLog().findIndex((l) => l.kind === "promise");
    const actionLog = w.store.allLog().findIndex((l) => l.kind === "action");
    expect(promiseLog).toBeGreaterThanOrEqual(0);
    expect(promiseLog).toBeLessThan(actionLog);
    await runCycle(w.deps);
    expect(w.store.allPromises()).toHaveLength(1);
  });

  it("is a dry run unless the owner says go live: nothing is sent", async () => {
    const w = world({ liveActions: false });
    protect(w, { mode: "auto" });
    await runCycle(w.deps);
    expect(w.calls.filter((c) => c.operationId === "repayCoins" || c.operationId === "revisePledge")).toHaveLength(0);
    const action = w.store.allLog().find((l) => l.kind === "action")!;
    expect(action.direction).toBe("pay down");
    expect(action.simulated).toBe(true);
    expect(action.quantity).toBeGreaterThan(0);
    expect(action.price).toBeCloseTo(100);
    expect(action.balanceChange).toMatch(/^-[\d.]+ USDT$/);
  });

  it("when live, pays down only with the borrowed coin", async () => {
    const w = world({ liveActions: true });
    protect(w, { mode: "auto" });
    await runCycle(w.deps);
    const writes = w.calls.filter((c) => c.operationId === "repayCoins");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.args).toMatchObject({ method: "borrowed_coin", repayAll: "no", repayUnlock: "no", orderId: "L1" });
    expect(w.calls.some((c) => c.operationId === "revisePledge")).toBe(false);
  });

  it("asks first by default: proposes, sends nothing, then sends only after Approve", async () => {
    const w = world({ liveActions: true });
    protect(w); // default mode is ask
    const r = await runCycle(w.deps);
    expect(r.outcomes[0]?.outcome).toBe("propose");
    expect(w.calls.filter((c) => c.operationId === "repayCoins")).toHaveLength(0);
    const pending = w.store.pendingApprovals("L1");
    expect(pending).toHaveLength(1);
    await runCycle(w.deps);
    expect(w.store.pendingApprovals("L1")).toHaveLength(1); // not duplicated
    const res = await approve({ ...w.deps }, pending[0]!.id);
    expect(res.ok).toBe(true);
    expect(w.calls.filter((c) => c.operationId === "repayCoins")).toHaveLength(1);
    expect(w.store.getApproval(pending[0]!.id)?.status).toBe("approved");
    expect((await approve({ ...w.deps }, pending[0]!.id)).ok).toBe(false);
  });

  it("rejecting sends nothing", async () => {
    const w = world({ liveActions: true });
    protect(w);
    await runCycle(w.deps);
    const id = w.store.pendingApprovals()[0]!.id;
    expect(reject(w.store, id, SATURDAY).ok).toBe(true);
    expect(w.calls.filter((c) => c.operationId === "repayCoins")).toHaveLength(0);
  });

  it("an approval is checked again against fresh data and refused if the market moved back", async () => {
    const w = world({ liveActions: true });
    protect(w);
    await runCycle(w.deps);
    const id = w.store.pendingApprovals()[0]!.id;
    w.state.loans = [{ orderId: "L1", loanCoin: "USDT", backingCoin: "rXYZ", debt: 100, backingAmount: 10 }];
    const res = await approve({ ...w.deps }, id);
    expect(res.ok).toBe(false);
    expect(w.calls.filter((c) => c.operationId === "repayCoins")).toHaveLength(0);
  });

  it("Pause all stops every action instantly", async () => {
    const w = world({ liveActions: true });
    protect(w, { mode: "auto", paused: true });
    const r = await runCycle(w.deps);
    expect(r.outcomes[0]?.outcome).toBe("paused");
    expect(w.calls.filter((c) => c.operationId === "repayCoins")).toHaveLength(0);
  });

  it("does nothing until the user sets limits", async () => {
    const w = world({ liveActions: true });
    updateSettings(w.store, { protectedLoans: ["L1"], mode: "auto" });
    const r = await runCycle(w.deps);
    expect(r.outcomes[0]?.outcome).toBe("alert");
    expect(w.calls.filter((c) => c.operationId === "repayCoins")).toHaveLength(0);
    expect(w.store.allLog().some((l) => l.kind === "alert" && l.reason.includes("Set your limits"))).toBe(true);
  });

  it("refuses an AI choice that does not match what is needed", async () => {
    const wrong: Advisor = { async choose() { return { action: "add_backing", reason: "Add more.", by: "test" }; } };
    const w = world({ liveActions: true, advisor: wrong });
    protect(w, { mode: "auto", allowed: ["pay_down", "add_backing"] });
    w.state.balances = { USDT: 1000, rXYZ: 0 };
    const r = await runCycle(w.deps);
    expect(r.outcomes[0]?.outcome).toBe("refused");
    expect(w.calls.filter((c) => c.operationId === "revisePledge" || c.operationId === "repayCoins")).toHaveLength(0);
  });

  it("never acts when the price data is too old", async () => {
    const w = world({ liveActions: true });
    protect(w, { mode: "auto" });
    w.state.quoteAgeMs = 10 * 60_000;
    const r = await runCycle(w.deps);
    expect(r.outcomes[0]?.outcome).toBe("refused");
    expect(r.outcomes[0]?.reason).toContain("too old");
    expect(w.calls.filter((c) => c.operationId === "repayCoins")).toHaveLength(0);
  });

  it("a token that trades through closures is projected from its trusted live weekend price", async () => {
    const w = world({ history: weekendHistory(Date.parse("2026-10-02T00:00:00Z")) });
    protect(w, { mode: "auto" });
    w.state.bid = 96.9;
    w.state.ask = 97.1; // 3% below the close: within what this stock has done before
    const r = await runCycle(w.deps);
    const entry = w.store.allLog().find((l) => l.kind === "action");
    expect(r.outcomes[0]?.outcome).toBe("act");
    expect((entry!.detail as { decision: { proposal: { price: number } } }).decision.proposal.price).toBeCloseTo(97, 0);
  });

  it("falls back to the stock's own history when the weekend price is not trusted", async () => {
    const w = world({ history: weekendHistory(Date.parse("2026-10-02T00:00:00Z")) });
    protect(w, { mode: "auto" });
    w.state.bid = 80;
    w.state.ask = 80.1; // a 20% move: far beyond anything this stock has done at a reopen
    await runCycle(w.deps);
    const view = (await (async () => {
      const { assessLoan } = await import("../src/assess");
      const { currentOrNextClosure: c } = await import("@morrow/core");
      const { loadSettings } = await import("../src/settings");
      return assessLoan(w.ports, w.deps.cache, w.state.loans[0]!, loadSettings(w.store), c(NYSE_CALENDAR, SATURDAY));
    })());
    expect(view.trust?.trusted).toBe(false);
    expect(view.projection?.basis).toBe("history_case");
  });

  it("the AI can choose to do nothing", async () => {
    const calm: Advisor = { async choose() { return { action: "none", reason: "Looks like noise.", by: "test" }; } };
    const w = world({ liveActions: true, advisor: calm });
    protect(w, { mode: "auto" });
    const r = await runCycle(w.deps);
    expect(r.outcomes[0]?.outcome).toBe("no_action");
    expect(w.calls.filter((c) => c.operationId === "repayCoins")).toHaveLength(0);
  });

  it("never acts on a loan it cannot read or a price that is too old", async () => {
    const w = world({ liveActions: true });
    protect(w, { mode: "auto" });
    w.state.loans = [];
    expect((await runCycle(w.deps)).outcomes[0]?.outcome).toBe("unreadable");
    expect(w.calls.filter((c) => c.operationId === "repayCoins")).toHaveLength(0);
  });

  it("leaves a safe loan alone and writes no action", async () => {
    const w = world({ liveActions: true });
    protect(w, { mode: "auto" });
    w.state.loans = [{ orderId: "L1", loanCoin: "USDT", backingCoin: "rXYZ", debt: 200, backingAmount: 10 }];
    const r = await runCycle(w.deps);
    expect(r.outcomes[0]?.outcome).toBe("safe");
    expect(w.store.allLog().some((l) => l.kind === "action")).toBe(false);
  });

  it("respects the weekend limit across cycles", async () => {
    const w = world({ liveActions: true });
    protect(w, { mode: "auto", maxPerAction: 500, maxPerWeekend: 1, maxPerMonth: 2000 });
    await runCycle(w.deps);
    expect(w.calls.filter((c) => c.operationId === "repayCoins")).toHaveLength(0);
  });

  it("sends a Telegram message only when the user has chosen one", async () => {
    const calm: Advisor = { async choose() { return { action: "alert", reason: "Watch it.", by: "test" }; } };
    const w = world({ advisor: calm });
    protect(w, { mode: "auto", telegramChatId: "42" });
    await runCycle(w.deps);
    expect(w.notified.length).toBe(1);
    expect(w.store.allLog().some((l) => l.kind === "alert")).toBe(true);
  });

  it("labels every entry simulated in a shadow run and keeps them out of the public totals", async () => {
    const w = world({ simulated: true });
    protect(w, { mode: "auto" });
    await runCycle(w.deps);
    expect(w.store.allLog().every((l) => l.simulated)).toBe(true);
    const rec = publicRecord(w.store);
    expect(rec.totals.promises).toBe(0);
    expect(rec.simulated.length).toBe(1);
  });
});

describe("grading", () => {
  it("grades 30 minutes after the open and counts what was avoided", async () => {
    const w = world({ history: pausedHistory(Date.parse("2026-10-02T00:00:00Z")) });
    protect(w, { mode: "auto" });
    await runCycle(w.deps);
    expect(w.store.allPromises()[0]?.grade).toBeNull();
    const closure = currentOrNextClosure(NYSE_CALENDAR, SATURDAY)!;
    // The market reopens 12% lower. Without action the loan would be past the margin-call level.
    const history = pausedHistory(Date.parse("2026-10-02T00:00:00Z"));
    const reopenHour = Math.ceil((closure.reopenTs + 30 * 60_000) / 3_600_000) * 3_600_000;
    const at = history.findIndex((c) => c.t === reopenHour);
    history[at] = { t: reopenHour, open: 88, high: 88, low: 88, close: 88, volume: 10 };
    const w2 = world({ history });
    protect(w2, { mode: "auto" });
    await runCycle(w2.deps);
    w2.state.now = closure.reopenTs + 31 * 60_000;
    w2.state.loans = [{ orderId: "L1", loanCoin: "USDT", backingCoin: "rXYZ", debt: 580 - w2.store.spentForClosure(closure.closeTs), backingAmount: 10 }];
    const r = await runCycle(w2.deps);
    expect(r.graded).toBe(1);
    const row = w2.store.allPromises()[0]!;
    const grade = JSON.parse(row.grade!);
    expect(grade.priceUsed).toBe(88);
    expect(grade.healthWithNoAction).toBeCloseTo(580 / (10 * 88));
    expect(grade.wouldHaveHadMarginCall).toBe(true);
    expect(typeof grade.kept).toBe("boolean");
    const rec = publicRecord(w2.store);
    expect(rec.totals.graded).toBe(1);
    expect(JSON.stringify(rec)).not.toContain("debtAtSeal");
  });

  it("does not grade before the grade time", async () => {
    const w = world();
    protect(w, { mode: "auto" });
    await runCycle(w.deps);
    const closure = currentOrNextClosure(NYSE_CALENDAR, SATURDAY)!;
    w.state.now = closure.reopenTs + 10 * 60_000;
    expect((await runCycle(w.deps)).graded).toBe(0);
  });

  it("marks a promise missed when the loan was liquidated", async () => {
    const w = world();
    protect(w, { mode: "auto" });
    await runCycle(w.deps);
    const closure = currentOrNextClosure(NYSE_CALENDAR, SATURDAY)!;
    w.state.now = closure.reopenTs + 31 * 60_000;
    w.state.reduces = [{ orderId: "L1", status: "COMPLETE" }];
    w.state.loans = [];
    await runCycle(w.deps);
    const grade = JSON.parse(w.store.allPromises()[0]!.grade ?? "null");
    expect(grade.liquidated).toBe(true);
    expect(grade.kept).toBe(false);
  });

  it("marks a promise as closed (not kept, not missed) when the user closed the loan", async () => {
    const w = world();
    protect(w, { mode: "auto" });
    await runCycle(w.deps);
    const closure = currentOrNextClosure(NYSE_CALENDAR, SATURDAY)!;
    w.state.now = closure.reopenTs + 31 * 60_000;
    w.state.loans = [];
    await runCycle(w.deps);
    const grade = JSON.parse(w.store.allPromises()[0]!.grade ?? "null");
    expect(grade.status).toBe("loan_closed");
    expect(grade.kept).toBeNull();
  });
});

describe("run-up actions", () => {
  it("credits an action taken before sealing to the closure's promise and grades against the loan before it", async () => {
    const w = world();
    protect(w, { mode: "auto" });
    const closure = currentOrNextClosure(NYSE_CALENDAR, SATURDAY)!;
    w.state.now = closure.closeTs - 2 * 3_600_000; // market open, two hours before the close
    const r1 = await runCycle(w.deps);
    expect(r1.outcomes[0]?.outcome).toBe("act");
    const paid = w.store.allLog().find((l) => l.kind === "action")!.quantity!;
    expect(w.store.allPromises()).toHaveLength(0);
    w.state.loans = [{ orderId: "L1", loanCoin: "USDT", backingCoin: "rXYZ", debt: 580 - paid, backingAmount: 10 }];
    w.state.now = closure.closeTs - 30 * 60_000; // inside the promise window
    await runCycle(w.deps);
    const row = w.store.allPromises()[0]!;
    expect(JSON.parse(row.actions)).toHaveLength(1);
    expect(JSON.parse(row.body).debtAtSeal).toBeCloseTo(580);
  });
});

describe("schedule", () => {
  it("checks more often near a closure", () => {
    const c = currentOrNextClosure(NYSE_CALENDAR, SATURDAY)!;
    expect(nextDelaySeconds(SATURDAY, c)).toBeLessThan(nextDelaySeconds(c.closeTs - 24 * 3_600_000, c));
  });
});
