"use client";

import { useEffect, useState } from "react";
import { WORKER_URL } from "./api";
import type { PublicRecord } from "./types";

/** The public record, read without a login. `null` until it loads or when no server is linked. */
export function usePublicRecord(): { data: PublicRecord | null; failed: boolean; loading: boolean } {
  const [data, setData] = useState<PublicRecord | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(WORKER_URL));
  useEffect(() => {
    if (!WORKER_URL) return;
    let alive = true;
    fetch(`${WORKER_URL}/public/record`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no record"))))
      .then((d: PublicRecord) => alive && setData(d))
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  return { data, failed, loading };
}
