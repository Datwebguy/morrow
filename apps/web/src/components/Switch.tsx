"use client";

export function Switch({ checked, onChange, label, disabled = false, busy = false }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 ${checked ? "border-accent bg-accent" : "border-muted/60 bg-line"}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? "translate-x-[1.5rem]" : "translate-x-1"}`}
        style={{ background: checked ? "var(--on-accent)" : "var(--muted)" }}
      />
    </button>
  );
}
