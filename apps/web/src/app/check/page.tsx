import type { Metadata } from "next";
import { CheckMyLoan } from "@/components/CheckMyLoan";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Check my loan",
  description: "Type three numbers and see your loan health and what the next market reopening could do to it. No login, nothing stored.",
};

export default function CheckPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="text-4xl sm:text-5xl">Check my loan</h1>
        <p className="mt-3 max-w-xl text-muted">Three numbers in, live Bitget data out. It never touches your account.</p>
        <div className="mt-10">
          <CheckMyLoan />
        </div>
      </main>
      <Footer />
    </>
  );
}
