"use client";

import { motion } from "motion/react";
import { CountNumber } from "./CountNumber";
import { percent } from "@/lib/format";
import { statusWord } from "@/lib/words";

const CX = 110;
const CY = 110;
const R = 90;

function polar(angleDeg: number): { x: number; y: number } {
  const a = (Math.PI * (180 - angleDeg)) / 180;
  return { x: CX + R * Math.cos(a), y: CY - R * Math.sin(a) };
}

const ARC = `M ${polar(0).x} ${polar(0).y} A ${R} ${R} 0 0 1 ${polar(180).x} ${polar(180).y}`;
const COLOR: Record<string, string> = { safe: "var(--safe)", watch: "var(--watch)", margin_call: "var(--danger)", liquidation: "var(--danger)" };

/** Loan health: a half-circle scaled from zero to the liquidation level, with ticks at the margin-call and liquidation levels. */
export function Gauge({ ratio, marginCall, liquidation, status }: { ratio: number; marginCall: number; liquidation: number; status: string }) {
  const frac = Math.min(1, Math.max(0, ratio / liquidation));
  const tick = (level: number) => {
    const ang = (level / liquidation) * 180;
    const a = (Math.PI * (180 - ang)) / 180;
    return { x1: CX + (R - 10) * Math.cos(a), y1: CY - (R - 10) * Math.sin(a), x2: CX + (R + 10) * Math.cos(a), y2: CY - (R + 10) * Math.sin(a) };
  };
  const mc = tick(marginCall);
  const lq = tick(liquidation);
  return (
    <figure className="m-0 flex flex-col items-center" aria-label={`Loan health ${percent(ratio)}. ${statusWord(status)}.`}>
      <svg viewBox="0 0 220 128" className="w-full max-w-72" role="img" aria-hidden>
        <path d={ARC} fill="none" stroke="var(--line)" strokeWidth="14" strokeLinecap="round" />
        <motion.path
          d={ARC}
          fill="none"
          stroke={COLOR[status] ?? "var(--muted)"}
          strokeWidth="14"
          strokeLinecap="round"
          initial={{ pathLength: frac }}
          animate={{ pathLength: frac }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <line {...mc} stroke="var(--watch)" strokeWidth="2" strokeLinecap="round" />
        <line {...lq} stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="-mt-14 text-center">
        <CountNumber value={ratio} format={(n) => percent(n)} className="text-4xl font-semibold" />
        <div className="mt-0.5 text-sm text-muted">Loan health</div>
        <div className="mt-1 text-sm font-medium" style={{ color: COLOR[status] ?? "var(--muted)" }}>
          {statusWord(status)}
        </div>
      </div>
      <figcaption className="sr-only">
        Margin-call level {percent(marginCall)}. Liquidation level {percent(liquidation)}.
      </figcaption>
    </figure>
  );
}
