import { describe, expect, it } from "vitest";
import { buildClosures, currentOrNextClosure, zonedTimeToUtcMs, type CalendarInput } from "../src";

// Test fixture: a tiny calendar. The Monday 2030-01-21 holiday and the 2030-07-03 early close are test inputs.
const cal: CalendarInput = {
  timezone: "America/New_York",
  years: [2030],
  holidays: [{ date: "2030-01-21" }],
  earlyCloses: [{ date: "2030-07-03" }],
  coreOpen: "09:30",
  coreClose: "16:00",
  earlyCloseTime: "13:00",
};
const utc = (s: string): number => Date.parse(s);

describe("zonedTimeToUtcMs", () => {
  it("handles winter and summer offsets", () => {
    expect(zonedTimeToUtcMs("2030-01-18", "16:00", "America/New_York")).toBe(utc("2030-01-18T21:00:00Z"));
    expect(zonedTimeToUtcMs("2030-07-02", "16:00", "America/New_York")).toBe(utc("2030-07-02T20:00:00Z"));
  });
  it("handles the day after the clocks change", () => {
    expect(zonedTimeToUtcMs("2030-03-11", "09:30", "America/New_York")).toBe(utc("2030-03-11T13:30:00Z"));
  });
});

describe("buildClosures", () => {
  it("builds a weekend closure from Friday close to Monday open", () => {
    const c = buildClosures(cal, utc("2030-01-15T00:00:00Z"), utc("2030-01-17T00:00:00Z"));
    expect(c).toHaveLength(0);
    const w = buildClosures(cal, utc("2030-01-10T00:00:00Z"), utc("2030-01-14T00:00:00Z"));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ closeDate: "2030-01-11", reopenDate: "2030-01-14", closeTs: utc("2030-01-11T21:00:00Z"), reopenTs: utc("2030-01-14T14:30:00Z") });
  });
  it("extends a weekend over a Monday holiday", () => {
    const c = buildClosures(cal, utc("2030-01-18T00:00:00Z"), utc("2030-01-23T00:00:00Z"));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ closeDate: "2030-01-18", reopenDate: "2030-01-22" });
  });
  it("does not treat an early close before a trading day as a closure", () => {
    const c = buildClosures(cal, utc("2030-07-01T00:00:00Z"), utc("2030-07-06T00:00:00Z"));
    expect(c.map((x) => x.closeDate)).toEqual(["2030-06-28", "2030-07-05"]);
  });
  it("marks an early close", () => {
    const e = buildClosures({ ...cal, holidays: [{ date: "2030-07-04" }] }, utc("2030-07-01T00:00:00Z"), utc("2030-07-10T00:00:00Z"));
    const first = e.find((x) => x.closeDate === "2030-07-03");
    expect(first).toMatchObject({ earlyClose: true, reopenDate: "2030-07-05", closeTs: utc("2030-07-03T17:00:00Z") });
  });
  it("refuses a range the calendar does not cover", () => {
    expect(() => buildClosures(cal, utc("2031-01-01T00:00:00Z"), utc("2031-02-01T00:00:00Z"))).toThrow();
  });
});

describe("currentOrNextClosure", () => {
  it("returns the closure in progress on a Saturday", () => {
    const c = currentOrNextClosure(cal, utc("2030-01-12T12:00:00Z"));
    expect(c?.closeDate).toBe("2030-01-11");
  });
  it("returns the next closure on a Tuesday", () => {
    const c = currentOrNextClosure(cal, utc("2030-01-15T12:00:00Z"));
    expect(c?.closeDate).toBe("2030-01-18");
  });
});
