/** Shapes and small helpers for the live market band. No data of its own. */

export interface MarketToken {
  coin: string;
  symbol: string;
  price: number;
  /** 24-hour change as a ratio (0.01 is one percent). */
  change24h: number;
}

export interface MarketData {
  /** How many stock tokens Bitget accepts as loan backing right now. */
  backingCount: number;
  /** The most common start, margin-call and liquidation levels across those tokens, read live. */
  levels: { start: number; marginCall: number; liquidation: number } | null;
  /** True when every accepted token has the same levels. */
  uniform: boolean;
  tokens: MarketToken[];
  asOf: number;
}

export interface Ladder {
  /** Positions of each level along a bar that runs from zero to the liquidation level, as percentages. */
  start: number;
  marginCall: number;
  liquidation: number;
}

/** Where the three levels sit on a bar from zero to the liquidation level. */
export function ladder(l: { start: number; marginCall: number; liquidation: number }): Ladder {
  const at = (x: number): number => Math.max(0, Math.min(100, (x / l.liquidation) * 100));
  return { start: at(l.start), marginCall: at(l.marginCall), liquidation: 100 };
}

/** The most common value in a list, and whether every item was the same. */
export function mostCommon<T>(items: T[], key: (t: T) => string): { item: T; uniform: boolean } | null {
  if (items.length === 0) return null;
  const counts = new Map<string, { n: number; item: T }>();
  for (const it of items) {
    const k = key(it);
    const c = counts.get(k);
    if (c) c.n += 1;
    else counts.set(k, { n: 1, item: it });
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0]!;
  return { item: best.item, uniform: counts.size === 1 };
}

/** Two letters for a token's round badge, from its ticker (for example the badge for rNVDA is NV). */
export function badge(coin: string): string {
  const t = coin.replace(/^r/, "");
  return t.slice(0, 2).toUpperCase();
}

export function signedPercent(ratio: number): string {
  const p = ratio * 100;
  return `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(2)}%`;
}
