import { describe, expect, it } from "vitest";
import { anthropicAdvisor, advisorFor, modelAdvisor, modelConfigFromEnv, parseChoice, rulesAdvisor, type Situation } from "../src/advisor";
import { parseBalances, parseLoans } from "../src/loans";
import { canonicalJson, seal, sizeBand, verifySeal, type PromiseBody } from "../src/promise";
import { Store } from "../src/db";
import { DEFAULT_SETTINGS, loadSettings, SettingsError, updateSettings } from "../src/settings";

const body: PromiseBody = {
  version: 1, loanId: "L1", loanCoin: "USDT", backingCoin: "rXYZ", claim: "stays_below_margin_call_at_reopen", marginCallLevel: 0.6, targetLevel: 0.5,
  plannedAction: null, projectedHealth: 0.4, projectionBasis: "history_case", closeTs: 1, reopenTs: 2, sealedAt: 0, late: false, debtAtSeal: 500, backingAtSeal: 10,
};

describe("sealed promise", () => {
  it("is stable whatever the key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(seal(body)).toBe(seal({ ...body }));
    expect(seal(body)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes if anything is edited", () => {
    expect(seal({ ...body, targetLevel: 0.51 })).not.toBe(seal(body));
    expect(seal({ ...body, plannedAction: { kind: "pay_down", amount: 1 } })).not.toBe(seal(body));
  });
  it("verifies and detects tampering", () => {
    const f = seal(body);
    expect(verifySeal(JSON.stringify(body), f)).toBe(true);
    expect(verifySeal(JSON.stringify({ ...body, debtAtSeal: 1 }), f)).toBe(false);
  });
  it("gives size bands", () => {
    expect(sizeBand(500)).toBe("under 1,000 USDT");
    expect(sizeBand(7_000)).toBe("5,000 to 25,000 USDT");
    expect(sizeBand(10_000_000)).toBe("over 100,000 USDT");
  });
});

describe("settings", () => {
  it("starts safe: ask first, no limits, nothing protected", () => {
    const s = loadSettings(new Store(":memory:"));
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.mode).toBe("ask");
    expect(s.maxPerAction).toBeNull();
    expect(s.protectedLoans).toEqual([]);
  });
  it("saves valid changes and refuses bad ones", () => {
    const store = new Store(":memory:");
    expect(updateSettings(store, { mode: "auto", maxPerAction: 100, paused: true }).mode).toBe("auto");
    expect(loadSettings(store).maxPerAction).toBe(100);
    expect(() => updateSettings(store, { mode: "yolo" })).toThrow(SettingsError);
    expect(() => updateSettings(store, { maxPerAction: -1 })).toThrow(SettingsError);
    expect(() => updateSettings(store, { allowed: ["sell"] })).toThrow(SettingsError);
    expect(() => updateSettings(store, { protectedLoans: [1] })).toThrow(SettingsError);
    expect(updateSettings(store, { maxPerAction: null }).maxPerAction).toBeNull();
  });
});

describe("loan parsing", () => {
  it("reads a loan answer", () => {
    const r = parseLoans({ code: "00000", data: [{ orderId: 7, loanCoin: "USDT", pledgeCoin: "rXYZ", debt: "100.5", pledgeAmount: "3" }] });
    expect(r.loans).toEqual([{ orderId: "7", loanCoin: "USDT", backingCoin: "rXYZ", debt: 100.5, backingAmount: 3 }]);
    expect(r.problems).toEqual([]);
  });
  it("finds a list inside the answer", () => {
    const r = parseLoans({ data: { rows: [{ orderId: "1", loanCoin: "USDT", pledgeCoin: "rXYZ", debt: "1", pledgeAmount: "1" }] } });
    expect(r.loans).toHaveLength(1);
  });
  it("refuses to guess when a value is missing", () => {
    const r = parseLoans({ data: [{ orderId: "1", loanCoin: "USDT", pledgeCoin: "rXYZ", debt: "1" }, { loanCoin: "USDT" }] });
    expect(r.loans).toEqual([]);
    expect(r.problems).toHaveLength(2);
  });
  it("reports an unreadable answer", () => {
    expect(parseLoans("nope").problems).toHaveLength(1);
    expect(parseLoans(null).loans).toEqual([]);
  });
  it("reads balances and reports unreadable ones", () => {
    expect(parseBalances({ data: [{ coin: "USDT", available: "12.5" }, { coin: "USDT", available: "1" }] }).byCoin).toEqual({ USDT: 13.5 });
    expect(parseBalances(7).byCoin).toBeNull();
  });
});

describe("advisor", () => {
  const sit = { plan: { kind: "pay_down", amount: 5 } } as unknown as Situation;
  it("parses a clear answer and turns anything else into an alert", () => {
    expect(parseChoice('Sure: {"action":"pay_down","reason":"Too close."}', "m")).toEqual({ action: "pay_down", reason: "Too close.", by: "m" });
    expect(parseChoice("pay down!", "m").action).toBe("alert");
    expect(parseChoice('{"action":"sell","reason":"x"}', "m").action).toBe("alert");
    expect(parseChoice('{"action":"none","reason":""}', "m").action).toBe("alert");
  });
  it("calls a chat-completions endpoint", async () => {
    let seen = "";
    const a = modelAdvisor({ provider: "openai-compatible", baseUrl: "https://x.test/v1/", model: "m1", apiKey: "k" }, async (url, init) => {
      seen = url + init.body;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"action":"alert","reason":"Watch it."}' } }] }) };
    });
    expect(await a.choose(sit)).toEqual({ action: "alert", reason: "Watch it.", by: "m1" });
    expect(seen).toContain("https://x.test/v1/chat/completions");
  });
  it("only alerts when the model cannot be reached", async () => {
    const a = modelAdvisor({ provider: "openai-compatible", baseUrl: "https://x.test", model: "m1", apiKey: "k" }, async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect((await a.choose(sit)).action).toBe("alert");
  });
  it("rules only accepts the code plan and says so", async () => {
    expect(await rulesAdvisor.choose(sit)).toMatchObject({ action: "pay_down", by: "rules only" });
    expect((await rulesAdvisor.choose({ plan: null } as unknown as Situation)).action).toBe("none");
  });
});

describe("model settings", () => {
  const sit = { plan: { kind: "pay_down", amount: 5 } } as unknown as Situation;
  const gemini = { LLM_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai/", LLM_MODEL: "model-a", LLM_API_KEY: "k" };
  it("reads the three LLM variables, and needs all three", () => {
    expect(modelConfigFromEnv(gemini)).toEqual({ provider: "openai-compatible", baseUrl: gemini.LLM_BASE_URL, model: "model-a", apiKey: "k" });
    expect(modelConfigFromEnv({ ...gemini, LLM_API_KEY: "" })).toBeNull();
    expect(modelConfigFromEnv({})).toBeNull();
  });
  it("still accepts the older MODEL_* names, and LLM_* wins when both are set", () => {
    expect(modelConfigFromEnv({ MODEL_BASE_URL: "https://old.test/v1", MODEL_NAME: "old", MODEL_API_KEY: "o" })).toEqual({ provider: "openai-compatible", baseUrl: "https://old.test/v1", model: "old", apiKey: "o" });
    expect(modelConfigFromEnv({ ...gemini, MODEL_NAME: "old", MODEL_BASE_URL: "https://old.test", MODEL_API_KEY: "o" })?.model).toBe("model-a");
  });
  it("switching provider is only a change of those variables: the same request goes to the new base URL and model", async () => {
    const seen: Array<{ url: string; model: string; auth: string }> = [];
    for (const env of [gemini, { LLM_BASE_URL: "https://other.test/v1", LLM_MODEL: "model-b", LLM_API_KEY: "k2" }]) {
      const cfg = modelConfigFromEnv(env)!;
      await modelAdvisor(cfg, async (url, init) => {
        seen.push({ url, model: JSON.parse(init.body).model, auth: init.headers["authorization"] ?? "" });
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"action":"none","reason":"ok"}' } }] }) };
      }).choose(sit);
    }
    expect(seen).toEqual([
      { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "model-a", auth: "Bearer k" },
      { url: "https://other.test/v1/chat/completions", model: "model-b", auth: "Bearer k2" },
    ]);
  });
  it("a network failure, a timeout or a broken answer becomes an alert, never an action or a crash", async () => {
    const cfg = { provider: "openai-compatible" as const, baseUrl: "https://x.test", model: "m", apiKey: "k" };
    expect((await modelAdvisor(cfg, async () => Promise.reject(new Error("timeout"))).choose(sit)).action).toBe("alert");
    expect((await modelAdvisor(cfg, async () => ({ ok: true, status: 200, json: async () => Promise.reject(new Error("bad json")) })).choose(sit)).action).toBe("alert");
  });
});

describe("Anthropic as the model", () => {
  const sit = { plan: { kind: "pay_down", amount: 5 } } as unknown as Situation;
  const reply = (over: Record<string, unknown>) => ({ stop_reason: "end_turn", content: [{ type: "text", text: '{"action":"pay_down","reason":"Loan health is too close."}' }], ...over }) as never;

  it("is chosen by LLM_PROVIDER, by an Anthropic key, or by Anthropic's address, with a default model and no address needed", () => {
    const want = { provider: "anthropic", baseUrl: "", model: "claude-sonnet-5-5", apiKey: "sk-ant-x" };
    expect(modelConfigFromEnv({ LLM_API_KEY: "sk-ant-x" })).toEqual(want);
    expect(modelConfigFromEnv({ LLM_PROVIDER: "anthropic", LLM_API_KEY: "k", LLM_MODEL: "claude-opus-5-5" })).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5" });
    expect(modelConfigFromEnv({ LLM_BASE_URL: "https://api.anthropic.com/v1/", LLM_API_KEY: "k" })).toMatchObject({ provider: "anthropic", baseUrl: "" });
    expect(modelConfigFromEnv({ LLM_PROVIDER: "anthropic" })).toBeNull(); // no key
  });

  it("ignores a leftover Gemini address and model name when the key is Anthropic's", () => {
    const left = { LLM_API_KEY: "sk-ant-x", LLM_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai/", LLM_MODEL: "gemini-3.8-flash" };
    expect(modelConfigFromEnv(left)).toEqual({ provider: "anthropic", baseUrl: "", model: "claude-sonnet-5-5", apiKey: "sk-ant-x" });
  });

  it("ignores the other provider's leftover address and model when switching, and an empty value counts as not set", () => {
    const env = { LLM_PROVIDER: "anthropic", LLM_API_KEY: "sk-ant-x", LLM_BASE_URL: "", LLM_MODEL: "" };
    expect(modelConfigFromEnv(env)).toEqual({ provider: "anthropic", baseUrl: "", model: "claude-sonnet-5-5", apiKey: "sk-ant-x" });
  });

  it("asks Claude for the one-word choice with the official request shape: no sampling settings, medium effort, refusal fallback", async () => {
    let seen: Record<string, unknown> = {};
    const a = anthropicAdvisor({ provider: "anthropic", baseUrl: "", model: "claude-sonnet-5-5", apiKey: "k" }, async (p) => {
      seen = p as unknown as Record<string, unknown>;
      return reply({});
    });
    expect(await a.choose(sit)).toEqual({ action: "pay_down", reason: "Loan health is too close.", by: "claude-sonnet-5-5" });
    expect(seen).toMatchObject({ model: "claude-sonnet-5-5", output_config: { effort: "medium" }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(seen).not.toHaveProperty("temperature");
    expect(seen).not.toHaveProperty("thinking");
    expect(JSON.stringify(seen["messages"])).toContain("pay_down");
  });

  it("reads only the text blocks, so thinking blocks are ignored", async () => {
    const a = anthropicAdvisor({ provider: "anthropic", baseUrl: "", model: "m", apiKey: "k" }, async () =>
      reply({ content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: '{"action":"none","reason":"Safe."}' }] }));
    expect((await a.choose(sit)).action).toBe("none");
  });

  it("turns a refusal, a cut-off answer, an error or a broken answer into an alert, never an action or a crash", async () => {
    const cfg = { provider: "anthropic" as const, baseUrl: "", model: "m", apiKey: "k" };
    expect((await anthropicAdvisor(cfg, async () => reply({ stop_reason: "refusal" })).choose(sit)).action).toBe("alert");
    expect((await anthropicAdvisor(cfg, async () => reply({ stop_reason: "max_tokens" })).choose(sit)).action).toBe("alert");
    expect((await anthropicAdvisor(cfg, async () => Promise.reject(new Error("529 overloaded"))).choose(sit)).action).toBe("alert");
    expect((await anthropicAdvisor(cfg, async () => reply({ content: [{ type: "text", text: "pay down!" }] })).choose(sit)).action).toBe("alert");
  });

  it("picks the right advisor for each provider", () => {
    expect(typeof advisorFor({ provider: "anthropic", baseUrl: "", model: "m", apiKey: "k" }).choose).toBe("function");
    expect(typeof advisorFor({ provider: "openai-compatible", baseUrl: "https://x.test", model: "m", apiKey: "k" }).choose).toBe("function");
  });
});
