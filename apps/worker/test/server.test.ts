import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { world } from "./fixtures";
import { runCycle } from "../src/cycle";
import { updateSettings } from "../src/settings";

const servers: Array<{ close(): void }> = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

async function start(token: string | null) {
  const w = world();
  const server = createServer({ ...w.deps, appToken: token, allowedOrigin: "https://app.test", connected: true });
  await new Promise<void>((r) => server.listen(0, r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { w, base };
}

describe("worker server", () => {
  it("serves the public record without a login and never leaks private fields", async () => {
    const { w, base } = await start("secret");
    updateSettings(w.store, { protectedLoans: ["L1"], maxPerAction: 500, maxPerWeekend: 800, maxPerMonth: 2000, mode: "auto" });
    await runCycle(w.deps);
    const res = await fetch(`${base}/public/record`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("debtAtSeal");
    expect(text).not.toContain('"loanId"');
    expect(JSON.parse(text).totals.promises).toBe(1);
  });
  it("closes private routes without the token, and when no token is set", async () => {
    const a = await start("secret");
    expect((await fetch(`${a.base}/api/settings`)).status).toBe(401);
    expect((await fetch(`${a.base}/api/settings`, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    const b = await start(null);
    expect((await fetch(`${b.base}/api/settings`)).status).toBe(503);
  });
  it("changes settings, protects a loan and pauses, with plain errors for bad input", async () => {
    const { base } = await start("secret");
    const h = { authorization: "Bearer secret", "content-type": "application/json" };
    const put = await fetch(`${base}/api/settings`, { method: "PUT", headers: h, body: JSON.stringify({ maxPerAction: 50 }) });
    expect((await put.json()).maxPerAction).toBe(50);
    const bad = await fetch(`${base}/api/settings`, { method: "PUT", headers: h, body: JSON.stringify({ mode: "x" }) });
    expect(bad.status).toBe(400);
    const prot = await fetch(`${base}/api/protect`, { method: "POST", headers: h, body: JSON.stringify({ orderId: "L1", on: true }) });
    expect((await prot.json()).protectedLoans).toEqual(["L1"]);
    const pause = await fetch(`${base}/api/pause`, { method: "POST", headers: h, body: "{}" });
    expect((await pause.json()).paused).toBe(true);
    const un = await fetch(`${base}/api/pause`, { method: "POST", headers: h, body: JSON.stringify({ paused: false }) });
    expect((await un.json()).paused).toBe(false);
  });
  it("lists loans with health, projection and trust", async () => {
    const { base } = await start("secret");
    const r = await fetch(`${base}/api/loans`, { headers: { authorization: "Bearer secret" } });
    const body = await r.json();
    expect(body.loans).toHaveLength(1);
    expect(body.loans[0].health.ratio).toBeCloseTo(0.58);
    expect(body.loans[0].projection.basis).toBe("history_case");
    expect(body.loans[0].trust).toBeDefined();
  });
  it("answers an unknown route with 404", async () => {
    const { base } = await start("secret");
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
