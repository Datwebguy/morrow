import { timingSafeEqual } from "node:crypto";
import { createServer as httpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { NYSE_CALENDAR } from "@morrow/config";
import { currentOrNextClosure, type MarketClosure } from "@morrow/core";
import { CHECK_MY_LOAN } from "@morrow/config";
import { approve, reject, type ApproveDeps } from "./approve";
import { assessLoan, type Assessment } from "./assess";
import { checkLoan, CheckError, parseCheckInput, RateLimiter } from "./check";
import type { Store } from "./db";
import { publicRecord } from "./record";
import { loadSettings, SettingsError, updateSettings } from "./settings";
import { clearShadow, loadShadow, saveShadow, ShadowError } from "./shadow";

export interface ServerDeps extends ApproveDeps {
  /** Secret the app sends. Without it, private routes are closed. */
  appToken: string | null;
  /** The one origin allowed to call private routes. */
  allowedOrigin: string | null;
  /** True when Bitget credentials exist on the server. Whether the user has connected is a separate switch. */
  connected: boolean;
  /** Stock tokens Bitget accepts as backing right now, for the public "Check my loan" picker. Absent: the picker is closed. */
  listTokens?: () => Promise<string[]>;
  /** The shadow ledger's own store (its simulated loan, log and promises). Absent: no shadow ledger. */
  shadowStore?: Store;
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

/** The shadow ledger's paper log in the format the hackathon form asks for. Every row is simulated. */
function shadowLog(store: Store | undefined): unknown {
  if (!store) return { simulated: true, entries: [] };
  const entries = store.allLog().filter((e) => e.kind === "action" || e.kind === "refused" || e.kind === "promise" || e.kind === "grade")
    .map((e) => ({ timestamp: e.ts, kind: e.kind, instrument: e.instrument, direction: e.direction, price: e.price, quantity: e.quantity, balanceChange: e.balanceChange, reason: e.reason, simulated: true }));
  return { simulated: true, entries };
}

/** The worker's small HTTP surface: a public record, and private routes for the app. */
export function createServer(d: ServerDeps): Server {
  let loansCache: { at: number; body: unknown } | null = null;
  const limiter = new RateLimiter(CHECK_MY_LOAN.requestsPerMinute);
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
      if (req.method === "GET" && path === "/public/health") return send(res, 200, { ok: true, now: d.ports.nowMs() }, publicCors);
      if (req.method === "GET" && path === "/public/record") return send(res, 200, publicRecord(d.store, d.shadowStore), publicCors);
      if (req.method === "GET" && path === "/public/shadow") return send(res, 200, shadowLog(d.shadowStore), publicCors);
      if (req.method === "GET" && path === "/public/check/tokens") {
        if (!d.listTokens) return send(res, 503, { error: "The token list is not available right now." }, publicCors);
        try {
          return send(res, 200, { asOf: d.ports.nowMs(), tokens: await d.listTokens() }, publicCors);
        } catch {
          return send(res, 503, { error: "Bitget's token list could not be read right now. Try again in a minute." }, publicCors);
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
      if (path === "/api/shadow") {
        if (!d.shadowStore) return send(res, 503, { error: "The shadow ledger is not set up on the server." }, cors);
        if (req.method === "GET") return send(res, 200, { loan: loadShadow(d.shadowStore), settings: loadSettings(d.shadowStore) }, cors);
        if (req.method === "PUT") return send(res, 200, { loan: saveShadow(d.shadowStore, await readJson(req)) }, cors);
        if (req.method === "DELETE") {
          clearShadow(d.shadowStore);
          return send(res, 200, { loan: null }, cors);
        }
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
      if (e instanceof SettingsError || e instanceof ShadowError) return send(res, 400, { error: e.message });
      return send(res, 500, { error: "Something went wrong on the server. Try again." });
    }
  });
}
