import { dateOnly, percent } from "@/lib/format";
import { mainResult, replayRows, type ReplayReport, type Summary } from "@/lib/replay";

function Table({ title, s }: { title: string; s: Summary }) {
  const rows = replayRows(s);
  return (
    <div>
      <h3 className="text-base">{title}</h3>
      <p className="mt-1 text-sm text-muted">
        <span className="num">{s.closures}</span> closures · <span className="num">{s.tokens}</span> stock tokens · simulated
      </p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">{title}, simulated loans</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Loan starts at</th>
              <th scope="col" className="px-4 py-3 font-medium">Loans</th>
              <th scope="col" className="px-4 py-3 font-medium">Margin calls without Morrow</th>
              <th scope="col" className="px-4 py-3 font-medium">With Morrow</th>
              <th scope="col" className="px-4 py-3 font-medium">Paid down</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.start} className="border-t border-line">
                <th scope="row" className="num px-4 py-3 font-medium">{percent(r.start, 0)}</th>
                <td className="num px-4 py-3">{r.loans.toLocaleString("en-US")}</td>
                <td className="num px-4 py-3">{r.withoutMorrow.toLocaleString("en-US")}</td>
                <td className="num px-4 py-3">{r.withMorrow.toLocaleString("en-US")}</td>
                <td className="num px-4 py-3">{percent(r.costShare, 2)} of debt</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The history replay: real Bitget prices, simulated loans. Every number comes from replay-report.json. */
export function ReplaySection({ report }: { report: ReplayReport }) {
  const main = mainResult(report);
  return (
    <section aria-labelledby="replay-title" className="mt-16">
      <p className="text-sm font-medium text-accent">Simulated</p>
      <h2 id="replay-title" className="mt-1 text-2xl sm:text-3xl">History replay</h2>
      <p className="mt-2 max-w-2xl text-muted">Real Bitget prices. Simulated loans. Run on {dateOnly(Date.parse(report.generatedAt))}.</p>
      {main ? (
        <div className="mt-8 space-y-10">
          <Table title="Earlier period (rules were set here)" s={main.train} />
          <Table title="Most recent weeks (out-of-sample test)" s={main.outOfSample} />
        </div>
      ) : (
        <p className="mt-6 text-muted">The replay report could not be read.</p>
      )}
      <ul className="mt-8 max-w-2xl list-disc space-y-2 pl-5 text-sm text-muted">
        {report.caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="mt-6 text-sm">
        <a className="font-medium text-accent underline underline-offset-2" href="/replay-report.json">Download the report</a>
        {" · "}
        <a className="font-medium text-accent underline underline-offset-2" href="https://github.com/Datwebguy/morrow/blob/HEAD/docs/METHOD.md" rel="noreferrer">How it was made</a>
      </p>
      <p className="mt-2 text-xs text-muted">Closures from the official NYSE calendar, read {dateOnly(Date.parse(report.calendar.fetchedAt))}.</p>
    </section>
  );
}
