"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { layoutLine, type LineData } from "@/lib/line";
import { percent } from "@/lib/format";

const BOX = { width: 1200, height: 320, pad: 20 };
const REFRESH_MS = 60_000;

/**
 * A slow price line from real Bitget data for the busiest stock-token backing, and a soft shield band at the price where a
 * loan opened at the start level would reach the margin-call level (both levels read live). It refreshes every minute, so the
 * line keeps moving through the weekend market. Where the market was closed it draws a dashed connector, never a made-up line.
 * If the data cannot load it shows a still line.
 */
export function PriceLine() {
  const reduce = useReducedMotion();
  const [data, setData] = useState<LineData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/line", { cache: "no-store" });
        if (!r.ok) throw new Error("no data");
        const d = (await r.json()) as LineData;
        if (alive) {
          setData(d);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const layout = layoutLine({ points: data?.points ?? [], band: data?.band ?? null }, BOX);
  const live = data !== null && !failed && !layout.still;

  return (
    <figure className="mx-auto m-0 w-full max-w-6xl px-4 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 pb-1 pt-4 text-xs text-muted">
        {live && data ? (
          <>
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-5 rounded bg-accent" aria-hidden /> Live hourly price of {data.coin}
            </span>
            {data.band ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-5 rounded-sm bg-safe/20" aria-hidden /> Shield: where a loan opened at {percent(data.band.startLevel, 0)} reaches the {percent(data.band.marginCallLevel, 0)} margin-call level
              </span>
            ) : null}
            {layout.hasGap ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-5 border-t border-dashed border-muted" aria-hidden /> Market closed, no trades
              </span>
            ) : null}
          </>
        ) : (
          <span>{failed ? "Live prices are not available right now." : "Loading live prices"}</span>
        )}
      </figcaption>
      <div className="relative h-44 w-full overflow-hidden sm:h-56" aria-hidden>
        <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {layout.bandY !== null ? (
            <>
              <rect x="0" y={layout.bandY} width={BOX.width} height={BOX.height - layout.bandY} fill="var(--safe)" opacity="0.1" />
              <line x1="0" x2={BOX.width} y1={layout.bandY} y2={layout.bandY} stroke="var(--safe)" strokeWidth="1.5" strokeDasharray="2 8" strokeLinecap="round" opacity="0.6" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
          {layout.hasGap ? <path d={layout.gapD} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="3 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.6" /> : null}
          <motion.path
            key={layout.d}
            d={layout.d}
            fill="none"
            stroke={live ? "var(--accent)" : "var(--muted)"}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={reduce || !live ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 6, ease: "easeInOut" }}
            opacity={live ? 0.8 : 0.35}
          />
        </svg>
        {live && layout.head ? (
          <span
            className="absolute h-2.5 w-2.5 rounded-full bg-accent"
            style={{ left: `${(layout.head.x / BOX.width) * 100}%`, top: `${(layout.head.y / BOX.height) * 100}%`, transform: "translate(-50%, -50%)" }}
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-50" />
          </span>
        ) : null}
      </div>
      </div>
    </figure>
  );
}
