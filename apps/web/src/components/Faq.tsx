"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { FAQ } from "@/content/faq";

/** Accordion: one answer open at a time. */
export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto w-full max-w-3xl scroll-mt-8 px-4 py-24 sm:px-6">
      <h2 id="faq-title" className="text-3xl sm:text-4xl">Questions</h2>
      <div className="mt-8 divide-y divide-line border-y border-line">
        {FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q}>
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-${i}`}
                  id={`faq-btn-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left text-base font-medium"
                >
                  {item.q}
                  <ChevronDown size={20} strokeWidth={1.75} className={`shrink-0 text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                </button>
              </h3>
              <div id={`faq-${i}`} role="region" aria-labelledby={`faq-btn-${i}`} hidden={!isOpen}>
                <p className="max-w-2xl pb-5 text-muted">{item.a}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
