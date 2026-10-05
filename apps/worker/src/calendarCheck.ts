import { NYSE_CALENDAR } from "@morrow/config";
import { parseNyseCalendar } from "../../../tools/nyse-calendar.mjs";
import type { Store } from "./db";

export interface CalendarCheck {
  at: number;
  ok: boolean;
  detail: string;
}

/** Re-reads the official NYSE page and compares it with the stored calendar. A difference is reported, never silently ignored. */
export async function checkCalendar(store: Store, nowMs: number, fetchImpl: typeof fetch = fetch): Promise<CalendarCheck> {
  let result: CalendarCheck;
  try {
    const res = await fetchImpl(NYSE_CALENDAR.source, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`NYSE answered with status ${res.status}`);
    const live = parseNyseCalendar(await res.text());
    const same = JSON.stringify(live.holidays) === JSON.stringify(NYSE_CALENDAR.holidays) && JSON.stringify(live.earlyCloses) === JSON.stringify(NYSE_CALENDAR.earlyCloses);
    result = same
      ? { at: nowMs, ok: true, detail: "The stored calendar matches the official NYSE page." }
      : { at: nowMs, ok: false, detail: "The official NYSE page differs from the stored calendar. Run tools/fetch-nyse-calendar.mjs and redeploy." };
  } catch (e) {
    result = { at: nowMs, ok: false, detail: `The official NYSE page could not be checked (${e instanceof Error ? e.message : "unknown reason"}).` };
  }
  store.setSetting("calendar_check", result);
  return result;
}
