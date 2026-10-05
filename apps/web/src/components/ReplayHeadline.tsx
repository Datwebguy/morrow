import { dateOnly, percent } from "@/lib/format";
import { headline, type ReplayReport } from "@/lib/replay";

const n = (x: number): string => x.toLocaleString("en-US");

/** The headline of the record page: what the replay found, in one sentence, from replay-report.json only. */
export function ReplayHeadline({ report }: { report: ReplayReport }) {
  const h = headline(report);
  if (!h) return <p className="text-muted">The replay report could not be read.</p>;
  return (
    <section aria-labelledby="headline" className="rounded-3xl border border-line bg-surface p-6 sm:p-10">
      <p className="inline-flex rounded-full bg-accent px-3 py-1 text-sm font-medium text-on-accent">Simulated loans, real prices</p>
      <h2 id="headline" className="mt-5 max-w-3xl text-3xl sm:text-4xl">
        Across <span className="num">{n(h.weekends)}</span> real weekends, loans opened at <span className="num">{percent(h.high.start, 0)}</span>: <span className="num text-danger">{n(h.high.withoutMorrow)}</span> margin calls without Morrow, <span className="num text-safe">{n(h.high.withMorrow)}</span> with Morrow.
      </h2>
      <dl className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-canvas p-4">
          <dt className="text-sm text-muted">Without Morrow</dt>
          <dd className="num mt-1 text-3xl font-semibold text-danger">{n(h.high.withoutMorrow)}</dd>
        </div>
        <div className="rounded-2xl bg-canvas p-4">
          <dt className="text-sm text-muted">With Morrow</dt>
          <dd className="num mt-1 text-3xl font-semibold text-safe">{n(h.high.withMorrow)}</dd>
        </div>
        <div className="rounded-2xl bg-canvas p-4">
          <dt className="text-sm text-muted">Paid down to get there</dt>
          <dd className="num mt-1 text-3xl font-semibold">{percent(h.high.costShare)}</dd>
          <dd className="text-xs text-muted">of the debt</dd>
        </div>
      </dl>
      <p className="mt-6 max-w-3xl text-sm text-muted">
        Loans opened at <span className="num">{percent(h.low.start, 0)}</span> (weekend risk alone): <span className="num">{n(h.low.withoutMorrow)}</span> margin calls without Morrow, <span className="num">{n(h.low.withMorrow)}</span> with, at <span className="num">{percent(h.low.costShare, 2)}</span> of the debt.
      </p>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        {n(h.tokens)} stock tokens, real Bitget hourly prices, replay run {dateOnly(Date.parse(report.generatedAt))}.
      </p>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Counted under both ways Bitget may value backing while the market is closed. At <span className="num">{percent(h.high.start, 0)}</span> much of the cost is paying down at the start, so the <span className="num">{percent(h.low.start, 0)}</span> row is the clearer test.
      </p>
    </section>
  );
}
