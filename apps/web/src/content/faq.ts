export interface Qa {
  q: string;
  a: string;
}

/** Plain-words answers. Shown on the site, and copied into docs/FAQ.md. */
export const FAQ: Qa[] = [
  { q: "What does Morrow do?", a: "It watches your Bitget stock loans. If one is heading for a margin call at the next reopening, it pays some down or adds backing first." },
  { q: "Can it sell my stocks?", a: "No. It can only pay down a loan with the coin you borrowed, or add more of the token already backing it. It never sells, borrows or withdraws." },
  { q: "What is a margin call?", a: "When a loan outgrows what backs it, Bitget asks you to act, and later sells your backing. Morrow reads those levels from Bitget live." },
  { q: "Why does the weekend matter?", a: "US markets close for weekends and holidays, then reopen at a new price. A loan near its limit can cross it while you are away." },
  { q: "How does Morrow know what Monday looks like?", a: "Some tokens trade all weekend and Morrow uses that price if it passes its checks. Others pause, so it uses how that stock gapped before." },
  { q: "What if a weekend price looks wrong?", a: "It checks the last trade, the spread, the orders near the price and the distance from the last close. If any check fails, it ignores that price." },
  { q: "How much control do I keep?", a: "You set limits per action, weekend and month, and pick Ask me first or Protect automatically. Pause all stops everything." },
  { q: "What is a sealed promise?", a: "Before each closure Morrow writes its plan and publishes its fingerprint at once. After the reopen it grades itself in public." },
  { q: "What does it cost?", a: "A small monthly subscription for each protected loan. The price will be shown before any billing starts." },
  { q: "Can protection fail?", a: "Yes. Protection reduces risk. It cannot remove it. With no idle balance, or past your limits, Morrow can only alert you." },
];
