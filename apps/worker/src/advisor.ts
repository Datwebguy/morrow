import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_ADVISOR, SCHEDULE } from "@morrow/config";
import type { ActionKind } from "@morrow/core";

/** What the AI is shown. Numbers only come from live data and code. */
export interface Situation {
  loan: string;
  phase: "open" | "pre_closure" | "closed";
  /** Plain numbers in loan-health points. */
  healthNow: number | null;
  projectedHealth: number | null;
  projectionBasis: string;
  marginCallLevel: number;
  liquidationLevel: number;
  targetLevel: number;
  priceTrust: { trusted: boolean; failures: string[] };
  moveSinceClose: number | null;
  historicalDrop: { percentile: number; drop: number } | null;
  /** The code's smallest plan, and the actions the user allows. */
  plan: { kind: ActionKind; amount: number } | null;
  allowed: ActionKind[];
  news: string[];
}

export type ChoiceAction = "none" | "alert" | ActionKind;

export interface Choice {
  action: ChoiceAction;
  /** One plain line for the user. */
  reason: string;
  /** Which model or method decided, recorded for the submission. */
  by: string;
}

export interface Advisor {
  choose(s: Situation): Promise<Choice>;
}

const VALID: ChoiceAction[] = ["none", "alert", "pay_down", "add_backing"];

/** Parses the model's answer strictly. Anything unclear becomes an alert, never an action. */
export function parseChoice(text: string, by: string): Choice {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const o = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const action = o["action"];
    const reason = o["reason"];
    if (typeof action === "string" && (VALID as string[]).includes(action) && typeof reason === "string" && reason.trim().length > 0) {
      return { action: action as ChoiceAction, reason: reason.trim().slice(0, 240), by };
    }
  } catch {
    // fall through
  }
  return { action: "alert", reason: "The assistant's answer was not clear, so Morrow only alerts you.", by };
}

export interface ModelConfig {
  /** "anthropic" uses Anthropic's own SDK. "openai-compatible" is any chat-completions endpoint (Gemini, OpenAI, Qwen and the like). */
  provider: "anthropic" | "openai-compatible";
  /** Needed for openai-compatible. Optional for anthropic (its own address is the default). */
  baseUrl: string;
  model: string;
  apiKey: string;
}

/**
 * Reads the model settings from the environment. Switching provider means changing only these variables.
 * LLM_PROVIDER picks the kind; when it is not set, an Anthropic key (sk-ant-...) or an api.anthropic.com address means Anthropic.
 * The older MODEL_* names still work.
 */
export function modelConfigFromEnv(env: NodeJS.ProcessEnv): ModelConfig | null {
  const baseUrl = env["LLM_BASE_URL"] || env["MODEL_BASE_URL"] || "";
  const apiKey = env["LLM_API_KEY"] || env["MODEL_API_KEY"] || "";
  const named = env["LLM_PROVIDER"];
  const anthropic = named ? named === "anthropic" : apiKey.startsWith("sk-ant-") || baseUrl.includes("api.anthropic.com");
  if (anthropic) {
    // A leftover address or model name from another provider (Gemini, say) must not break Anthropic: the SDK has its own address
    // (ANTHROPIC_BASE_URL overrides it), and only a Claude model name is used.
    const named = env["LLM_MODEL"] || env["MODEL_NAME"] || "";
    const model = /^claude/i.test(named) ? named : ANTHROPIC_ADVISOR.defaultModel;
    return apiKey ? { provider: "anthropic", baseUrl: "", model, apiKey } : null;
  }
  const model = env["LLM_MODEL"] || env["MODEL_NAME"];
  return baseUrl && model && apiKey ? { provider: "openai-compatible", baseUrl, model, apiKey } : null;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const SYSTEM = [
  "You judge whether a stock-backed crypto loan needs action before the US stock market reopens.",
  "You choose exactly one of: none, alert, pay_down, add_backing. You never choose amounts. Code sizes and checks everything.",
  "Choose pay_down or add_backing only if the plan is needed and the price evidence supports it. Prefer alert when the data is unclear.",
  "Answer with one JSON object: {\"action\": \"...\", \"reason\": \"one short plain sentence for the user\"}.",
  "Use the words loan health, margin-call level, backing, pay down, add backing. No jargon.",
].join(" ");

type MessagesCreate = (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage>;

/** Anthropic's own API through the official SDK. The model gets the same one-word choice, and any failure or refusal becomes an alert. */
export function anthropicAdvisor(cfg: ModelConfig, create?: MessagesCreate): Advisor {
  const client = create ? null : new Anthropic({ apiKey: cfg.apiKey, ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}), timeout: SCHEDULE.modelTimeoutSeconds * 1000 });
  const call: MessagesCreate = create ?? ((p) => client!.beta.messages.create(p));
  const unreachable: Choice = { action: "alert", reason: "The assistant could not be reached, so Morrow only alerts you.", by: cfg.model };
  return {
    async choose(s) {
      let msg: Anthropic.Beta.BetaMessage;
      try {
        msg = await call({
          model: cfg.model,
          max_tokens: ANTHROPIC_ADVISOR.maxTokens,
          // If a safety check declines the request, the API retries it on the fallback model inside the same call.
          betas: ["server-side-fallback-2026-06-01"],
          fallbacks: [{ model: ANTHROPIC_ADVISOR.fallbackModel }],
          output_config: { effort: ANTHROPIC_ADVISOR.effort },
          system: SYSTEM,
          messages: [{ role: "user", content: JSON.stringify(s) }],
        });
      } catch {
        return unreachable;
      }
      if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") return unreachable;
      const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      return parseChoice(text, cfg.model);
    },
  };
}

/** The advisor for a model config. */
export function advisorFor(cfg: ModelConfig): Advisor {
  return cfg.provider === "anthropic" ? anthropicAdvisor(cfg) : modelAdvisor(cfg);
}

/** A chat-completions endpoint (the common request format most model hosts accept). */
export function modelAdvisor(cfg: ModelConfig, fetchImpl: FetchLike = (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(SCHEDULE.modelTimeoutSeconds * 1000) })): Advisor {
  const unreachable: Choice = { action: "alert", reason: "The assistant could not be reached, so Morrow only alerts you.", by: cfg.model };
  return {
    async choose(s) {
      let res: Awaited<ReturnType<FetchLike>>;
      try {
        res = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({
            model: cfg.model,
            temperature: 0,
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: JSON.stringify(s) },
            ],
          }),
        });
      } catch {
        return unreachable;
      }
      if (!res.ok) return unreachable;
      let text = "";
      try {
        const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        text = body.choices?.[0]?.message?.content ?? "";
      } catch {
        return unreachable;
      }
      return parseChoice(text, cfg.model);
    },
  };
}

/**
 * Used only when no model is configured. It accepts the code's own plan when one is needed.
 * The log says "rules only" so it is never mistaken for the model.
 */
export const rulesAdvisor: Advisor = {
  async choose(s) {
    if (s.plan) return { action: s.plan.kind, reason: "Loan health is projected too close to the margin-call level.", by: "rules only" };
    return { action: "none", reason: "No action needed.", by: "rules only" };
  },
};
