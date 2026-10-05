import type { Metadata } from "next";
import { Suspense } from "react";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { WatchAWeekend } from "@/components/WatchAWeekend";

export const metadata: Metadata = {
  title: "Watch a weekend",
  description: "Press Start and watch Morrow handle one real past weekend, step by step. Simulated loan, real Bitget prices.",
};

export default function WatchPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="text-4xl sm:text-5xl">Watch a weekend</h1>
        <p className="mt-3 max-w-xl text-muted">One real weekend, replayed from real Bitget prices. The loan is simulated.</p>
        <div className="mt-10">
          <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-line/60" aria-hidden />}>
            <WatchAWeekend />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}
