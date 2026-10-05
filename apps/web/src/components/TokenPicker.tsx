"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { TokenOption } from "@/lib/types";

const MAX_SHOWN = 40; // enough to scroll, short enough to scan

function label(t: TokenOption): string {
  return t.name ? `${t.coin} · ${t.name}` : t.coin;
}

/** Ranks a token against a search: ticker first, then name words, then anything containing the text. Null when it does not match. */
export function matchRank(t: TokenOption, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const coin = t.coin.toLowerCase();
  const ticker = coin.replace(/^r/, "");
  const name = (t.name ?? "").toLowerCase();
  if (coin === q || ticker === q) return 0;
  if (coin.startsWith(q) || ticker.startsWith(q)) return 1;
  if (name.split(/[\s,.]+/).some((w) => w.startsWith(q))) return 2;
  if (coin.includes(q) || name.includes(q)) return 3;
  return null;
}

export function searchTokens(tokens: TokenOption[], query: string): TokenOption[] {
  return tokens
    .map((t) => ({ t, r: matchRank(t, query) }))
    .filter((x): x is { t: TokenOption; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || a.t.coin.localeCompare(b.t.coin))
    .map((x) => x.t);
}

/** A search box over the live token list: type a ticker (rNVDA) or a company name (Nvidia). */
export function TokenPicker({ tokens, failed, value, onChange, id }: { tokens: TokenOption[] | null; failed: boolean; value: string; onChange: (coin: string) => void; id: string }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const chosen = tokens?.find((t) => t.coin === value) ?? null;
  const matches = useMemo(() => searchTokens(tokens ?? [], query).slice(0, MAX_SHOWN), [tokens, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (t: TokenOption) => {
    onChange(t.coin);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={!tokens}
        placeholder={failed ? "Token list not available right now" : tokens ? "Search: rNVDA or Nvidia" : "Loading tokens"}
        value={open ? query : chosen ? label(chosen) : value}
        onFocus={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(matches.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="mt-1.5 h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink"
      />
      {open && tokens ? (
        <ul id={listId} role="listbox" aria-label="Stock tokens" className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
          {matches.length === 0 ? (
            <li role="presentation" className="px-4 py-3 text-sm text-muted">No token matches that. Try the ticker.</li>
          ) : (
            matches.map((t, i) => (
              <li
                key={t.coin}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={t.coin === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(t);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-baseline gap-2 px-4 py-2.5 text-sm ${i === active ? "bg-line/60" : ""}`}
              >
                <span className="num font-medium">{t.coin}</span>
                {t.name ? <span className="min-w-0 truncate text-muted">{t.name}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
