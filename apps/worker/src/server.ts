import { timingSafeEqual } from "node:crypto";
import { createServer as httpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { NYSE_CALENDAR } from "@morrow/config";
import { currentOrNextClosure, type MarketClosure } from "@morrow/core";
import { approve, reject, type ApproveDeps } from "./approve";
import { assessLoan, type Assessment } from "./assess";
import { publicRecord } from "./record";
import { loadSettings, SettingsError, updateSettings } from "./settings";

export interface ServerDeps extends ApproveDeps {
  /** Secret the app sends. Without it, private routes are closed. */
  appToken: string | null;
  /** The one origin allowed to call private routes. */
  allowedOrigin: string | null;
  connected: boolean;
}

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

/** The worker's small HTTP surface: a public record, and private routes for the app. */
export function createServer(d: ServerDeps): Server {
  let loansCache: { at: number; body: unknown } | null = null;
  return httpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const publicCors = { "access-control-allow-origin": "*" };
    try {
      if (req.method === "OPTIONS") {
        const o = d.allowedOrigin ?? "*";
        res.writeHead(204, { "access-control-allow-origin": o, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, PUT, POST, OPTIONS" });
        return void res.end();
      }
      if (req.method === "GET" && path === "/public/health") return send(res, 200, { ok: true, now: d.ports.nowMs() }, publicCors);
      if (req.method === "GET" && path === "/public/record") return send(res, 200, publicRecord(d.store), publicCors);

      if (!path.startsWith("/api/")) return send(res, 404, { error: "Not found." });
      if (!d.appToken) return send(res, 503, { error: "App access is not set up on the server yet." });
      if (!tokenOk(req, d.appToken)) return send(res, 401, { error: "Not allowed." });
      const cors = { "access-control-allow-origin": d.allowedOrigin ?? "*" };

      if (req.method === "GET" && path === "/api/status") {
        return send(res, 200, { connected: d.connected, liveActions: d.liveActions, now: d.ports.nowMs(), calendar: d.store.getSetting("calendar_check"), settings: loadSettings(d.store), pendingApprovals: d.store.pendingApprovals().length }, cors);
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
