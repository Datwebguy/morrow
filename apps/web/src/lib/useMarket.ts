"use client";

import { useEffect, useState } from "react";
import type { MarketData } from "./market";

const REFRESH_MS = 60_000;

/** Live market band data. `failed` is true when it could not be loaded; nothing is invented in that case. */
export function useMarket(): { data: MarketData | null; failed: boolean; loading: boolean } {
  const [data, setData] = useState<MarketData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/market", { cache: "no-store" });
        if (!r.ok) throw new Error("no data");
        const d = (await r.json()) as MarketData;
        if (alive) {
          setData(d);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { data, failed, loading };
}
