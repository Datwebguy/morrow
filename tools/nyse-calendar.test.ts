import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module
import { parseNyseCalendar } from "./nyse-calendar.mjs";

// Test fixture: a small page shaped like the NYSE calendar page. Not product data.
const page = `<html><body><table>
<tr><th>Holiday</th><th>2030</th><th>2031</th></tr>
<tr><th>New Year’s Day</th><td>Tuesday, January 1</td><td>—*</td></tr>
<tr><th>Independence Day</th><td>Thursday, July 4**</td><td>Friday, July 4 (observed)</td></tr>
</table>
<p>** Each market will close early at 1:00 p.m. (1:15 p.m. for eligible options) on Wednesday, July 3, 2030. All times are Eastern Time.</p>
<p>*** Each market will close early at 1:00 p.m. (1:15 p.m. for eligible options) on Friday, November 29, 2030 and Friday, November 28, 2031 (the day after Thanksgiving). All times are Eastern Time.</p>
<p>Core Trading Session: 9:30 a.m. to 4:00 p.m. ET</p></body></html>`;

describe("parseNyseCalendar", () => {
  const c = parseNyseCalendar(page);
  it("reads holidays by year and skips years with none", () => {
    expect(c.years).toEqual([2030, 2031]);
    expect(c.holidays).toEqual([
      { date: "2030-01-01", name: "New Year’s Day" },
      { date: "2030-07-04", name: "Independence Day" },
      { date: "2031-07-04", name: "Independence Day" },
    ]);
  });
  it("reads early closes and hours", () => {
    expect(c.earlyCloses).toEqual([{ date: "2030-07-03" }, { date: "2030-11-29" }, { date: "2031-11-28" }]);
    expect(c.coreOpen).toBe("09:30");
    expect(c.coreClose).toBe("16:00");
    expect(c.earlyCloseTime).toBe("13:00");
  });
  it("fails loudly when the page changes shape", () => {
    expect(() => parseNyseCalendar("<html></html>")).toThrow();
    expect(() => parseNyseCalendar(page.replace("Holiday", "Day"))).toThrow();
  });
});
