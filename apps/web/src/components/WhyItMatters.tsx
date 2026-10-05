"use client";

import Link from "next/link";
import { Reveal } from "./Reveal";
import { amount, dateOnly } from "@/lib/format";
import { usePublicRecord } from "@/lib/usePublicRecord";

/** Only appears when the public record holds a real graded example where a margin call was avoided. */
export function WhyItMatters() {
  const { data } = usePublicRecord();
  const ex = data?.promises.find((p) => p.status === "graded" && p.marginCallAvoided);
  if (!ex) return null;
  return (
    <section aria-labelledby="why-title" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
      <Reveal>
        <h2 id="why-title" className="max-w-2xl text-3xl sm:text-4xl">A weekend can move a loan past its limit.</h2>
        <p className="mt-4 max-w-xl text-muted">
          A {ex.sizeBand} loan backed by {ex.backingCoin} · closure of {dateOnly(ex.closeTs)}. Without action it would have reached a margin call. Morrow used {amount(ex.cost ?? 0, "USDT")} and the promise was kept.
        </p>
        <Link href="/record" className="mt-5 inline-block text-sm font-medium text-accent underline underline-offset-2">
          See it on the record
        </Link>
      </Reveal>
    </section>
  );
}
