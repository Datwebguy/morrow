import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Pricing" };

export default function Pricing() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="text-4xl sm:text-5xl">Pricing</h1>
        <p className="mt-4 max-w-xl text-lg text-muted">A small monthly subscription for each protected loan.</p>
        <p className="mt-3 max-w-xl text-muted">The price is not set yet. It will be shown here before any billing starts, and nothing is charged today.</p>
        <Link href="/app" className="mt-8 inline-flex h-12 items-center rounded-full bg-accent px-6 text-base font-medium text-on-accent">
          Protect my loan
        </Link>
      </main>
      <Footer />
    </>
  );
}
