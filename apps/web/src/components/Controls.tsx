import { Reveal } from "./Reveal";

const ITEMS = [
  { title: "You choose the limits", line: "How much Morrow may use per action, per weekend and per month. Until you set them, it uses nothing." },
  { title: "Pause any time", line: "One tap stops every action at once." },
  { title: "It never sells your stocks", line: "It can only pay down a loan or add backing." },
  { title: "It never borrows or withdraws", line: "No new loans. No money leaving your account." },
] as const;

/** Four boxes that slide over each other as you scroll: each one sticks a little lower than the one before. */
export function Controls() {
  return (
    <section aria-labelledby="controls-title" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
      <Reveal>
        <p className="text-sm font-medium text-accent">You stay in charge</p>
        <h2 id="controls-title" className="mt-2 max-w-xl text-3xl sm:text-4xl">Your controls</h2>
      </Reveal>
      <ul className="mt-12 pb-4">
        {ITEMS.map((c, i) => {
          const dark = i === ITEMS.length - 1;
          return (
            <li key={c.title} className="sticky mb-6 last:mb-0" style={{ top: `calc(5.5rem + ${i}rem)` }}>
              <div className={`flex min-h-52 flex-col justify-between rounded-3xl border p-7 shadow-sm sm:min-h-64 sm:p-10 ${dark ? "border-ink bg-ink text-canvas" : "border-line bg-surface"}`}>
                <div className="flex items-start justify-between">
                  <span className={`num text-sm ${dark ? "text-canvas" : "text-muted"}`}>Control {i + 1} of {ITEMS.length}</span>
                  <span aria-hidden className="num text-6xl font-semibold leading-none sm:text-8xl" style={{ color: dark ? "var(--muted)" : "var(--line)" }}>
                    0{i + 1}
                  </span>
                </div>
                <div>
                  <h3 className="text-2xl sm:text-4xl">{c.title}</h3>
                  <p className={`mt-3 max-w-md ${dark ? "text-canvas" : "text-muted"}`}>{c.line}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
