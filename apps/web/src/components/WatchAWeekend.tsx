"use client";

import { Loader2, Play, RotateCcw, SkipForward } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TokenPicker } from "./TokenPicker";
import { WatchChart } from "./WatchChart";
import { request, WORKER_URL } from "@/lib/api";
import { amount, dateTime, percent } from "@/lib/format";
import type { FeaturedClosure, TokenOption, WatchResult } from "@/lib/types";

const STEP_MS = 2400; // time on each step while it plays; the viewer can skip

type Phase = "idle" | "loading" | "playing" | "done";

/** Anyone presses Start and watches Morrow handle one real past weekend, step by step. Simulated loan, real prices. */
export function WatchAWeekend() {
  const params = useSearchParams();
  const reduced = useReducedMotion();
  const paramToken = params.get("token") ?? "";
  const backing = params.get("backing");
  const borrowed = params.get("borrowed");
  const yours = backing !== null && borrowed !== null && Number(backing) > 0 && Number(borrowed) > 0;

  const [tokens, setTokens] = useState<TokenOption[] | null>(null);
  const [tokensFailed, setTokensFailed] = useState(false);
  const [featured, setFeatured] = useState<FeaturedClosure | null>(null);
  const [token, setToken] = useState(paramToken);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WatchResult | null>(null);
  const [shown, setShown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!WORKER_URL) return;
    let alive = true;
    request<{ tokens: TokenOption[] }>("/public/check/tokens", { key: null })
      .then((d) => alive && setTokens(d.tokens))
      .catch(() => alive && setTokensFailed(true));
    request<{ featured: FeaturedClosure | null }>("/public/watch/featured", { key: null })
      .then((d) => {
        if (!alive) return;
        setFeatured(d.featured);
        setToken((t) => t || d.featured?.coin || "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const play = (r: WatchResult) => {
    stop();
    setResult(r);
    if (reduced) {
      setShown(r.steps.length);
      setPhase("done");
      return;
    }
    setShown(1);
    setPhase("playing");
    timer.current = setInterval(() => {
      setShown((n) => {
        if (n + 1 >= r.steps.length) {
          stop();
          setPhase("done");
        }
        return Math.min(r.steps.length, n + 1);
      });
    }, STEP_MS);
  };

  const start = async () => {
    if (!token) return;
    stop();
    setPhase("loading");
    setError(null);
    setResult(null);
    const q = new URLSearchParams({ token });
    if (yours) {
      q.set("backing", backing as string);
      q.set("borrowed", borrowed as string);
    }
    try {
      play(await request<WatchResult>(`/public/watch?${q.toString()}`, { key: null }));
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "That did not work. Try again.");
    }
  };

  const skip = () => {
    if (!result) return;
    stop();
    setShown(result.steps.length);
    setPhase("done");
  };

  if (!WORKER_URL) {
    return <p className="rounded-2xl border border-line bg-surface p-5 text-muted">This replay is not linked to Morrow&apos;s server yet. Try again soon.</p>;
  }

  const cursorTs = result && shown > 0 ? (result.steps[shown - 1]?.at ?? result.closure.closeTs) : 0;
  const final = phase === "done";
  const picked = tokens?.find((t) => t.coin === token);
  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="inline-flex rounded-full bg-accent px-3 py-1 text-sm font-medium text-on-accent">Simulated loan, real prices</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label htmlFor="watch-token" className="text-sm font-medium">
              Stock token
            </label>
            <TokenPicker id="watch-token" tokens={tokens} failed={tokensFailed} value={token} onChange={setToken} />
          </div>
          <button
            type="button"
            onClick={start}
            disabled={!token || phase === "loading"}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-8 text-base font-medium text-on-accent transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "loading" ? (
              <>
                <Loader2 size={16} strokeWidth={1.75} className="animate-spin" aria-hidden /> Getting the weekend
              </>
            ) : result ? (
              <>
                <RotateCcw size={16} strokeWidth={1.75} aria-hidden /> Watch again
              </>
            ) : (
              <>
                <Play size={16} strokeWidth={1.75} aria-hidden /> Start
              </>
            )}
          </button>
        </div>
        <p className="mt-4 text-sm text-muted">
          {yours
            ? `Your loan: ${amount(Number(borrowed), "USDT")} borrowed against ${Number(backing).toLocaleString("en-US")} ${token || "tokens"}, placed on a real weekend.`
            : featured && featured.coin === token
              ? `Starting with the most dramatic real weekend in the replay data: ${picked?.name ?? token} reopened ${percent(Math.abs(featured.move))} below Friday's close.`
              : "Pick any stock token. Morrow replays that token's most dramatic real weekend."}
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {phase === "loading" ? <div className="h-72 animate-pulse rounded-2xl bg-line/60" aria-hidden /> : null}

      {result && phase !== "loading" ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-label="Price chart">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg">
                {result.token} · {dateTime(result.closure.closeTs)} to {dateTime(result.closure.reopenTs)}
              </h2>
              <p className="text-sm text-muted">
                Reopened <span className="num">{result.reopenMove >= 0 ? "+" : "-"}{percent(Math.abs(result.reopenMove))}</span>
              </p>
            </div>
            <div className="mt-4">
              <WatchChart result={result} cursorTs={cursorTs} final={final} />
            </div>
          </section>

          <ol className="space-y-4" aria-label="What Morrow did, step by step" aria-live="polite">
            {result.steps.slice(0, shown).map((s, i) => (
              <motion.li
                key={s.id}
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="rounded-2xl border border-line bg-surface p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="flex items-center gap-3 text-lg">
                    <span className="num inline-flex h-7 w-7 items-center justify-center rounded-full bg-canvas text-sm text-muted">{i + 1}</span>
                    {s.title}
                  </h3>
                  <p className="text-sm text-muted">{dateTime(s.at)}</p>
                </div>
                <p className="mt-2 max-w-2xl text-ink">{s.line}</p>
                {s.facts.length > 0 ? (
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    {s.facts.map((f) => (
                      <div key={f.label + f.value} className="rounded-xl bg-canvas p-3">
                        <dt className="text-muted">{f.label}</dt>
                        <dd className="num mt-1 break-words font-medium">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </motion.li>
            ))}
          </ol>

          {phase === "playing" ? (
            <button type="button" onClick={skip} className="inline-flex h-11 items-center gap-2 rounded-full border border-muted/50 px-5 text-sm font-medium text-ink hover:bg-line/60">
              <SkipForward size={16} strokeWidth={1.75} aria-hidden /> Skip to the end
            </button>
          ) : null}

          {final ? (
            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-label="Result">
              <h2 className="text-xl">
                {result.outcome.kept === true ? "Promise kept" : result.outcome.kept === false ? "Promise missed" : "Not graded"}
              </h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl bg-canvas p-3">
                  <dt className="text-muted">Without Morrow</dt>
                  <dd className="num mt-1 text-lg font-semibold">{result.outcome.healthWithoutMorrow === null ? "n/a" : percent(result.outcome.healthWithoutMorrow)}</dd>
                  <dd className="text-xs text-muted">{result.outcome.marginCallWithoutMorrow ? "A margin call" : "No margin call"}</dd>
                </div>
                <div className="rounded-xl bg-canvas p-3">
                  <dt className="text-muted">With Morrow</dt>
                  <dd className="num mt-1 text-lg font-semibold">{result.outcome.healthWithMorrow === null ? "n/a" : percent(result.outcome.healthWithMorrow)}</dd>
                  <dd className="text-xs text-muted">Margin-call level {percent(result.limits.marginCall, 0)}</dd>
                </div>
                <div className="rounded-xl bg-canvas p-3">
                  <dt className="text-muted">Cost of protection</dt>
                  <dd className="num mt-1 text-lg font-semibold">{amount(result.outcome.paidDown, "USDT")}</dd>
                  <dd className="text-xs text-muted">Paid down, simulated</dd>
                </div>
              </dl>
              <ul className="mt-4 max-w-2xl list-disc space-y-1 pl-5 text-sm text-muted">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
                <li>The choice was made by {result.decidedBy}. Code sized the amount and checked every rule.</li>
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => document.getElementById("watch-token")?.focus()}
                  className="inline-flex h-11 items-center rounded-full border border-muted/50 px-5 text-sm font-medium text-ink hover:bg-line/60"
                >
                  Watch another stock
                </button>
                <Link href="/check" className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-on-accent">
                  Check my loan
                </Link>
                <Link href="/record" className="inline-flex h-11 items-center rounded-full border border-muted/50 px-5 text-sm font-medium text-ink hover:bg-line/60">
                  See the record
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {!result && phase === "idle" ? (
        <div className="rounded-2xl border border-dashed border-line p-8 text-muted">Press Start. Morrow handles one real weekend in about fifteen seconds.</div>
      ) : null}
    </div>
  );
}
