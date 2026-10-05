// Re-reads the NYSE calendar and writes packages/config/src/nyse-calendar.json.
// Run: node tools/fetch-nyse-calendar.mjs   (the worker repeats this check on a schedule)
import { writeFileSync } from "node:fs";
import { parseNyseCalendar } from "./nyse-calendar.mjs";

const SOURCE = "https://www.nyse.com/trade/hours-calendars";
const res = await fetch(SOURCE, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0" } });
if (!res.ok) throw new Error(`NYSE answered with status ${res.status}`);
const parsed = parseNyseCalendar(await res.text());
const out = {
  source: SOURCE,
  fetchedAt: new Date().toISOString(),
  timezone: "America/New_York",
  ...parsed,
};
writeFileSync(new URL("../packages/config/src/nyse-calendar.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`Saved ${out.holidays.length} holidays and ${out.earlyCloses.length} early closes for ${out.years.join(", ")}`);
