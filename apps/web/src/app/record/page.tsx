import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { RecordView } from "@/components/RecordView";
import { ReplaySection } from "@/components/ReplaySection";
import { SiteHeader } from "@/components/SiteHeader";
import type { ReplayReport } from "@/lib/replay";
import report from "../../../public/replay-report.json";

export const metadata: Metadata = { title: "The record", description: "Every sealed promise and its grade, and the history replay." };

export default function RecordPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="text-4xl sm:text-5xl">The record</h1>
        <p className="mt-3 max-w-xl text-muted">Every promise is sealed before the market closes, then graded after it reopens.</p>
        <div className="mt-10">
          <RecordView />
        </div>
        <ReplaySection report={report as unknown as ReplayReport} />
      </main>
      <Footer />
    </>
  );
}
