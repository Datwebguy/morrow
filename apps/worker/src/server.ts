import { timingSafeEqual } from "node:crypto";
import { createServer as httpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { CHECK_MY_LOAN, FEATURED_CLOSURE, NYSE_CALENDAR, WATCH_A_WEEKEND } from "@morrow/config";
import { currentOrNextClosure, type MarketClosure } from "@morrow/core";
import { approve, reject, type ApproveDeps } from "./approve";
import { assessLoan, type Assessment, type ProfileCache } from "./assess";
import { checkLoan, CheckError, parseCheckInput, RateLimiter } from "./check";
import type { Store } from "./db";
import { logRows, toCsv } from "./logexport";
import type { Ports } from "./ports";
import { publicRecord } from "./record";
import { loadSettings, SettingsError, updateSettings } from "./settings";
import { loadBook } from "./shadow";
import { watchKey, watchWeekend, WatchError, type WatchInput, type WatchResult } from "./watch";

export interface ServerDeps extends ApproveDeps {
  /** Secret the app sends. Without it, private routes are closed. */
  appToken: string | null;
  /** The one origin allowed to call private routes. */
  allowedOrigin: string | null;
  /** True when Bitget credentials exist on the server. Whether the user has connected is a separate switch. */
  connected: boolean;
  /** Stock tokens Bitget accepts as backing right now, with company names where known, for the public pickers. Absent: the picker is closed. */
  listTokens?: () => Promise<Array<{ coin: string; name: string | null }>>;
  /** The shadow ledger: its own store (simulated loans, log, promises), its own ports and the shared price-history cache. Absent: no shadow ledger. */
  shadow?: { store: Store; ports: Ports; cache: ProfileCache };
  /** The model that makes the AI choice ("rules only" when none is set). Shown on the public health route, never the key. */
  modelName?: string;
}

const DISCONNECTED = "disconnected";

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function tokenOk(req: IncomingMessage, token: string): boolean {
  const given = (req.headers["authorization"] ?? "").toString().replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 10_000) throw new SettingsError("The request is too large.");
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  const v = JSON.parse(text) as unknown;
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new SettingsError("The request must be a JSON object.");
  return v as Record<string, unknown>;
}

function loanView(a: Assessment, protectedLoan: boolean): unknown {
  return {
    orderId: a.loan.orderId, instrument: a.instrument, protected: protectedLoan, phase: a.phase, asOf: a.nowMs,
    health: a.healthNow && a.limits ? {
      ratio: a.healthNow.ratio, status: a.healthNow.status, distanceToMarginCall: a.healthNow.distanceToMarginCall,
      distanceToLiquidation: a.healthNow.distanceToLiquidation, priceDropToMarginCall: a.healthNow.priceDropToMarginCall,
      marginCallLevel: a.limits.marginCall, liquidationLevel: a.limits.liquidation,
    } : null,
    closure: a.closure ? { closeTs: a.closure.closeTs, reopenTs: a.closure.reopenTs } : null,
    projection: a.projection?.health ? { ratio: a.projection.health.ratio, basis: a.projection.basis, price: a.projection.price, status: a.projection.health.status } : null,
    trust: a.trust ? { trusted: a.trust.trusted, failures: a.trust.failures } : null,
    plan: a.plan?.needed ? { payDown: a.plan.payDown, addBacking: a.plan.addBacking, reachesTarget: a.plan.reachesTarget, reason: a.plan.reason } : null,
    problems: a.problems, loanCoin: a.loan.loanCoin, backingCoin: a.loan.backingCoin,
  };
}

function clientAddress(req: IncomingMessage): string {
  const forwarded = (req.headers["x-forwarded-for"] ?? "").toString().split(",")[0]?.trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function parseWatchQuery(q: URLSearchParams): WatchInput {
  const token = q.get("token");
  if (!token || !/^[A-Za-z0-9]{2,20}$/.test(token.trim())) throw new SettingsError("Choose a stock token.");
  const input: WatchInput = { backingCoin: token.trim() };
  const backing = q.get("backing");
  const borrowed = q.get("borrowed");
  if (backing !== null || borrowed !== null) {
    const b = Number(backing);
    const dbt = Number(borrowed);
    if (!(b > 0) || !(dbt > 0) || b > CHECK_MY_LOAN.maxAmount || dbt > CHECK_MY_LOAN.maxAmount) throw new SettingsError("Backing amount and amount borrowed must be numbers above zero.");
    input.yours = { backingAmount: b, debt: dbt };
  }
  const closeTs = q.get("closeTs");
  if (closeTs !== null) {
    if (!Number.isFinite(Number(closeTs))) throw new SettingsError("That weekend is not valid.");
    input.closeTs = Number(closeTs);
  }
  return input;
}

/** The live shadow-ledger loans for the public view: loan health, next closure, and the latest decision for each. Every loan is simulated. */
async function shadowView(d: ServerDeps): Promise<unknown> {
  if (!d.shadow) return { simulated: true, loans: [], closure: null };
  const { store, ports, cache } = d.shadow;
  const settings = loadSettings(store);
  let closure: MarketClosure | null = null;
  try {
    closure = currentOrNextClosure(NYSE_CALENDAR, ports.nowMs());
  } catch {
    closure = null;
  }
  const loans = [];
  for (const l of loadBook(store).loans) {
    const a = await assessLoan(ports, cache, { orderId: l.id, loanCoin: CHECK_MY_LOAN.loanCoin, backingCoin: l.backingCoin, debt: l.debt, backingAmount: l.backingAmount }, settings, closure);
    const last = store.recentLog(1, l.id)[0];
    loans.push({
      ...(loanView(a, true) as object), simulated: true, startHealth: l.startHealth, openedAt: l.openedAt,
      lastDecision: last ? { ts: last.ts, kind: last.kind, reason: last.reason } : null,
    });
  }
  return { simulated: true, loans, closure: closure ? { closeTs: closure.closeTs, reopenTs: closure.reopenTs } : null, asOf: ports.nowMs() };
}

/** The worker's small HTTP surface: a public record, and private routes for the app. */
export function createServer(d: ServerDeps): Server {
  let loansCache: { at: number; body: unknown } | null = null;
  const limiter = new RateLimiter(CHECK_MY_LOAN.requestsPerMinute);
  const watchLimiter = new RateLimiter(WATCH_A_WEEKEND.requestsPerMinute);
  const watchCache = new Map<string, { at: number; promise: Promise<WatchResult> }>();
  return httpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const publicCors = { "access-control-allow-origin": "*" };
    try {
      if (req.method === "OPTIONS") {
        const o = path.startsWith("/public/") ? "*" : d.allowedOrigin ?? "*";
        res.writeHead(204, { "access-control-allow-origin": o, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, PUT, POST, OPTIONS" });
        return void res.end();
      }
      if (req.method === "GET" && path === "/public/health") return send(res, 200, { ok: true, now: d.ports.nowMs(), model: d.modelName ?? "rules only" }, publicCors);
      if (req.method === "GET" && path === "/public/record") return send(res, 200, publicRecord(d.store, d.shadow?.store), publicCors);
      if (req.method === "GET" && path === "/public/shadow") return send(res, 200, await shadowView(d), publicCors);
      if (req.method === "GET" && (path === "/public/log.json" || path === "/public/log.csv")) {
        const rows = logRows(d.shadow ? [d.store, d.shadow.store] : [d.store]);
        if (path === "/public/log.csv") {
          res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="morrow-log.csv"', "cache-control": "no-store", ...publicCors });
          return void res.end(toCsv(rows));
        }
        return send(res, 200, { generatedAt: d.ports.nowMs(), note: "Every decision Morrow logged. mode is simulated or live on every row.", rows }, { ...publicCors, "content-disposition": 'attachment; filename="morrow-log.json"' });
      }
      if (req.method === "GET" && path === "/public/check/tokens") {
        if (!d.listTokens) return send(res, 503, { error: "The token list is not available right now." }, publicCors);
        try {
          return send(res, 200, { asOf: d.ports.nowMs(), tokens: await d.listTokens() }, publicCors);
        } catch {
          return send(res, 503, { error: "Bitget's token list could not be read right now. Try again in a minute." }, publicCors);
        }
      }
      if (req.method === "GET" && path === "/public/watch/featured") return send(res, 200, { featured: FEATURED_CLOSURE.featured }, publicCors);
      if (req.method === "GET" && path === "/public/watch") {
        const q = url.searchParams;
        let input: WatchInput;
        try {
          input = parseWatchQuery(q);
        } catch (e) {
          return send(res, 400, { error: e instanceof Error ? e.message : "Check the token and numbers." }, publicCors);
        }
        const key = watchKey(input);
        const hit = watchCache.get(key);
        if (!hit || Date.now() - hit.at > WATCH_A_WEEKEND.cacheMinutes * 60_000) {
          if (!watchLimiter.allow(clientAddress(req))) return send(res, 429, { error: "Too many replays from this address. Wait a minute and try again." }, publicCors);
          const promise = watchWeekend(d.ports, d.advisor, input);
          watchCache.set(key, { at: Date.now(), promise });
          promise.catch(() => watchCache.delete(key));
        }
        try {
          return send(res, 200, await watchCache.get(key)!.promise, publicCors);
        } catch (e) {
          if (e instanceof WatchError) return send(res, 400, { error: e.message }, publicCors);
          return send(res, 503, { error: "Bitget price history could not be read right now. Try again in a minute." }, publicCors);
        }
      }
      if (req.method === "POST" && path === "/public/check") {
        if (!limiter.allow(clientAddress(req))) return send(res, 429, { error: "Too many checks from this address. Wait a minute and try again." }, publicCors);
        try {
          const input = parseCheckInput(await readJson(req));
          return send(res, 200, await checkLoan(d.ports, d.cache, input), publicCors);
        } catch (e) {
          if (e instanceof CheckError || e instanceof SettingsError) return send(res, 400, { error: e.message }, publicCors);
          return send(res, 503, { error: "Bitget market data could not be read right now. Try again in a minute." }, publicCors);
        }
      }

      if (!path.startsWith("/api/")) return send(res, 404, { error: "Not found." });
      if (!d.appToken) return send(res, 503, { error: "App access is not set up on the server yet." });
      if (!tokenOk(req, d.appToken)) return send(res, 401, { error: "Not allowed." });
      const cors = { "access-control-allow-origin": d.allowedOrigin ?? "*" };

      if (req.method === "GET" && path === "/api/status") {
        return send(res, 200, { connected: d.connected && d.store.getSetting<boolean>(DISCONNECTED) !== true, keysOnServer: d.connected, liveActions: d.liveActions, now: d.ports.nowMs(), calendar: d.store.getSetting("calendar_check"), settings: loadSettings(d.store), pendingApprovals: d.store.pendingApprovals().length }, cors);
      }
      if (req.method === "POST" && path === "/api/connect") {
        if (!d.connected) return send(res, 409, { ok: false, line: "No Bitget connection is set up on the Morrow server yet." }, cors);
        d.store.setSetting(DISCONNECTED, false);
        loansCache = null;
        const read = await d.ports.loans();
        if (read.problems.length > 0 && read.loans.length === 0) return send(res, 409, { ok: false, line: read.problems[0] }, cors);
        return send(res, 200, { ok: true, line: `Connected. ${read.loans.length === 0 ? "No open loans found." : `${read.loans.length} open loan${read.loans.length === 1 ? "" : "s"} found.`}` }, cors);
      }
      if (req.method === "POST" && path === "/api/disconnect") {
        // Stops everything: pause, stop protecting every loan, and cut the connection to Bitget.
        updateSettings(d.store, { paused: true, protectedLoans: [] });
        d.store.setSetting(DISCONNECTED, true);
        loansCache = null;
        return send(res, 200, { ok: true, line: "Disconnected. Morrow stopped and will not touch your account." }, cors);
      }
      if (req.method === "GET" && path === "/api/loans") {
        if (loansCache && Date.now() - loansCache.at < 15_000) return send(res, 200, loansCache.body, cors);
        const read = await d.ports.loans();
        const settings = loadSettings(d.store);
        let closure: MarketClosure | null = null;
        try {
          closure = currentOrNextClosure(NYSE_CALENDAR, d.ports.nowMs());
        } catch {
          closure = null;
        }
        const loans = [];
        for (const l of read.loans) loans.push(loanView(await assessLoan(d.ports, d.cache, l, settings, closure), settings.protectedLoans.includes(l.orderId)));
        const body = { connected: d.connected, problems: read.problems, loans, closure: closure ? { closeTs: closure.closeTs, reopenTs: closure.reopenTs } : null };
        loansCache = { at: Date.now(), body };
        return send(res, 200, body, cors);
      }
      if (req.method === "GET" && path === "/api/activity") {
        return send(res, 200, { entries: d.store.recentLog(Math.min(200, Number(url.searchParams.get("limit") ?? 50) || 50), url.searchParams.get("loan") ?? undefined) }, cors);
      }
      if (req.method === "GET" && path === "/api/record") {
        return send(res, 200, { promises: d.store.allPromises().map((p) => ({ ...p, body: JSON.parse(p.body), grade: p.grade ? JSON.parse(p.grade) : null, actions: JSON.parse(p.actions) })) }, cors);
      }
      if (path === "/api/settings") {
        if (req.method === "GET") return send(res, 200, loadSettings(d.store), cors);
        if (req.method === "PUT") return send(res, 200, updateSettings(d.store, await readJson(req)), cors);
      }
      if (req.method === "POST" && path === "/api/pause") {
        const body = await readJson(req);
        const next = updateSettings(d.store, { paused: body["paused"] !== false });
        loansCache = null;
        return send(res, 200, next, cors);
      }
      if (req.method === "POST" && path === "/api/protect") {
        const body = await readJson(req);
        const id = body["orderId"];
        if (typeof id !== "string" || typeof body["on"] !== "boolean") throw new SettingsError("Send an order id and on true or false.");
        const cur = loadSettings(d.store).protectedLoans.filter((x) => x !== id);
        loansCache = null;
        return send(res, 200, updateSettings(d.store, { protectedLoans: body["on"] ? [...cur, id] : cur }), cors);
      }
      if (req.method === "GET" && path === "/api/approvals") return send(res, 200, { approvals: d.store.pendingApprovals().map((a) => ({ ...a, proposal: JSON.parse(a.proposal) })) }, cors);
      const m = path.match(/^\/api\/approvals\/(\d+)\/(approve|reject)$/);
      if (req.method === "POST" && m) {
        const id = Number(m[1]);
        const r = m[2] === "approve" ? await approve(d, id) : reject(d.store, id, d.ports.nowMs());
        loansCache = null;
        return send(res, r.ok ? 200 : 409, r, cors);
      }
      return send(res, 404, { error: "Not found." }, cors);
    } catch (e) {
      if (e instanceof SettingsError) return send(res, 400, { error: e.message });
      return send(res, 500, { error: "Something went wrong on the server. Try again." });
    }
  });
}
