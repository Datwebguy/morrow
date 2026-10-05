import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { checkLoan, CheckError, parseCheckInput, RateLimiter } from "../src/check";
import { createServer } from "../src/server";
import { COIN, world } from "./fixtures";

const servers: Array<{ close(): void }> = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

describe("check my loan: input", () => {
  it("accepts the three numbers, with commas and spaces", () => {
    expect(parseCheckInput({ token: ` ${COIN} `, backingAmount: "1,000.5", borrowed: 600 })).toEqual({ backingCoin: COIN, backingAmount: 1000.5, debt: 600 });
  });
  it("refuses a missing token, zero, negative, text and typing slips, in plain words", () => {
    expect(() => parseCheckInput({ token: "", backingAmount: 1, borrowed: 1 })).toThrow(CheckError);
    expect(() => parseCheckInput({ token: COIN, backingAmount: 0, borrowed: 1 })).toThrow(/Backing amount/);
    expect(() => parseCheckInput({ token: COIN, backingAmount: 1, borrowed: -5 })).toThrow(/Amount borrowed/);
    expect(() => parseCheckInput({ token: COIN, backingAmount: "abc", borrowed: 1 })).toThrow(CheckError);
    expect(() => parseCheckInput({ token: COIN, backingAmount: 1e15, borrowed: 1 })).toThrow(/too large/);
    expect(() => parseCheckInput({ token: "../etc", backingAmount: 1, borrowed: 1 })).toThrow(CheckError);
  });
});

describe("check my loan: result", () => {
  it("works out health, distances, the projection and the smallest action from live data, assuming no balance cap", async () => {
    const w = world();
    const r = await checkLoan(w.ports, w.deps.cache, { backingCoin: COIN, backingAmount: 10, debt: 580 });
    expect(r.health?.ratio).toBeCloseTo(0.58);
    expect(r.health?.distanceToMarginCall).toBeCloseTo(0.02);
    expect(r.health?.marginCallLevel).toBe(0.6);
    expect(r.projection?.basis).toBe("history_case");
    expect(r.projection!.ratio).toBeGreaterThan(r.health!.ratio);
    expect(r.history?.closures).toBeGreaterThan(0);
    expect(r.suggestion).not.toBeNull();
    expect(r.suggestion!.payDown).toBeGreaterThan(0);
    expect(r.suggestion!.ratioAfter).toBeLessThanOrEqual(r.suggestion!.targetRatio + 1e-9);
    expect(r.problems).toEqual([]);
  });
  it("suggests nothing for a loan that is far from the margin-call level", async () => {
    const w = world();
    const r = await checkLoan(w.ports, w.deps.cache, { backingCoin: COIN, backingAmount: 10, debt: 300 });
    expect(r.suggestion).toBeNull();
    expect(r.projection?.status).toBe("safe");
  });
  it("says so plainly for a token Bitget does not list, and shows no numbers", async () => {
    const w = world();
    const r = await checkLoan(w.ports, w.deps.cache, { backingCoin: "rNOPE", backingAmount: 10, debt: 300 });
    expect(r.health).toBeNull();
    expect(r.projection).toBeNull();
    expect(r.problems[0]).toMatch(/does not list limits/);
  });
  it("never reads an account", async () => {
    const w = world();
    await checkLoan(w.ports, w.deps.cache, { backingCoin: COIN, backingAmount: 10, debt: 580 });
    expect(w.calls).toHaveLength(0);
  });
});

describe("check my loan: public route", () => {
  async function start(opts: { tokens?: Array<{ coin: string; name: string | null }> | "fail" } = {}) {
    const w = world();
    const tokens = opts.tokens ?? [{ coin: COIN, name: null }];
    const server = createServer({
      ...w.deps, appToken: "secret", allowedOrigin: "https://app.test", connected: true,
      listTokens: async () => (tokens === "fail" ? Promise.reject(new Error("down")) : tokens),
    });
    await new Promise<void>((r) => server.listen(0, r));
    servers.push(server);
    return { w, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  }
  const post = (base: string, body: unknown) => fetch(`${base}/public/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("answers with no login and stores nothing", async () => {
    const { w, base } = await start();
    const res = await post(base, { token: COIN, backingAmount: 10, borrowed: 580 });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json();
    expect(body.health.ratio).toBeCloseTo(0.58);
    expect(w.store.allLog()).toHaveLength(0);
    expect(w.store.allPromises()).toHaveLength(0);
    expect(w.store.getSetting("user_settings")).toBeNull();
  });
  it("allows the browser preflight from any site for public routes only", async () => {
    const { base } = await start();
    const pub = await fetch(`${base}/public/check`, { method: "OPTIONS" });
    expect(pub.headers.get("access-control-allow-origin")).toBe("*");
    const priv = await fetch(`${base}/api/settings`, { method: "OPTIONS" });
    expect(priv.headers.get("access-control-allow-origin")).toBe("https://app.test");
  });
  it("gives a plain 400 for bad input and a plain 503 when Bitget data is down", async () => {
    const { base } = await start();
    const bad = await post(base, { token: COIN, backingAmount: -1, borrowed: 5 });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/above zero/);
  });
  it("lists the live token list, or says it is unavailable", async () => {
    const ok = await start({ tokens: [{ coin: "rA", name: "Alpha Inc." }, { coin: "rB", name: null }] });
    expect((await (await fetch(`${ok.base}/public/check/tokens`)).json()).tokens).toEqual([{ coin: "rA", name: "Alpha Inc." }, { coin: "rB", name: null }]);
    const down = await start({ tokens: "fail" });
    expect((await fetch(`${down.base}/public/check/tokens`)).status).toBe(503);
  });
  it("limits how often one address can check", async () => {
    const { base } = await start();
    let last = 200;
    for (let i = 0; i < 25; i++) last = (await post(base, { token: COIN, backingAmount: 10, borrowed: 300 })).status;
    expect(last).toBe(429);
  });
});

describe("rate limiter", () => {
  it("counts per address inside a minute and resets after it", () => {
    let t = 0;
    const l = new RateLimiter(2, () => t);
    expect([l.allow("a"), l.allow("a"), l.allow("a"), l.allow("b")]).toEqual([true, true, false, true]);
    t += 60_000;
    expect(l.allow("a")).toBe(true);
  });
});
