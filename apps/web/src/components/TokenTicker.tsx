"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { TokenMark } from "./TokenMark";
import { signedPercent, type MarketToken } from "@/lib/market";
import { useLogos } from "@/lib/useLogos";
import { useMarket } from "@/lib/useMarket";

function Chip({ t }: { t: MarketToken }) {
  const up = t.change24h >= 0;
  const name = useLogos()?.get(t.coin.toLowerCase())?.name ?? null;
  return (
    <li className="flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <TokenMark coin={t.coin} size={36} />
      <span className="leading-tight">
        <span className="block max-w-40 truncate text-sm font-semibold">{t.coin}{name ? <span className="font-normal text-muted"> · {name}</span> : null}</span>
        <span className="num block text-sm text-muted">{t.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT</span>
      </span>
      <span className={`num ml-1 inline-flex items-center gap-0.5 text-sm font-medium ${up ? "text-safe" : "text-danger"}`}>
        {up ? <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden /> : <ArrowDownRight size={16} strokeWidth={1.75} aria-hidden />}
        {signedPercent(t.change24h)}
      </span>
    </li>
  );
}

/**
 * A slow, endless band of real stock tokens Bitget accepts as loan backing, with live prices. Pauses on hover, and sits still
 * (scrollable by hand) for visitors who ask for less motion. Shows nothing at all if live data cannot load.
 */
export function TokenTicker() {
  const { data, loading, failed } = useMarket();
  if (failed && !data) return null;
  if (loading && !data) return <div className="skeleton mx-auto h-16 w-full max-w-6xl" aria-label="Loading live tokens" />;
  const tokens = data?.tokens ?? [];
  if (tokens.length === 0) return null;
  return (
    <section aria-label="Stock tokens Morrow can protect, live prices" className="ticker border-y border-line bg-canvas py-5">
      <div className="ticker-track flex w-max gap-3">
        <ul className="flex gap-3 pr-3">{tokens.map((t) => <Chip key={t.symbol} t={t} />)}</ul>
        <ul className="flex gap-3 pr-3" aria-hidden>{tokens.map((t) => <Chip key={`${t.symbol}-copy`} t={t} />)}</ul>
      </div>
    </section>
  );
}
