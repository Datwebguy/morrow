import { NextResponse } from "next/server";
import { BITGET_BASE_URL, BITGET_PATHS, MS_PER_DAY } from "@morrow/config";
import { fetchCollateralStocks, fetchHourlyHistory } from "@morrow/bitget/src/market";
import type { LineData } from "@/lib/line";

// Live data, refreshed at most once a minute.
export const revalidate = 60;

/** How many days of hourly prices the line shows. Presentation choice. */
const DAYS = 5;

interface Ticker {
  symbol: string;
  usdtVolume: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const stocks = await fetchCollateralStocks();
    const online = new Map(stocks.filter((s) => s.online).map((s) => [s.symbol, s]));
    const res = await fetch(`${BITGET_BASE_URL}${BITGET_PATHS.tickers}`);
    if (!res.ok) throw new Error("tickers");
    const body = (await res.json()) as { data?: Ticker[] };
    const busiest = (body.data ?? [])
      .filter((t) => online.has(t.symbol))
      .sort((a, b) => Number(b.usdtVolume) - Number(a.usdtVolume))[0];
    if (!busiest) throw new Error("no token");
    const stock = online.get(busiest.symbol)!;
    const now = Date.now();
    const candles = await fetchHourlyHistory(stock.symbol, now - DAYS * MS_PER_DAY, now);
    const points = candles.map((c) => ({ t: c.t, c: c.close }));
    const first = points[0];
    const data: LineData = {
      symbol: stock.symbol,
      coin: stock.baseCoin,
      points,
      band: first
        ? { price: (first.c * stock.limits.start) / stock.limits.marginCall, startLevel: stock.limits.start, marginCallLevel: stock.limits.marginCall }
        : null,
      asOf: now,
    };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Live prices are not available right now." }, { status: 502 });
  }
}
