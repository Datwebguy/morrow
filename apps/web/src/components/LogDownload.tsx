import { Download } from "lucide-react";
import { WORKER_URL } from "@/lib/api";

const LINK = "inline-flex h-11 items-center gap-2 rounded-full border border-muted/50 px-5 text-sm font-medium text-ink hover:bg-line/60";

/** Public, no login: every decision Morrow logged, with simulated or live on every row. */
export function LogDownload() {
  if (!WORKER_URL) return null;
  return (
    <section aria-labelledby="log-title" className="mt-14">
      <h2 id="log-title" className="text-2xl">Download the log</h2>
      <p className="mt-2 max-w-2xl text-muted">Every decision: time, loan, direction, price, quantity, balance change and the reason. Each row says simulated or live.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a className={LINK} href={`${WORKER_URL}/public/log.csv`} download>
          <Download size={16} strokeWidth={1.75} aria-hidden /> Download CSV
        </a>
        <a className={LINK} href={`${WORKER_URL}/public/log.json`} download>
          <Download size={16} strokeWidth={1.75} aria-hidden /> Download JSON
        </a>
      </div>
    </section>
  );
}
