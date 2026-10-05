"use client";

import { Loader2, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Countdown } from "./Countdown";
import { Gauge } from "./Gauge";
import { Hint } from "./Hint";
import { TokenPicker } from "./TokenPicker";
import { TrustBadge } from "./TrustBadge";
import { request, WORKER_URL } from "@/lib/api";
import { amount, dateTime, percent, points } from "@/lib/format";
import type { CheckResult, TokenOption } from "@/lib/types";
import { basisWord, statusWord } from "@/lib/words";

const FIELD = "mt-1.5 h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink";

function suggestionLine(r: CheckResult): string {
  const s = r.suggestion;
  if (!s) return "No action needed";
  if (s.payDown > 0 && s.addBacking > 0) return `Pay down ${amount(s.payDown, r.loanCoin)} and add ${amount(s.addBacking, r.token, 6)} as backing`;
  if (s.payDown > 0) return `Pay down ${amount(s.payDown, r.loanCoin)}`;
  return `Add ${amount(s.addBacking, r.token, 6)} as backing`;
}

/** Public, no login. Three typed numbers in, live Bitget data, nothing stored. */
export function CheckMyLoan() {
  const [tokens, setTokens] = useState<TokenOption[] | null>(null);
  const [tokensFailed, setTokensFailed] = useState(false);
  const [token, setToken] = useState("");
  const [backing, setBacking] = useState("");
  const [borrowed, setBorrowed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    if (!WORKER_URL) return;
    let alive = true;
    request<{ tokens: TokenOption[] }>("/public/check/tokens", { key: null })
      .then((d) => alive && setTokens(d.tokens))
      .catch(() => alive && setTokensFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await request<CheckResult>("/public/check", { method: "POST", key: null, body: { token, backingAmount: backing, borrowed } }));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!WORKER_URL) {
    return <p className="rounded-2xl border border-line bg-surface p-5 text-muted">This check is not linked to Morrow&apos;s server yet. Try again soon.</p>;
  }

  const h = result?.health ?? null;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <form onSubmit={submit} className="space-y-5 self-start rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-label="Your loan">
        <div>
          <label htmlFor="token" className="text-sm font-medium">
            Stock token backing your loan
          </label>
          <TokenPicker id="token" tokens={tokens} failed={tokensFailed} value={token} onChange={setToken} />
        </div>
        <div>
          <label htmlFor="backing" className="text-sm font-medium">
            Backing amount {token ? `(${token})` : ""}
          </label>
          <input id="backing" required inputMode="decimal" autoComplete="off" placeholder="For example 25" value={backing} onChange={(e) => setBacking(e.target.value)} className={`${FIELD} num`} />
        </div>
        <div>
          <label htmlFor="borrowed" className="text-sm font-medium">
            Amount borrowed (USDT)
          </label>
          <input id="borrowed" required inputMode="decimal" autoComplete="off" placeholder="For example 3000" value={borrowed} onChange={(e) => setBorrowed(e.target.value)} className={`${FIELD} num`} />
        </div>
        <button
          type="submit"
          disabled={busy || !token}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-base font-medium text-on-accent transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 size={16} strokeWidth={1.75} className="animate-spin" aria-hidden /> Checking
            </>
          ) : (
            "Check my loan"
          )}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <p className="text-sm text-muted">Nothing you type is saved. No login, no keys.</p>
      </form>

      <section aria-live="polite" aria-label="Result">
        {!result && !busy ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-muted">Enter your three numbers to see your loan health and what Monday could do to it.</div>
        ) : null}
        {busy && !result ? <div className="h-96 animate-pulse rounded-2xl bg-line/60" aria-hidden /> : null}
        {result ? (
          <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg">
                {result.token} / {result.loanCoin}
              </h2>
              <p className="text-sm text-muted">Live data, {dateTime(result.asOf)}</p>
            </header>
            {h ? (
              <>
                <div className="mt-4">
                  <Gauge ratio={h.ratio} marginCall={h.marginCallLevel} liquidation={h.liquidationLevel} status={h.status} />
                </div>
                <p className="mt-1 text-center text-sm font-medium">{statusWord(h.status)}</p>
                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-canvas p-3">
                    <dt className="flex items-center gap-1 text-muted">
                      To margin call
                      <Hint label="What is the margin-call level?">At the margin-call level ({percent(h.marginCallLevel, 0)}) Bitget asks you to add backing or pay down.</Hint>
                    </dt>
                    <dd className="num mt-1 text-lg font-semibold">{points(h.distanceToMarginCall)}</dd>
                    <dd className="text-xs text-muted">Backing can fall {percent(h.priceDropToMarginCall)}</dd>
                  </div>
                  <div className="rounded-xl bg-canvas p-3">
                    <dt className="flex items-center gap-1 text-muted">
                      To liquidation
                      <Hint label="What is the liquidation level?">At the liquidation level ({percent(h.liquidationLevel, 0)}) Bitget sells your backing to repay the loan.</Hint>
                    </dt>
                    <dd className="num mt-1 text-lg font-semibold">{points(h.distanceToLiquidation)}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="mt-5 rounded-xl bg-canvas p-4 text-sm text-muted">Loan health is not available right now. {result.problems[0] ?? ""}</p>
            )}

            <div className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
              {result.price !== null ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">{result.token} price now</span>
                  <span className="num font-medium">
                    {amount(result.price, "USDT")}
                    {result.moveSinceClose !== null ? <span className="ml-2 text-muted">{result.moveSinceClose >= 0 ? "+" : ""}{percent(result.moveSinceClose)} since the close</span> : null}
                  </span>
                </div>
              ) : null}
              {result.closure ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">{result.phase === "closed" ? "Market reopens in" : "Next closure in"}</span>
                  <Countdown toMs={result.phase === "closed" ? result.closure.reopenTs : result.closure.closeTs} className="font-medium" />
                </div>
              ) : null}
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1 text-muted">
                    Projected at reopen
                    <Hint label="How is the reopen projected?">
                      Morrow works out your loan health when the US market reopens, {result.projection ? basisWord(result.projection.basis) : "once a price is available"}.
                    </Hint>
                  </span>
                  {result.projection ? <span className="num font-medium">{percent(result.projection.ratio)}</span> : <span className="text-muted">Not available</span>}
                </div>
                <div className="mt-1.5 flex">
                  <TrustBadge trust={result.trust} />
                </div>
              </div>
              {result.history ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-muted">Past reopening gaps</span>
                  <span className="num ml-auto text-right font-medium">
                    {percent(result.history.likelyDrop)} drop or worse in 1 of {Math.round(100 / (100 - result.history.likelyPercentile))} reopenings
                    <span className="block text-xs font-normal text-muted">{result.history.closures} closures of this stock</span>
                  </span>
                </div>
              ) : (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted">Past reopening gaps</span>
                  <span className="text-muted">Not enough history yet</span>
                </div>
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-muted">Suggested action</span>
                <span className="ml-auto text-right font-medium">{result.projection ? suggestionLine(result) : "Not available"}</span>
              </div>
            </div>
            {result.suggestion ? (
              <p className="mt-4 rounded-xl bg-canvas p-3 text-sm text-muted">
                This brings projected loan health to {percent(result.suggestion.ratioAfter)}, under your safety target of {percent(result.suggestion.targetRatio)}.
              </p>
            ) : null}
            {result.problems.length > 0 && h ? <p className="mt-4 text-sm text-watch">{result.problems[0]}</p> : null}
            <div className="mt-5 border-t border-line pt-5">
              <Link
                href={`/watch?${new URLSearchParams({ token: result.token, backing, borrowed }).toString()}`}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-muted/50 px-6 text-base font-medium text-ink hover:bg-line/60 sm:w-auto"
              >
                <Play size={16} strokeWidth={1.75} aria-hidden /> Watch what Morrow would do on a real weekend
              </Link>
              <p className="mt-2 text-sm text-muted">Your loan size and loan health, replayed on a real past weekend.</p>
            </div>
          </article>
        ) : null}
      </section>
    </div>
  );
}
