import { dateTime } from "@/lib/format";
import type { WatchResult } from "@/lib/types";

const W = 640;
const H = 220;
const PAD = { l: 8, r: 8, t: 16, b: 20 };

/**
 * The real hourly price of the token around the weekend. The shaded band is the closure. Two dashed lines are the price at which the loan
 * would reach the margin-call level: without Morrow (the original debt) and with Morrow (the debt after its pay-down).
 * The line is drawn up to `cursorTs`, so it grows as the replay plays.
 */
export function WatchChart({ result, cursorTs, final }: { result: WatchResult; cursorTs: number; final: boolean }) {
  const pts = result.prices;
  if (pts.length < 2) return null;
  const t0 = pts[0]!.t;
  const t1 = pts[pts.length - 1]!.t;
  const debtNow = result.loan.debt - result.outcome.paidDown;
  const mcWithout = result.loan.debt / (result.loan.backingAmount * result.limits.marginCall);
  const mcWith = debtNow / (result.loan.backingAmount * result.limits.marginCall);
  const prices = pts.map((p) => p.price);
  const lo = Math.min(...prices, mcWithout, final ? mcWith : mcWithout);
  const hi = Math.max(...prices, mcWithout, final ? mcWith : mcWithout);
  const pad = (hi - lo) * 0.08 || 1;
  const x = (t: number): number => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (p: number): number => PAD.t + (1 - (p - (lo - pad)) / (hi - lo + 2 * pad)) * (H - PAD.t - PAD.b);
  const shown = pts.filter((p) => p.t <= cursorTs);
  const path = (list: typeof pts): string => list.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)} ${y(p.price).toFixed(1)}`).join(" ");
  const last = shown.at(-1);
  const bandX = x(Math.max(t0, result.closure.closeTs));
  const bandW = x(Math.min(t1, result.closure.reopenTs)) - bandX;
  const unprotectedHit = Math.min(...prices) <= mcWithout;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${result.token} real hourly price around the weekend of ${dateTime(result.closure.closeTs)}. ${unprotectedHit ? "The price fell below the level where the unprotected loan reaches a margin call." : "The price stayed above the margin-call price."}`}>
        <rect x={bandX} y={PAD.t} width={Math.max(0, bandW)} height={H - PAD.t - PAD.b} fill="var(--line)" opacity="0.6" />
        <line x1={PAD.l} x2={W - PAD.r} y1={y(mcWithout)} y2={y(mcWithout)} stroke="var(--danger)" strokeWidth="1.5" strokeDasharray="5 4" />
        {final ? <line x1={PAD.l} x2={W - PAD.r} y1={y(mcWith)} y2={y(mcWith)} stroke="var(--safe)" strokeWidth="1.5" strokeDasharray="5 4" /> : null}
        <path d={path(pts)} fill="none" stroke="var(--line)" strokeWidth="2" strokeLinejoin="round" />
        {shown.length > 1 ? <path d={path(shown)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" /> : null}
        {last ? <circle cx={x(last.t)} cy={y(last.price)} r="4.5" fill="var(--accent)" /> : null}
        <text x={bandX + 6} y={H - 6} fontSize="11" fill="var(--muted)">Market closed</text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-0.5 w-4 bg-accent" /> {result.token} price (real, hourly)</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-0.5 w-4 border-t-2 border-dashed border-danger" /> Margin call without Morrow, at {mcWithout.toFixed(2)} USDT</span>
        {final ? <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-0.5 w-4 border-t-2 border-dashed border-safe" /> With Morrow, at {mcWith.toFixed(2)} USDT</span> : null}
      </figcaption>
    </figure>
  );
}
