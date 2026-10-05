"use client";

import { useEffect, useState } from "react";
import { request, WORKER_URL } from "./api";

/** What the server knows about a token's logo and company name. Real data only: a token with no logo shows initials. */
export interface LogoInfo {
  name: string | null;
  hasImage: boolean;
  source: string;
  fetchedAt: number;
}

export type LogoMap = Map<string, LogoInfo>;

let pending: Promise<LogoMap> | null = null;

/** Reads the logo index once per page load. A failure gives an empty map, so everything shows initials, and is tried again later. */
export function loadLogos(): Promise<LogoMap> {
  if (!WORKER_URL) return Promise.resolve(new Map());
  pending ??= request<{ logos?: Array<{ coin: string; name: string | null; source: string; hasImage: boolean; fetchedAt: number }> }>("/public/logos", { key: null })
    .then((d) => new Map((Array.isArray(d.logos) ? d.logos : []).map((l) => [l.coin.toLowerCase(), { name: l.name, hasImage: l.hasImage, source: l.source, fetchedAt: l.fetchedAt }] as const)))
    .catch(() => {
      setTimeout(() => (pending = null), 60_000);
      return new Map();
    });
  return pending;
}

/** The logo index, or null while it loads. */
export function useLogos(): LogoMap | null {
  const [map, setMap] = useState<LogoMap | null>(null);
  useEffect(() => {
    let alive = true;
    void loadLogos().then((m) => alive && setMap(m));
    return () => {
      alive = false;
    };
  }, []);
  return map;
}

export function logoSrc(coin: string): string {
  return `${WORKER_URL}/public/logo/${encodeURIComponent(coin)}`;
}
