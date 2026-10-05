"use client";

import { CountNumber } from "./CountNumber";
import { usePublicRecord } from "@/lib/usePublicRecord";

/** Three live numbers from the public record. "Starting" until a promise has been graded. */
export function LiveStrip() {
  const { data, loading } = usePublicRecord();
  const graded = data?.totals.graded ?? 0;
  const items = [
    { label: "Promises kept", value: data?.totals.kept ?? 0 },
    { label: "Margin calls avoided", value: data?.totals.marginCallsAvoided ?? 0 },
    { label: "Liquidations avoided", value: data?.totals.liquidationsAvoided ?? 0 },
  ];
  return (
    <section aria-label="Live record" className="mx-auto mt-14 w-full max-w-6xl px-4 sm:mt-16 sm:px-6">
      <dl className="grid divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map((i) => (
          <div key={i.label} className="px-6 py-5">
            <dt className="text-sm text-muted">{i.label}</dt>
            <dd className="mt-1 text-3xl font-semibold">
              {loading ? <span className="skeleton inline-block h-8 w-16 align-middle" aria-label="Loading" /> : graded > 0 ? <CountNumber value={i.value} format={(n) => String(Math.round(n))} /> : <span>Starting</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">From the public record. Real results only.</p>
    </section>
  );
}
