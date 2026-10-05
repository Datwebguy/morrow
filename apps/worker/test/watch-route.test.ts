import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { COIN, pausedHistory, world } from "./fixtures";

const AFTER = Date.parse("2026-10-06T00:00:00Z");
const servers: Array<{ close(): void }> = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

async function start() {
  const w = world({ history: pausedHistory(AFTER) });
  w.state.now = AFTER;
  const server = createServer({ ...w.deps, appToken: "secret", allowedOrigin: "https://app.test", connected: true });
  await new Promise<void>((r) => server.listen(0, r));
  servers.push(server);
  return { w, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe("watch a weekend: public route", () => {
  it("replays a weekend with no login, labelled simulated, and sends nothing", async () => {
    const { w, base } = await start();
    const res = await fetch(`${base}/public/watch?token=${COIN}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json();
    expect(body.label).toBe("Simulated loan, real prices");
    expect(body.steps.map((s: { id: string }) => s.id)).toContain("grade");
    expect(w.calls).toHaveLength(0);
  });

  it("takes the visitor's own numbers, and gives plain 400s for bad input or an unlisted token", async () => {
    const { base } = await start();
    const mine = await (await fetch(`${base}/public/watch?token=${COIN}&backing=10&borrowed=580`)).json();
    expect(mine.loan.basis).toBe("yours");
    expect((await fetch(`${base}/public/watch?token=`)).status).toBe(400);
    expect((await fetch(`${base}/public/watch?token=${COIN}&backing=-1&borrowed=5`)).status).toBe(400);
    const nope = await fetch(`${base}/public/watch?token=rNOPE`);
    expect(nope.status).toBe(400);
    expect((await nope.json()).error).toMatch(/does not list/);
  });

  it("reuses a finished replay, and limits how many different replays one address can start a minute", async () => {
    const { base } = await start();
    for (let i = 0; i < 12; i++) expect((await fetch(`${base}/public/watch?token=${COIN}`)).status).toBe(200); // same request: cached, not counted
    const statuses: number[] = [];
    for (let i = 1; i <= 10; i++) statuses.push((await fetch(`${base}/public/watch?token=${COIN}&backing=10&borrowed=${500 + i}`)).status);
    expect(statuses).toContain(429);
  });

  it("names the featured closure from the replay data, or null when there is none", async () => {
    const { base } = await start();
    const f = await (await fetch(`${base}/public/watch/featured`)).json();
    expect(f).toHaveProperty("featured");
  });
});
