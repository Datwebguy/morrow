"use client";

import { Reveal } from "./Reveal";
import { percent } from "@/lib/format";
import { ladder } from "@/lib/market";
import { useMarket } from "@/lib/useMarket";

/** Bitget's loan levels for stock-token backing, read live, drawn on one bar. */
export function Levels() {
  const { data, loading } = useMarket();
  const l = data?.levels ?? null;
  const pos = l ? ladder(l) : null;
  const marks =
    l && pos
      ? [
          { at: pos.start, label: "Starts at", v: l.start, above: true },
          { at: pos.marginCall, label: "Margin call", v: l.marginCall, above: false },
          { at: pos.liquidation, label: "Liquidation", v: l.liquidation, above: true },
        ]
      : [];
  return (
    <section aria-labelledby="levels-title" className="border-y border-line bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[1fr_1.25fr] lg:items-center">
        <Reveal>
          <p className="text-sm font-medium text-accent">Read live from Bitget</p>
          <h2 id="levels-title" className="mt-2 max-w-md text-3xl sm:text-4xl">Bitget sets the levels. Morrow reads them every time.</h2>
          <p className="mt-4 max-w-md text-muted">Nothing is typed in. If Bitget changes a level, Morrow changes with it.</p>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="rounded-3xl border border-line bg-canvas p-6 sm:p-8">
            {loading && !l ? (
              <div className="skeleton h-40 w-full" role="status" aria-label="Loading levels" />
            ) : l && pos ? (
              <>
                <div className="relative mx-2 my-2 h-10 sm:mx-10 sm:h-28" role="img" aria-label={`Loan levels: starts at ${percent(l.start, 0)}, margin call at ${percent(l.marginCall, 0)}, liquidation at ${percent(l.liquidation, 0)}`}>
                  <div className="absolute inset-x-0 top-1/2 flex h-4 -translate-y-1/2 overflow-hidden rounded-full">
                    <span className="bg-safe" style={{ width: `${pos.marginCall}%` }} />
                    <span className="bg-watch" style={{ width: `${pos.liquidation - pos.marginCall}%` }} />
                  </div>
                  {marks.map((m) => (
                    <div key={m.label}>
                      {/* Small screens: just a tick on the bar. The legend below says what each one is. */}
                      <div className="absolute top-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 bg-ink sm:hidden" style={{ left: `${m.at}%` }} />
                      {/* Wider screens: labels above and below, staggered so they never touch. */}
                      <div className={`absolute hidden -translate-x-1/2 text-center sm:block ${m.above ? "top-0" : "bottom-0"}`} style={{ left: `${m.at}%` }}>
                        {m.above ? null : <div className="mx-auto mb-1 h-5 w-px bg-ink" />}
                        <div className="whitespace-nowrap text-xs text-muted">{m.label}</div>
                        <div className="num text-sm font-semibold">{percent(m.v, 0)}</div>
                        {m.above ? <div className="mx-auto mt-1 h-5 w-px bg-ink" /> : null}
                      </div>
                    </div>
                  ))}
                </div>
                <ul className="mt-3 space-y-2 text-sm sm:hidden">
                  {marks.map((m) => (
                    <li key={m.label} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                      <span className="text-muted">{m.label}</span>
                      <span className="num font-semibold">{percent(m.v, 0)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-sm">
                  <div className="bg-surface p-4">
                    <dt className="text-muted">Stock tokens accepted as backing</dt>
                    <dd className="num mt-1 text-2xl font-semibold">{data?.backingCount}</dd>
                  </div>
                  <div className="bg-surface p-4">
                    <dt className="text-muted">Same levels for all of them</dt>
                    <dd className="mt-1 text-2xl font-semibold">{data?.uniform ? "Yes" : "No"}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-sm text-muted">The levels are not available right now. Nothing is shown rather than a guess.</p>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
