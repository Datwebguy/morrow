import { NextResponse } from "next/server";
import { BITGET_BASE_URL, BITGET_PATHS } from "@morrow/config";
import { fetchCollateralStocks } from "@morrow/bitget/src/market";
import { mostCommon, type MarketData, type MarketToken } from "@/lib/market";

// Live data, refreshed at most once a minute.
export const revalidate = 60;

/** How many tokens the scrolling band shows. Presentation choice. */
const BAND_SIZE = 24;

interface Ticker {
  symbol: string;
  lastPr: string;
  change24h: string;
  usdtVolume: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const stocks = await fetchCollateralStocks();
    const res = await fetch(`${BITGET_BASE_URL}${BITGET_PATHS.tickers}`);
    if (!res.ok) throw new Error("tickers");
    const body = (await res.json()) as { data?: Ticker[] };
    const online = new Map(stocks.filter((s) => s.online).map((s) => [s.symbol, s]));
    const tokens: MarketToken[] = (body.data ?? [])
      .filter((t) => online.has(t.symbol) && Number(t.lastPr) > 0)
      .sort((a, b) => Number(b.usdtVolume) - Number(a.usdtVolume))
      .slice(0, BAND_SIZE)
      .map((t) => ({ coin: online.get(t.symbol)!.baseCoin, symbol: t.symbol, price: Number(t.lastPr), change24h: Number(t.change24h) }));
    const common = mostCommon(stocks, (s) => `${s.limits.start}/${s.limits.marginCall}/${s.limits.liquidation}`);
    const data: MarketData = {
      backingCount: stocks.length,
      levels: common ? { start: common.item.limits.start, marginCall: common.item.limits.marginCall, liquidation: common.item.limits.liquidation } : null,
      uniform: common?.uniform ?? false,
      tokens,
      asOf: Date.now(),
    };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Live market data is not available right now." }, { status: 502 });
  }
}
