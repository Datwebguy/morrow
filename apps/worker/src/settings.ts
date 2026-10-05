import { DEFAULT_TARGET_BUFFER_POINTS, DEFAULT_TRIGGER_BUFFER_POINTS } from "@morrow/config";
import type { ActionKind } from "@morrow/core";
import type { Store } from "./db";

/** The user's controls (AGENTS.md section 5). */
export interface UserSettings {
  /** "auto": protect automatically. "ask": send the proposed action and wait for Approve. */
  mode: "auto" | "ask";
  /** Kill switch: stops every action instantly. */
  paused: boolean;
  allowed: ActionKind[];
  /** Points below the margin-call level to stay under. */
  targetBufferPoints: number;
  /** Act when the projection is within this many points of the margin-call level. */
  triggerBufferPoints: number;
  /** Limits in the borrowed coin. Null means the user has not set one yet, which means no action is allowed. */
  maxPerAction: number | null;
  maxPerWeekend: number | null;
  maxPerMonth: number | null;
  /** Order ids of the loans the user chose to protect. */
  protectedLoans: string[];
  telegramChatId: string | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  mode: "ask",
  paused: false,
  allowed: ["pay_down", "add_backing"],
  targetBufferPoints: DEFAULT_TARGET_BUFFER_POINTS,
  triggerBufferPoints: DEFAULT_TRIGGER_BUFFER_POINTS,
  maxPerAction: null,
  maxPerWeekend: null,
  maxPerMonth: null,
  protectedLoans: [],
  telegramChatId: null,
};

const KEY = "user_settings";

export function loadSettings(store: Store): UserSettings {
  return { ...DEFAULT_SETTINGS, ...(store.getSetting<Partial<UserSettings>>(KEY) ?? {}) };
}

export class SettingsError extends Error {}

function limit(v: unknown, name: string): number | null {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new SettingsError(`${name} must be a number of zero or more, or empty`);
  return v;
}

/** Validates a partial update from the app and saves it. */
export function updateSettings(store: Store, patch: Record<string, unknown>): UserSettings {
  const cur = loadSettings(store);
  const next: UserSettings = { ...cur };
  if ("mode" in patch) {
    if (patch["mode"] !== "auto" && patch["mode"] !== "ask") throw new SettingsError("mode must be auto or ask");
    next.mode = patch["mode"];
  }
  if ("paused" in patch) {
    if (typeof patch["paused"] !== "boolean") throw new SettingsError("paused must be true or false");
    next.paused = patch["paused"];
  }
  if ("allowed" in patch) {
    const a = patch["allowed"];
    if (!Array.isArray(a) || a.some((x) => x !== "pay_down" && x !== "add_backing")) throw new SettingsError("allowed actions are pay_down and add_backing");
    next.allowed = [...new Set(a as ActionKind[])];
  }
  for (const k of ["targetBufferPoints", "triggerBufferPoints"] as const) {
    if (k in patch) {
      const v = patch[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new SettingsError(`${k} must be zero or more`);
      next[k] = v;
    }
  }
  for (const k of ["maxPerAction", "maxPerWeekend", "maxPerMonth"] as const) if (k in patch) next[k] = limit(patch[k], k);
  if ("protectedLoans" in patch) {
    const p = patch["protectedLoans"];
    if (!Array.isArray(p) || p.some((x) => typeof x !== "string")) throw new SettingsError("protectedLoans must be a list of order ids");
    next.protectedLoans = [...new Set(p as string[])];
  }
  if ("telegramChatId" in patch) {
    const t = patch["telegramChatId"];
    if (t !== null && typeof t !== "string") throw new SettingsError("telegramChatId must be text or empty");
    next.telegramChatId = t;
  }
  store.setSetting(KEY, next);
  return next;
}
