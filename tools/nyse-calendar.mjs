// Parses NYSE's official hours-and-calendars page into a stored calendar.
// Source: https://www.nyse.com/trade/hours-calendars (the page the NYSE markets/hours-calendars link leads to).
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function monthIndex(word) {
  const w = word.toLowerCase();
  const i = MONTHS.findIndex((m) => m.startsWith(w.slice(0, 3)));
  if (i < 0) throw new Error(`Unknown month "${word}"`);
  return i;
}

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function clean(s) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns { years, holidays: [{date, name}], earlyCloses: [{date}], coreOpen, coreClose, earlyCloseTime }. */
export function parseNyseCalendar(html) {
  const table = html.match(/<table[\s\S]*?<\/table>/);
  if (!table) throw new Error("Holiday table not found on the NYSE page");
  const rows = [...table[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) =>
    [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => clean(c[1])),
  );
  const header = rows[0];
  if (!header || header[0] !== "Holiday") throw new Error("Unexpected holiday table header");
  const years = header.slice(1).map((y) => Number(y));
  if (years.some((y) => !Number.isInteger(y))) throw new Error("Holiday table years not recognised");

  const holidays = [];
  for (const row of rows.slice(1)) {
    const name = row[0];
    row.slice(1).forEach((cell, idx) => {
      const m = cell.match(/([A-Za-z]+),\s+([A-Za-z]+)\s+(\d{1,2})/);
      if (!m) return; // for example "—*": no holiday that year
      holidays.push({ date: isoDate(years[idx], monthIndex(m[2]), Number(m[3])), name });
    });
  }

  const text = clean(html.replace(/<script[\s\S]*?<\/script>/g, " "));
  const earlyCloses = [];
  for (const seg of text.matchAll(/close early at \d{1,2}:\d{2} [ap]\.m\.(.*?)(?:\. [A-Z]| \(the day)/g)) {
    for (const m of seg[1].matchAll(/([A-Z][a-z]+)\.? (\d{1,2}), (\d{4})/g)) {
      earlyCloses.push({ date: isoDate(Number(m[3]), monthIndex(m[1]), Number(m[2])) });
    }
  }

  const core = text.match(/Core Trading Session: (\d{1,2}:\d{2}) a\.m\. to (\d{1,2}):(\d{2}) p\.m\. ET/);
  if (!core) throw new Error("Core trading hours not found on the NYSE page");
  const early = text.match(/close early at (\d{1,2}):(\d{2}) p\.m\./);
  if (!early) throw new Error("Early close time not found on the NYSE page");
  const pad = (h, m) => `${String(h).padStart(2, "0")}:${m}`;
  const to24 = (h) => (Number(h) % 12) + 12;
  return {
    years,
    holidays: holidays.sort((a, b) => a.date.localeCompare(b.date)),
    earlyCloses: earlyCloses.sort((a, b) => a.date.localeCompare(b.date)),
    coreOpen: pad(Number(core[1].split(":")[0]), core[1].split(":")[1]),
    coreClose: pad(to24(core[2]), core[3]),
    earlyCloseTime: pad(to24(early[1]), early[2]),
  };
}
