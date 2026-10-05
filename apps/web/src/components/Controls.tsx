import { Reveal } from "./Reveal";

const ITEMS = [
  { title: "You choose the limits", line: "How much Morrow may use per action, per weekend and per month. Until you set them, it uses nothing." },
  { title: "Pause any time", line: "One tap stops every action at once." },
  { title: "It never sells your stocks", line: "It can only pay down a loan or add backing." },
  { title: "It never borrows or withdraws", line: "No new loans. No money leaving your account." },
] as const;

export function Controls() {
  return (
    <section aria-labelledby="controls-title" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
      <Reveal>
        <p className="text-sm font-medium text-accent">You stay in charge</p>
        <h2 id="controls-title" className="mt-2 max-w-xl text-3xl sm:text-4xl">Your controls</h2>
      </Reveal>
      <ul className="mt-12 divide-y divide-line border-y border-line">
        {ITEMS.map((c, i) => (
          <li key={c.title}>
            <Reveal delay={i * 0.05} className="grid gap-2 py-7 sm:grid-cols-[1.1fr_1fr] sm:items-baseline sm:gap-10">
              <h3 className="text-xl sm:text-2xl">{c.title}</h3>
              <p className="max-w-md text-muted">{c.line}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
