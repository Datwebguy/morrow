import { Controls } from "@/components/Controls";
import { Faq } from "@/components/Faq";
import { FinalCall } from "@/components/FinalCall";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Levels } from "@/components/Levels";
import { TokenTicker } from "@/components/TokenTicker";
import { HowItWorks } from "@/components/HowItWorks";
import { LiveStrip } from "@/components/LiveStrip";
import { SiteHeader } from "@/components/SiteHeader";
import { WhyItMatters } from "@/components/WhyItMatters";

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
        <TokenTicker />
        <LiveStrip />
        <HowItWorks />
        <Levels />
        <WhyItMatters />
        <Controls />
        <Faq />
        <FinalCall />
      </main>
      <Footer />
    </>
  );
}
