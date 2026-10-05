export interface ParsedCalendar {
  years: number[];
  holidays: Array<{ date: string; name: string }>;
  earlyCloses: Array<{ date: string }>;
  coreOpen: string;
  coreClose: string;
  earlyCloseTime: string;
}
export function parseNyseCalendar(html: string): ParsedCalendar;
