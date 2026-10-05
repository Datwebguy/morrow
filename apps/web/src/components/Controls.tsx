import { Ban, PauseCircle, SlidersHorizontal, WalletMinimal } from "lucide-react";
import { Reveal } from "./Reveal";

const CARDS = [
  { Icon: SlidersHorizontal, title: "You choose the limits", line: "Limits per action, per weekend and per month." },
  { Icon: PauseCircle, title: "Pause any time", line: "One tap stops every action at once." },
  { Icon: Ban, title: "It never sells your stocks", line: "It can only pay down a loan or add backing." },
  { Icon: WalletMinimal, title: "It never borrows or withdraws", line: "No new loans. No money leaving your account." },
] as const;

export function Controls() {
  return (
    <section aria-labelledby="controls-title" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
      <Reveal>
        <h2 id="controls-title" className="max-w-xl text-3xl sm:text-4xl">Your controls</h2>
      </Reveal>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(({ Icon, title, line }, i) => (
          <li key={title}>
            <Reveal delay={i * 0.06} className="h-full">
              <div className="h-full rounded-2xl border border-line bg-surface p-6">
                <Icon size={24} strokeWidth={1.75} className="text-ink" aria-hidden />
                <h3 className="mt-5 text-lg">{title}</h3>
                <p className="mt-2 text-sm text-muted">{line}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
