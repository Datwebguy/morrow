"use client";

import { CalendarClock, Gauge, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const STROKE = 1.75;

interface Step {
  title: string;
  line: string;
  Icon: typeof Gauge;
  visual: ReactNode;
}

const STEPS: Step[] = [
  {
    title: "The weekend move",
    line: "US markets close. Your stock token may keep trading, or pause.",
    Icon: CalendarClock,
    visual: (
      <ol className="flex items-center gap-2 text-sm" aria-label="From the US close to the reopen">
        {["US market closes", "Weekend market", "US market reopens"].map((t, i) => (
          <li key={t} className="flex flex-1 items-center gap-2">
            <span className="flex flex-col items-center gap-2 text-center">
              <span className={`h-3 w-3 rounded-full ${i === 1 ? "bg-watch" : "bg-ink"}`} />
              <span className="text-xs text-muted">{t}</span>
            </span>
            {i < 2 ? <span className="mb-6 h-px flex-1 bg-muted/50" /> : null}
          </li>
        ))}
      </ol>
    ),
  },
  {
    title: "Monday, projected",
    line: "Morrow works out your loan health at the reopen and checks the price can be trusted.",
    Icon: Gauge,
    visual: (
      <div aria-label="Loan health scale: safe, getting close, margin-call level">
        <div className="flex h-3 overflow-hidden rounded-full">
          <span className="flex-[4] bg-safe" />
          <span className="flex-[3] bg-watch" />
          <span className="flex-[3] bg-danger" />
        </div>
        <div className="mt-2 flex text-xs text-muted">
          <span className="flex-[4]">Safe</span>
          <span className="flex-[3]">Getting close</span>
          <span className="flex-[3] text-right">Margin-call level</span>
        </div>
      </div>
    ),
  },
  {
    title: "Protected",
    line: "If a margin call is coming, Morrow pays down or adds backing first. Then it grades itself.",
    Icon: ShieldCheck,
    visual: (
      <ul className="space-y-2 text-sm">
        {["Price checked", "Paid down or backing added, inside your limits", "Promise graded in public"].map((t) => (
          <li key={t} className="flex items-center gap-2">
            <CheckCircle2 size={18} strokeWidth={STROKE} className="text-safe" aria-hidden /> {t}
          </li>
        ))}
      </ul>
    ),
  },
];

function Card({ step, index }: { step: Step; index: number }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-7 sm:p-9">
      <div className="flex items-center gap-3 text-muted">
        <step.Icon size={22} strokeWidth={STROKE} aria-hidden />
        <span className="num text-sm">{index + 1} of {STEPS.length}</span>
      </div>
      <h3 className="mt-4 text-2xl sm:text-3xl">{step.title}</h3>
      <p className="mt-3 max-w-md text-muted">{step.line}</p>
      <div className="mt-8">{step.visual}</div>
    </div>
  );
}

/**
 * Three steps. On wider screens the title and the step list stay pinned on the left while the three cards scroll past on the
 * right, and the step in view lights up. There is no empty scroll track, so nothing is ever blank. On small screens it is
 * just the three cards in a stack.
 */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const cards = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    const els = cards.current.filter((e): e is HTMLDivElement => e !== null);
    // The card crossing the middle of the screen is the active one.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset["i"]));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <section id="how" aria-labelledby="how-title" className="mx-auto mt-16 w-full max-w-6xl scroll-mt-8 px-4 sm:mt-24 sm:px-6">
      <div className="grid gap-10 md:grid-cols-2 md:gap-16">
        <div className="md:sticky md:top-28 md:self-start">
          <p className="text-sm font-medium text-accent">How it works</p>
          <h2 id="how-title" className="mt-2 text-3xl sm:text-4xl">Weekend move. Monday projected. Protected.</h2>
          <ol className="mt-8 hidden space-y-3 md:block" aria-hidden>
            {STEPS.map((s, i) => (
              <li key={s.title} className={`flex items-center gap-3 text-lg transition-colors ${i === active ? "text-ink" : "text-muted"}`}>
                <span className={`h-2 rounded-full transition-all ${i === active ? "w-12 bg-accent" : "w-8 bg-line"}`} />
                {s.title}
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-6 md:space-y-10 md:py-4">
          {STEPS.map((s, i) => (
            <div key={s.title} data-i={i} ref={(el) => void (cards.current[i] = el)} className="md:py-6">
              <Card step={s} index={i} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
