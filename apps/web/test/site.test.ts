import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ } from "../src/content/faq";
import { RISKS } from "../src/content/risks";
import { layoutLine } from "../src/lib/line";
import { mainResult, replayRows, type ReplayReport } from "../src/lib/replay";

const box = { width: 1000, height: 400, pad: 20 };

describe("price line layout", () => {
  it("draws a still line when there is not enough data, never an invented one", () => {
    const l = layoutLine({ points: [], band: null }, box);
    expect(l.still).toBe(true);
    expect(l.d).toBe("M 20 200 L 980 200");
    expect(l.bandY).toBeNull();
    expect(layoutLine({ points: [{ t: 1, c: 5 }], band: null }, box).still).toBe(true);
  });
  it("scales real points into the box and places the band on the same scale", () => {
    const pts = [{ t: 0, c: 100 }, { t: 10, c: 120 }, { t: 20, c: 110 }];
    const l = layoutLine({ points: pts, band: { price: 90, startLevel: 0.5, marginCallLevel: 0.6 } }, box);
    expect(l.still).toBe(false);
    expect(l.d.startsWith("M 20.0")).toBe(true);
    expect(l.bandY).toBeCloseTo(380); // the lowest value sits on the bottom edge
    expect(l.head).toEqual({ x: 980, y: expect.any(Number) });
    const topY = Number(l.d.split(" L ")[1]!.split(" ")[1]);
    expect(topY).toBeCloseTo(20);
  });
  it("never draws a line across a gap in the data", () => {
    const H = 3_600_000;
    const pts = [0, 1, 2, 3, 60, 61, 62].map((h) => ({ t: h * H, c: 100 + h }));
    const l = layoutLine({ points: pts, band: null }, box);
    expect(l.hasGap).toBe(true);
    expect(l.d.match(/M /g)).toHaveLength(2); // two separate runs of data
    expect(l.gapD.match(/M /g)).toHaveLength(1); // one dashed connector over the closed hours
    const none = layoutLine({ points: [0, 1, 2, 3].map((h) => ({ t: h * H, c: 100 })), band: null }, box);
    expect(none.hasGap).toBe(false);
    expect(none.gapD).toBe("");
  });
  it("handles a flat price", () => {
    const l = layoutLine({ points: [{ t: 0, c: 5 }, { t: 1, c: 5 }], band: null }, box);
    expect(l.d).not.toContain("NaN");
  });
});

describe("replay rows", () => {
  const cell = (o: Partial<Record<string, number>>) => ({ loans: 10, baselineMarginCalls: 3, baselineLiquidations: 1, morrowMarginCalls: 0, morrowLiquidations: 0, usdtUsed: 50, totalDebt: 1000, interestSaved: 1, loansActedOn: 2, ...o });
  const report = {
    simulatedLoan: { backingValueUsdt: 1, idleFractionMain: 0.25 },
    results: [
      { idleFraction: 0.1, train: { all: cell({}), byStartLtv: {}, closures: 1, tokens: 1 }, outOfSample: { all: cell({}), byStartLtv: {}, closures: 1, tokens: 1 } },
      { idleFraction: 0.25, train: { all: cell({}), byStartLtv: { "0.74": cell({ loans: 5 }), "0.65": cell({}) }, closures: 2, tokens: 3 }, outOfSample: { all: cell({}), byStartLtv: {}, closures: 1, tokens: 1 } },
    ],
  } as unknown as ReplayReport;
  it("picks the main idle case and orders rows by start level", () => {
    const main = mainResult(report)!;
    expect(main.idleFraction).toBe(0.25);
    const rows = replayRows(main.train);
    expect(rows.map((r) => r.start)).toEqual([0.65, 0.74]);
    expect(rows[0]).toMatchObject({ withoutMorrow: 4, withMorrow: 0, costShare: 0.05, actedShare: 0.2 });
  });
  it("the shipped report is labelled simulated and has what the page needs", () => {
    const real = JSON.parse(readFileSync(new URL("../public/replay-report.json", import.meta.url), "utf8")) as ReplayReport;
    expect(real.label).toBe("simulated");
    expect(real.caveats.length).toBeGreaterThan(0);
    const main = mainResult(real)!;
    expect(replayRows(main.outOfSample).length).toBeGreaterThan(0);
  });
});

describe("copy", () => {
  const banned = [/\bLTV\b/i, /loan-to-value/i, /collateral/i, /\bpledge/i, /\bAPI key\b/i, /\bOAuth\b/i, /\bhash\b/i, /SHA-?256/i, /revolutioni[sz]ing/i, /\bdefi\b/i];
  it("keeps developer words and hype out of the FAQ and risks", () => {
    for (const t of [...FAQ.flatMap((x) => [x.q, x.a]), ...RISKS.flatMap((x) => [x.title, x.body])]) {
      for (const re of banned) expect(t, t).not.toMatch(re);
    }
  });
  it("keeps every answer short enough for two lines", () => {
    for (const x of FAQ) expect(x.a.length, x.q).toBeLessThanOrEqual(160);
    for (const x of RISKS) expect(x.body.length, x.title).toBeLessThanOrEqual(170);
  });
  it("docs match the site content", () => {
    const faq = readFileSync(new URL("../../../docs/FAQ.md", import.meta.url), "utf8");
    for (const x of FAQ) expect(faq).toContain(x.a);
    const risks = readFileSync(new URL("../../../docs/RISKS.md", import.meta.url), "utf8");
    for (const x of RISKS) expect(risks).toContain(x.body);
  });
  it("never states a price, a promise count or a result in marketing copy", () => {
    const all = [...FAQ.map((x) => x.a), ...RISKS.map((x) => x.body)].join(" ");
    expect(all).not.toMatch(/\$\s?\d|\d\s?USDT|\d+\s?%/);
  });
});

import { badge, ladder, mostCommon, signedPercent } from "../src/lib/market";

describe("market band helpers", () => {
  it("places the levels along a bar that ends at the liquidation level", () => {
    const p = ladder({ start: 0.5, marginCall: 0.6, liquidation: 0.8 });
    expect(p.liquidation).toBe(100);
    expect(p.marginCall).toBeCloseTo(75);
    expect(p.start).toBeCloseTo(62.5);
  });
  it("keeps positions inside the bar", () => {
    expect(ladder({ start: 2, marginCall: -1, liquidation: 1 })).toEqual({ start: 100, marginCall: 0, liquidation: 100 });
  });
  it("finds the most common value and whether all were the same", () => {
    expect(mostCommon([1, 1, 2], String)).toEqual({ item: 1, uniform: false });
    expect(mostCommon([3, 3], String)).toEqual({ item: 3, uniform: true });
    expect(mostCommon([], String)).toBeNull();
  });
  it("makes a two-letter badge and a signed percentage", () => {
    expect(badge("rNVDA")).toBe("NV");
    expect(badge("rA")).toBe("A");
    expect(signedPercent(0.01234)).toBe("+1.23%");
    expect(signedPercent(-0.005)).toBe("−0.50%");
    expect(signedPercent(0)).toBe("+0.00%");
  });
});
