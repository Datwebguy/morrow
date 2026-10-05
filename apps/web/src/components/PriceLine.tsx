"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { layoutLine, type LineData } from "@/lib/line";
import { percent } from "@/lib/format";

const BOX = { width: 1200, height: 420, pad: 24 };
const REFRESH_MS = 60_000;

/**
 * The hero background: a slow price line from real Bitget data for the busiest stock-token backing, and a soft shield band
 * at the price where a loan opened at the start level would reach the margin-call level (both levels read live).
 * It refreshes every minute, so the line keeps moving through the weekend market. If the data cannot load it shows a still line.
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
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} preserveAspectRatio="none" className="absolute bottom-0 left-0 h-[38%] w-full">
        {layout.bandY !== null ? <rect x="0" y={layout.bandY} width={BOX.width} height={BOX.height - layout.bandY} fill="var(--safe)" opacity="0.07" /> : null}
        {layout.bandY !== null ? <line x1="0" x2={BOX.width} y1={layout.bandY} y2={layout.bandY} stroke="var(--safe)" strokeWidth="1.5" strokeDasharray="2 8" strokeLinecap="round" opacity="0.55" /> : null}
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
          style={{ left: `${(layout.head.x / BOX.width) * 100}%`, bottom: `${(1 - layout.head.y / BOX.height) * 38}%`, transform: "translate(-50%, 50%)" }}
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-50" />
        </span>
      ) : null}
      {live && data?.band ? (
        <p className="absolute bottom-3 left-4 max-w-[22rem] text-[11px] leading-snug text-muted sm:left-8">
          Live hourly price of {data.coin}. The shield marks where a loan opened at {percent(data.band.startLevel, 0)} reaches the {percent(data.band.marginCallLevel, 0)} margin-call level.
        </p>
      ) : null}
    </div>
  );
}
