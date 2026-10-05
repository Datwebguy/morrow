import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { rulesAdvisor } from "../src/advisor";
import { ProfileCache } from "../src/assess";
import { runCycle, type Deps } from "../src/cycle";
import { Store } from "../src/db";
import { publicRecord } from "../src/record";
import { createServer } from "../src/server";
import { clearShadow, loadShadow, saveShadow, shadowPorts, ShadowError } from "../src/shadow";
import { COIN, world } from "./fixtures";

const servers: Array<{ close(): void }> = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

function shadowWorld(liveActions = false) {
  const w = world();
  const shadowStore = new Store(":memory:");
  const ports = shadowPorts(w.ports, shadowStore);
  const deps: Deps = { store: shadowStore, ports, advisor: rulesAdvisor, liveActions, cache: new ProfileCache(ports) };
  return { w, shadowStore, ports, deps };
}
const input = { backingCoin: COIN, backingAmount: 10, debt: 580, idleBorrowed: 1000, idleBacking: 0 };
const sent = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.operationId === "repayCoins" || c.operationId === "revisePledge");

describe("shadow ledger", () => {
  it("validates the simulated loan in plain words", () => {
    const { shadowStore } = shadowWorld();
    expect(() => saveShadow(shadowStore, { ...input, debt: 0 })).toThrow(ShadowError);
    expect(() => saveShadow(shadowStore, { ...input, backingCoin: "" })).toThrow(/stock token/);
    expect(() => saveShadow(shadowStore, { ...input, idleBorrowed: -1 })).toThrow(ShadowError);
    expect(loadShadow(shadowStore)).toBeNull();
  });

  it("runs one cycle: simulated promise, simulated action, nothing sent to Bitget", async () => {
    const { w, shadowStore, deps } = shadowWorld();
    saveShadow(shadowStore, input);
    const r = await runCycle(deps);
    expect(r.outcomes[0]?.outcome).toBe("act");
    const action = shadowStore.allLog().find((l) => l.kind === "action")!;
    expect(action.simulated).toBe(true);
    expect(action.direction).toBe("pay down");
    expect(shadowStore.allPromises()[0]?.simulated).toBe(true);
    expect(sent(w)).toHaveLength(0);
  });

  it("stays a preview even if live actions were switched on for the real account", async () => {
    const { w, shadowStore, deps } = shadowWorld(true);
    saveShadow(shadowStore, input);
    await runCycle(deps);
    expect(shadowStore.allLog().some((l) => l.kind === "action" && l.simulated)).toBe(true);
    expect(sent(w)).toHaveLength(0);
  });

  it("applies a previewed pay down to the simulated loan, so the next cycle does not repeat it", async () => {
    const { shadowStore, deps } = shadowWorld();
    saveShadow(shadowStore, input);
    await runCycle(deps);
    const after = loadShadow(shadowStore)!;
    expect(after.debt).toBeLessThan(input.debt);
    expect(after.idleBorrowed).toBeCloseTo(input.idleBorrowed - (input.debt - after.debt));
    const actions = () => shadowStore.allLog().filter((l) => l.kind === "action").length;
    const n = actions();
    await runCycle(deps);
    expect(actions()).toBe(n);
  });

  it("never reads or writes a real account and never messages the user", async () => {
    const { w, shadowStore, deps } = shadowWorld();
    saveShadow(shadowStore, input);
    await runCycle(deps);
    expect(w.calls).toHaveLength(0);
    expect(w.notified).toHaveLength(0);
  });

  it("clearing it stops the run", async () => {
    const { shadowStore, deps } = shadowWorld();
    saveShadow(shadowStore, input);
    clearShadow(shadowStore);
    const r = await runCycle(deps);
    expect(r.outcomes).toHaveLength(0);
  });

  it("appears on the public record as simulated and is never counted in the totals", async () => {
    const { w, shadowStore, deps } = shadowWorld();
    saveShadow(shadowStore, input);
    await runCycle(deps);
    const rec = publicRecord(w.store, shadowStore);
    expect(rec.totals.promises).toBe(0);
    expect(rec.promises).toHaveLength(0);
    expect(rec.simulated).toHaveLength(1);
    expect(rec.simulated[0]?.simulated).toBe(true);
  });
});

describe("shadow routes", () => {
  async function start() {
    const s = shadowWorld();
    const server = createServer({ ...s.w.deps, appToken: "secret", allowedOrigin: "https://app.test", connected: true, shadowStore: s.shadowStore });
    await new Promise<void>((r) => server.listen(0, r));
    servers.push(server);
    return { ...s, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  }
  const h = { authorization: "Bearer secret", "content-type": "application/json" };

  it("needs the token to set the simulated loan, and 400s on bad input", async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/shadow`)).status).toBe(401);
    const bad = await fetch(`${base}/api/shadow`, { method: "PUT", headers: h, body: JSON.stringify({ ...input, debt: "x" }) });
    expect(bad.status).toBe(400);
    const ok = await fetch(`${base}/api/shadow`, { method: "PUT", headers: h, body: JSON.stringify(input) });
    expect((await ok.json()).loan.debt).toBe(580);
    expect((await (await fetch(`${base}/api/shadow`, { method: "DELETE", headers: h })).json()).loan).toBeNull();
  });

  it("publishes the paper log with every row labelled simulated and no private detail", async () => {
    const { base, shadowStore, deps } = await start();
    saveShadow(shadowStore, input);
    await runCycle(deps);
    const body = await (await fetch(`${base}/public/shadow`)).json();
    expect(body.simulated).toBe(true);
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries.every((e: { simulated: boolean }) => e.simulated)).toBe(true);
    expect(Object.keys(body.entries[0])).toEqual(["timestamp", "kind", "instrument", "direction", "price", "quantity", "balanceChange", "reason", "simulated"]);
  });
});
