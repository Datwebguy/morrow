import { dirname, join } from "node:path";
import { LOGOS, NYSE_CALENDAR, SCHEDULE, SIMULATION } from "@morrow/config";
import { fetchCoinChains } from "@morrow/bitget";
import { currentOrNextClosure } from "@morrow/core";
import { advisorFor, modelConfigFromEnv, rulesAdvisor, type Advisor } from "./advisor";
import { ProfileCache } from "./assess";
import { checkCalendar } from "./calendarCheck";
import { nextDelaySeconds, runCycle } from "./cycle";
import { Store } from "./db";
import { keysFromEnv, liveBackingTokens, liveMostTraded, livePorts } from "./liveports";
import { createServer } from "./server";
import { liveLogoDeps, LogoSync } from "./logos";
import { CompanyNames } from "./names";
import { ensureBook, shadowPorts } from "./shadow";

const env = process.env;
const store = new Store(env["DATABASE_PATH"] ?? "morrow.db");
const keys = keysFromEnv(env);
const ports = livePorts({ keys, telegramToken: env["TELEGRAM_BOT_TOKEN"], isDisconnected: () => store.getSetting<boolean>("disconnected") === true });
const modelConfig = modelConfigFromEnv(env);
const advisor: Advisor = modelConfig ? advisorFor(modelConfig) : rulesAdvisor;
// Real writes only when the owner has set this to go-live. Otherwise every action is a dry run.
const liveActions = env["MORROW_LIVE_ACTIONS"] === "go-live";
const cache = new ProfileCache(ports);
const deps = { store, ports, advisor, liveActions, cache };

// The shadow ledger: one simulated loan the owner types in, run with live prices and limits, previews only (docs/VERIFIED.md item 3).
const shadowStore = new Store(env["SHADOW_DATABASE_PATH"] ?? join(dirname(env["DATABASE_PATH"] ?? "morrow.db"), "shadow.db"));
const shadow = shadowPorts(ports, shadowStore);
const shadowCache = new ProfileCache(shadow);
const shadowDeps = { store: shadowStore, ports: shadow, advisor, liveActions: false, cache: shadowCache };
const names = new CompanyNames();
const logos = new LogoSync(store, liveLogoDeps());

const port = Number(env["PORT"] ?? 8787);
const server = createServer({ ...deps, appToken: env["APP_TOKEN"] ?? null, allowedOrigin: env["APP_ORIGIN"] ?? null, connected: keys !== null, listTokens: () => liveBackingTokens(names, (c) => store.getLogo(c)?.name ?? null), shadow: { store: shadowStore, ports: shadow, cache: shadowCache }, advisor, modelName: modelConfig?.model ?? "rules only" }).listen(port, () => {
  console.log(`Morrow worker on port ${port}. Bitget ${keys ? "connected" : "not connected"}. Actions: ${liveActions ? "LIVE" : "dry run"}. Advisor: ${modelConfig?.model ?? "rules only"}.`);
});

let lastCalendarCheck = 0;
async function loop(): Promise<void> {
  let delay: number = SCHEDULE.normalPollSeconds;
  try {
    const now = Date.now();
    if (now - lastCalendarCheck > SCHEDULE.calendarRefreshHours * 3_600_000) {
      lastCalendarCheck = now;
      const c = await checkCalendar(store, now);
      if (!c.ok) console.warn(c.detail);
    }
    const r = await runCycle(deps);
    delay = nextDelaySeconds(r.nowMs, r.closure);
    for (const p of r.problems) console.warn(p);
    {
      try {
        let closure = null;
        try {
          closure = currentOrNextClosure(NYSE_CALENDAR, Date.now());
        } catch {
          closure = null;
        }
        await ensureBook(shadow, shadowStore, () => liveMostTraded(SIMULATION.shadowTokens), closure);
        await runCycle(shadowDeps);
      } catch (e) {
        console.error("Shadow cycle failed:", e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error("Cycle failed:", e instanceof Error ? e.message : e);
  }
  setTimeout(() => void loop(), delay * 1000);
}
void loop();

// Token logos and company names: looked up slowly in the background (CoinGecko is rate limited) and cached with source and date.
async function logoLoop(): Promise<void> {
  try {
    const tokens = await liveBackingTokens(names);
    const due = tokens.filter((t) => logos.isDue(t.coin));
    if (due.length > 0) {
      const chains = await fetchCoinChains();
      const r = await logos.runPass(due.map((t) => t.coin), (c) => chains.get(c.toUpperCase()) ?? [], (c) => tokens.find((t) => t.coin === c)?.name ?? null);
      console.log(`Logos: ${r.synced} looked up, ${r.skipped} left for the next pass.`);
    }
  } catch (e) {
    console.error("Logo pass failed:", e instanceof Error ? e.message : e);
  }
  setTimeout(() => void logoLoop(), LOGOS.checkEveryMinutes * 60_000);
}
void logoLoop();

// A clean stop when the host replaces this deployment, so a normal swap is not reported as a crash.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received: stopping.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
