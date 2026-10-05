/** The shape of the live price line, and the maths that places it on a drawing. No data of its own. */

export interface LinePoint {
  t: number;
  c: number;
}

export interface LineData {
  /** Spot symbol of the stock token drawn, chosen live as the busiest backing token. */
  symbol: string;
  coin: string;
  points: LinePoint[];
  /**
   * The price at which a loan opened at the start level, at the first price on this chart, would reach the margin-call level.
   * Both levels come live from Bitget.
   */
  band: { price: number; startLevel: number; marginCallLevel: number } | null;
  asOf: number;
}

export interface Box {
  width: number;
  height: number;
  pad: number;
}

/** Turns points into an SVG path, scaled to a box. Returns the y of the band too. A single point gives a still line. */
export function layoutLine(data: Pick<LineData, "points" | "band">, box: Box): { d: string; bandY: number | null; head: { x: number; y: number } | null; still: boolean } {
  const pts = data.points;
  if (pts.length < 2) {
    const y = box.height / 2;
    return { d: `M ${box.pad} ${y} L ${box.width - box.pad} ${y}`, bandY: null, head: null, still: true };
  }
  const prices = pts.map((p) => p.c);
  const all = data.band ? [...prices, data.band.price] : prices;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const t0 = pts[0]!.t;
  const t1 = pts[pts.length - 1]!.t;
  const w = box.width - box.pad * 2;
  const h = box.height - box.pad * 2;
  const x = (t: number): number => box.pad + ((t - t0) / (t1 - t0 || 1)) * w;
  const y = (p: number): number => box.pad + (1 - (p - lo) / span) * h;
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)} ${y(p.c).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  return { d, bandY: data.band ? y(data.band.price) : null, head: { x: x(last.t), y: y(last.c) }, still: false };
}
