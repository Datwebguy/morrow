"use client";

import { useState } from "react";
import { logoSrc, useLogos } from "@/lib/useLogos";

/** Two letters for the badge: the first letters of a company's first two words, or else the start of the ticker. */
export function initials(coin: string, name: string | null): string {
  const words = (name ?? "").split(/[^A-Za-z0-9]+/).filter((w) => w.length > 0);
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  return coin.replace(/^r/i, "").slice(0, 2).toUpperCase();
}

/**
 * A stock token's real logo (CoinGecko, or the company's own site), or a neat initials badge when none exists.
 * A logo is never invented.
 */
export function TokenMark({ coin, size = 32, className = "" }: { coin: string; size?: number; className?: string }) {
  const logos = useLogos();
  const info = logos?.get(coin.toLowerCase()) ?? null;
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (info?.hasImage && !failed) {
    return (
      <img src={logoSrc(coin)} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} style={box} className={`shrink-0 rounded-full bg-white object-contain ring-1 ring-line ${className}`} />
    );
  }
  return (
    <span aria-hidden className={`num inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-semibold text-canvas ${className}`} style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.38)) }}>
      {initials(coin, info?.name ?? null)}
    </span>
  );
}

/** "rNVDA · Nvidia" with the logo in front. The name is the real company name, shown only when known. */
export function TokenLabel({ coin, name, size = 24, className = "", strong = true }: { coin: string; name?: string | null; size?: number; className?: string; strong?: boolean }) {
  const logos = useLogos();
  const company = name ?? logos?.get(coin.toLowerCase())?.name ?? null;
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <TokenMark coin={coin} size={size} />
      <span className="min-w-0 truncate">
        <span className={strong ? "font-semibold" : ""}>{coin}</span>
        {company ? <span className="text-muted"> · {company}</span> : null}
      </span>
    </span>
  );
}
