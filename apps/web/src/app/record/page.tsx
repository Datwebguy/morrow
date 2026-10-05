import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { LogDownload } from "@/components/LogDownload";
import { RecordView } from "@/components/RecordView";
import { ReplayHeadline } from "@/components/ReplayHeadline";
import { ReplaySection } from "@/components/ReplaySection";
import { SiteHeader } from "@/components/SiteHeader";
import type { ReplayReport } from "@/lib/replay";
import report from "../../../public/replay-report.json";

export const metadata: Metadata = { title: "The record", description: "What the history replay found, every sealed promise and its grade, and the full decision log." };

export default function RecordPage() {
  const r = report as unknown as ReplayReport;
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="text-4xl sm:text-5xl">The record</h1>
        <p className="mt-3 max-w-xl text-muted">What Morrow found on real weekends, then every promise it seals and grades.</p>
        <div className="mt-8">
          <ReplayHeadline report={r} />
        </div>
        <section aria-labelledby="live-title" className="mt-14">
          <h2 id="live-title" className="text-2xl sm:text-3xl">Sealed promises</h2>
          <p className="mb-6 mt-2 max-w-xl text-muted">Sealed an hour before each closure, graded thirty minutes after the reopen.</p>
          <RecordView />
        </section>
        <LogDownload />
        <ReplaySection report={r} />
      </main>
      <Footer />
    </>
  );
}
