"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, request } from "./api";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  status: number | null;
  loading: boolean;
  refresh: () => void;
}

/** Fetches a route now and every `everyMs`. Keeps the last good data while a refresh runs. */
export function useApi<T>(path: string | null, everyMs = 15_000, opts: { key?: string | null; baseUrl?: string } = {}): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (path === null) return;
    try {
      const d = await request<T>(path, opts);
      if (!alive.current) return;
      setData(d);
      setError(null);
      setStatus(200);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setStatus(e instanceof ApiError ? e.status : null);
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, opts.key, opts.baseUrl]);

  useEffect(() => {
    alive.current = true;
    setLoading(path !== null);
    void load();
    if (path === null || everyMs <= 0) return () => void (alive.current = false);
    const t = setInterval(() => void load(), everyMs);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [load, path, everyMs]);

  return { data, error, status, loading, refresh: () => void load() };
}
