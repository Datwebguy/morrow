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
  baseUrl: string;
  model: string;
  apiKey: string;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const SYSTEM = [
  "You judge whether a stock-backed crypto loan needs action before the US stock market reopens.",
  "You choose exactly one of: none, alert, pay_down, add_backing. You never choose amounts. Code sizes and checks everything.",
  "Choose pay_down or add_backing only if the plan is needed and the price evidence supports it. Prefer alert when the data is unclear.",
  "Answer with one JSON object: {\"action\": \"...\", \"reason\": \"one short plain sentence for the user\"}.",
  "Use the words loan health, margin-call level, backing, pay down, add backing. No jargon.",
].join(" ");

/** An OpenAI-compatible chat endpoint. */
export function modelAdvisor(cfg: ModelConfig, fetchImpl: FetchLike = (u, i) => fetch(u, i)): Advisor {
  return {
    async choose(s) {
      const res = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
      if (!res.ok) return { action: "alert", reason: "The assistant could not be reached, so Morrow only alerts you.", by: cfg.model };
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = body.choices?.[0]?.message?.content ?? "";
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
