// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ago, amount, countdown, percent, points } from "../src/lib/format";
import { basisWord, kindWord, statusWord, trustReason } from "../src/lib/words";
import { ApiError, getKey, request, setKey } from "../src/lib/api";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("format", () => {
  it("formats percentages, points and amounts", () => {
    expect(percent(0.5834)).toBe("58.3%");
    expect(percent(0.75, 0)).toBe("75%");
    expect(points(0.1)).toBe("10.0 pts");
    expect(amount(1234.5, "USDT")).toBe("1,234.50 USDT");
  });
  it("formats countdowns", () => {
    expect(countdown(0)).toBe("now");
    expect(countdown(-5)).toBe("now");
    expect(countdown(65_000)).toBe("1m 05s");
    expect(countdown(3 * 3_600_000 + 12 * 60_000)).toBe("3h 12m");
    expect(countdown(2 * 86_400_000 + 4 * 3_600_000)).toBe("2d 4h");
  });
  it("says how long ago", () => {
    expect(ago(100_000, 99_000)).toBe("just now");
    expect(ago(600_000, 0)).toBe("10 min ago");
    expect(ago(7_200_000, 0)).toBe("2 h ago");
    expect(ago(172_800_000, 0)).toBe("2 d ago");
  });
});

describe("words", () => {
  it("turns price-trust failures into plain reasons", () => {
    expect(trustReason(["wide_spread"])).toContain("far apart");
    expect(trustReason([])).toBe("");
    expect(trustReason(["something_new"])).toBe("the price could not be checked");
  });
  it("names statuses, bases and actions in plain words", () => {
    expect(statusWord("watch")).toBe("Getting close");
    expect(statusWord("other")).toBe("Unknown");
    expect(basisWord("live_price")).toContain("live weekend price");
    expect(kindWord("pay_down")).toBe("Pay down");
    expect(kindWord("add_backing")).toBe("Add backing");
  });
});

describe("worker client", () => {
  it("stores the key in the browser and notifies listeners", () => {
    const seen = vi.fn();
    window.addEventListener("morrow-key", seen);
    setKey("abc");
    expect(getKey()).toBe("abc");
    setKey(null);
    expect(getKey()).toBeNull();
    expect(seen).toHaveBeenCalledTimes(2);
  });
  it("sends the key and reads JSON", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const out = await request<{ ok: number }>("/api/status", { key: "k", baseUrl: "https://w.test" });
    expect(out.ok).toBe(1);
    const call = f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(call[0]).toBe("https://w.test/api/status");
    expect(call[1].headers["authorization"]).toBe("Bearer k");
  });
  it("turns failures into plain sentences", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "No." }), { status: 401 })));
    await expect(request("/api/x", { key: "bad", baseUrl: "https://w.test" })).rejects.toMatchObject({ message: expect.stringContaining("access key"), status: 401 });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(request("/api/x", { key: "k", baseUrl: "https://w.test" })).rejects.toBeInstanceOf(ApiError);
    await expect(request("/api/x", { key: "k", baseUrl: "https://w.test" })).rejects.toMatchObject({ message: expect.stringContaining("could not reach") });
    await expect(request("/api/x", { key: "k", baseUrl: "" })).rejects.toMatchObject({ message: expect.stringContaining("not linked") });
  });
  it("shows the server's own plain message for a bad request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "mode must be auto or ask" }), { status: 400 })));
    await expect(request("/api/settings", { method: "PUT", body: {}, key: "k", baseUrl: "https://w.test" })).rejects.toMatchObject({ message: "mode must be auto or ask" });
  });
});
