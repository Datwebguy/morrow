import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { RISKS } from "@/content/risks";

export const metadata: Metadata = { title: "Risks" };

export default function Risks() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="text-4xl sm:text-5xl">Risks</h1>
        <p className="mt-3 max-w-xl text-muted">Read these before you protect a loan.</p>
        <ul className="mt-10 divide-y divide-line border-y border-line">
          {RISKS.map((r) => (
            <li key={r.title} className="py-6">
              <h2 className="text-lg">{r.title}</h2>
              <p className="mt-2 max-w-2xl text-muted">{r.body}</p>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </>
  );
}
