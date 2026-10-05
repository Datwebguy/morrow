export interface Risk {
  title: string;
  body: string;
}

/** Plain-words risks. Shown on the risks page, and copied into docs/RISKS.md. */
export const RISKS: Risk[] = [
  { title: "Protection reduces risk. It cannot remove it.", body: "Markets can move further and faster than any past weekend. A loan can still reach a margin call or be sold." },
  { title: "Paying down cannot be undone", body: "Money paid into a loan goes to Bitget. Getting it back means borrowing again. That is why Ask me first exists." },
  { title: "Morrow needs idle balance", body: "It can only use USDT or the backing token you hold and have not locked, and only inside the limits you set. With none available it can only alert you." },
  { title: "Weekend prices can be thin", body: "Some stock tokens trade very little outside US hours. Morrow checks every price before using it and ignores prices that fail, but a check cannot catch everything." },
  { title: "Bitget sets the rules", body: "Margin-call and liquidation levels, and how backing is valued while the US market is closed, are Bitget's. Where that is unclear, Morrow plans for the worse case." },
  { title: "The replay is a test, not a promise", body: "The history replay uses real prices and simulated loans over a short window. Its results can look better or worse than the future." },
  { title: "Software can fail", body: "A server can be down, a data feed can lag, a connection can drop. Morrow does nothing when its data is missing or old, which means it can also miss a chance to act." },
];
