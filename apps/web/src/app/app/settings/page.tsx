"use client";

import { useEffect, useState } from "react";
import { ActionButton } from "@/components/ActionButton";
import { ErrorNote } from "@/components/EmptyState";
import { Gate } from "@/components/Gate";
import { Hint } from "@/components/Hint";
import { Skeleton } from "@/components/Skeleton";
import { request, setKey } from "@/lib/api";
import type { Settings } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const FIELD = "h-11 w-full rounded-xl border border-muted/60 bg-canvas px-3 text-sm";

function num(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error("Enter a number of zero or more, or leave it empty.");
  return n;
}

function Form({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const [mode, setMode] = useState(initial.mode);
  const [pay, setPay] = useState(initial.allowed.includes("pay_down"));
  const [add, setAdd] = useState(initial.allowed.includes("add_backing"));
  const [target, setTarget] = useState(String(initial.targetBufferPoints));
  const [trigger, setTrigger] = useState(String(initial.triggerBufferPoints));
  const [perAction, setPerAction] = useState(initial.maxPerAction === null ? "" : String(initial.maxPerAction));
  const [perWeekend, setPerWeekend] = useState(initial.maxPerWeekend === null ? "" : String(initial.maxPerWeekend));
  const [perMonth, setPerMonth] = useState(initial.maxPerMonth === null ? "" : String(initial.maxPerMonth));
  const [telegram, setTelegram] = useState(initial.telegramChatId ?? "");
  useEffect(() => setMode(initial.mode), [initial.mode]);

  const save = async () => {
    const allowed = [...(pay ? ["pay_down"] : []), ...(add ? ["add_backing"] : [])];
    await request("/api/settings", {
      method: "PUT",
      body: {
        mode, allowed, targetBufferPoints: num(target) ?? 0, triggerBufferPoints: num(trigger) ?? 0,
        maxPerAction: num(perAction), maxPerWeekend: num(perWeekend), maxPerMonth: num(perMonth), telegramChatId: telegram.trim() === "" ? null : telegram.trim(),
      },
    });
    onSaved();
    return { line: "Saved." };
  };

  return (
    <div className="space-y-6">
      <fieldset className="rounded-2xl border border-line bg-surface p-5">
        <legend className="px-1 text-sm font-semibold">Mode</legend>
        {(
          [
            ["ask", "Ask me first", "Morrow sends the proposed action and waits for you to tap Approve."],
            ["auto", "Protect automatically", "Morrow acts by itself, inside your limits."],
          ] as const
        ).map(([v, title, line]) => (
          <label key={v} className="mt-3 flex cursor-pointer items-start gap-3">
            <input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
            <span>
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-sm text-muted">{line}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="rounded-2xl border border-line bg-surface p-5">
        <legend className="px-1 text-sm font-semibold">Allowed actions</legend>
        <label className="mt-3 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={pay} onChange={(e) => setPay(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" /> Pay down
        </label>
        <label className="mt-3 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={add} onChange={(e) => setAdd(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" /> Add backing
        </label>
        <p className="mt-3 text-sm text-muted">Morrow never sells your stocks, never borrows and never withdraws.</p>
      </fieldset>

      <fieldset className="rounded-2xl border border-line bg-surface p-5">
        <legend className="px-1 text-sm font-semibold">Safety level</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="target" className="flex items-center gap-1 text-sm">
              Stay this far below the margin-call level (points)
              <Hint label="About the safety level">When Morrow steps in, it aims to bring loan health this many points under the margin-call level.</Hint>
            </label>
            <input id="target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className={`${FIELD} num mt-2`} />
          </div>
          <div>
            <label htmlFor="trigger" className="flex items-center gap-1 text-sm">
              Step in when within (points)
              <Hint label="About stepping in">Morrow acts when loan health is projected within this many points of the margin-call level.</Hint>
            </label>
            <input id="trigger" inputMode="decimal" value={trigger} onChange={(e) => setTrigger(e.target.value)} className={`${FIELD} num mt-2`} />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-line bg-surface p-5">
        <legend className="px-1 text-sm font-semibold">Limits (USDT)</legend>
        <p className="mt-2 text-sm text-muted">Morrow does nothing until you set these.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {(
            [
              ["Per action", perAction, setPerAction, "per-action"],
              ["Per weekend", perWeekend, setPerWeekend, "per-weekend"],
              ["Per month", perMonth, setPerMonth, "per-month"],
            ] as const
          ).map(([label, value, set, id]) => (
            <div key={id}>
              <label htmlFor={id} className="text-sm">
                {label}
              </label>
              <input id={id} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} placeholder="Not set" className={`${FIELD} num mt-2`} />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-line bg-surface p-5">
        <legend className="px-1 text-sm font-semibold">Alerts</legend>
        <p className="mt-2 text-sm text-muted">Alerts always show in the app. Telegram is optional.</p>
        <label htmlFor="telegram" className="mt-3 block text-sm">
          Telegram chat
        </label>
        <input id="telegram" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Not set" className={`${FIELD} mt-2`} />
      </fieldset>

      <ActionButton label="Save settings" pendingLabel="Saving" onAction={save} />
    </div>
  );
}

export default function SettingsPage() {
  const s = useApi<Settings>("/api/settings", 0);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <h1 className="text-2xl sm:text-3xl">Settings</h1>
      <p className="mb-6 mt-1 text-sm text-muted">You choose what Morrow may do, and you can stop it at any time.</p>
      <Gate>
        {s.loading && !s.data ? (
          <div className="space-y-4" role="status" aria-label="Loading settings">
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
        ) : s.error && !s.data ? (
          <ErrorNote message={s.error} onRetry={s.refresh} />
        ) : s.data ? (
          <div className="space-y-8">
            <Form initial={s.data} onSaved={s.refresh} />
            <section className="rounded-2xl border border-danger/40 bg-surface p-5" aria-labelledby="stop">
              <h2 id="stop" className="text-base">
                Stop everything
              </h2>
              <p className="mt-1 text-sm text-muted">Pause all stops every action at once. Disconnect also stops protecting every loan and cuts the link to Bitget.</p>
              <div className="mt-4 flex flex-wrap items-start gap-3">
                <ActionButton
                  label={s.data.paused ? "Resume" : "Pause all"}
                  variant="secondary"
                  onAction={async () => {
                    await request("/api/pause", { method: "POST", body: { paused: !s.data?.paused } });
                    s.refresh();
                    return { line: s.data?.paused ? "Resumed." : "Paused. Nothing will be sent." };
                  }}
                />
                {confirm ? (
                  <ActionButton
                    label="Yes, disconnect"
                    variant="danger"
                    onAction={async () => {
                      const r = await request<{ line: string }>("/api/disconnect", { method: "POST", body: {} });
                      setKey(null);
                      return { line: r.line };
                    }}
                  />
                ) : (
                  <button type="button" onClick={() => setConfirm(true)} className="h-11 rounded-full border border-danger/60 px-5 text-sm font-medium text-danger">
                    Disconnect
                  </button>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </Gate>
    </>
  );
}
