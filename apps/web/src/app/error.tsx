"use client";

import { EmptyState } from "@/components/EmptyState";

/** Anything that fails while a page draws shows a plain reason and a way forward, never a raw browser error. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto w-full max-w-xl px-4 py-24">
      <EmptyState
        title="This page could not load"
        line="Nothing has been changed. Try again, or go back to the home page."
        action={
          <button type="button" onClick={reset} className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-on-accent">
            Try again
          </button>
        }
      />
    </main>
  );
}
