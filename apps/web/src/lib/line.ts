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

export interface Layout {
  /** Solid path: one run per stretch of data. A gap in the data starts a new run, so no line is drawn across it. */
  d: string;
  /** Dashed connectors across gaps (the market was closed and nothing traded). Empty when there are none. */
  gapD: string;
  hasGap: boolean;
  bandY: number | null;
  head: { x: number; y: number } | null;
  still: boolean;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/**
 * Turns points into SVG paths, scaled to a box. A single point gives a still line.
 * A jump in time bigger than 2.5 times the usual spacing is a gap in the data: the solid line stops and a dashed
 * connector is drawn instead, so the chart never implies prices that were not there.
 */
export function layoutLine(data: Pick<LineData, "points" | "band">, box: Box): Layout {
  const pts = data.points;
  if (pts.length < 2) {
    const y = box.height / 2;
    return { d: `M ${box.pad} ${y} L ${box.width - box.pad} ${y}`, gapD: "", hasGap: false, bandY: null, head: null, still: true };
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
  const usual = median(pts.slice(1).map((p, i) => p.t - pts[i]!.t));
  const solid: string[] = [];
  const dashed: string[] = [];
  pts.forEach((p, i) => {
    const prev = pts[i - 1];
    const cx = x(p.t).toFixed(1);
    const cy = y(p.c).toFixed(1);
    if (!prev) {
      solid.push(`M ${cx} ${cy}`);
    } else if (usual > 0 && p.t - prev.t > usual * 2.5) {
      dashed.push(`M ${x(prev.t).toFixed(1)} ${y(prev.c).toFixed(1)} L ${cx} ${cy}`);
      solid.push(`M ${cx} ${cy}`);
    } else {
      solid.push(`L ${cx} ${cy}`);
    }
  });
  const last = pts[pts.length - 1]!;
  return { d: solid.join(" "), gapD: dashed.join(" "), hasGap: dashed.length > 0, bandY: data.band ? y(data.band.price) : null, head: { x: x(last.t), y: y(last.c) }, still: false };
}
