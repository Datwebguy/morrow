import { SCHEDULE } from "@morrow/config";
import { modelAdvisor, rulesAdvisor, type Advisor } from "./advisor";
import { ProfileCache } from "./assess";
import { checkCalendar } from "./calendarCheck";
import { nextDelaySeconds, runCycle } from "./cycle";
import { Store } from "./db";
import { keysFromEnv, livePorts } from "./liveports";
import { createServer } from "./server";

const env = process.env;
const store = new Store(env["DATABASE_PATH"] ?? "morrow.db");
const keys = keysFromEnv(env);
const ports = livePorts({ keys, telegramToken: env["TELEGRAM_BOT_TOKEN"] });
const advisor: Advisor =
  env["MODEL_BASE_URL"] && env["MODEL_NAME"] && env["MODEL_API_KEY"]
    ? modelAdvisor({ baseUrl: env["MODEL_BASE_URL"], model: env["MODEL_NAME"], apiKey: env["MODEL_API_KEY"] })
    : rulesAdvisor;
// Real writes only when the owner has set this to go-live. Otherwise every action is a dry run.
const liveActions = env["MORROW_LIVE_ACTIONS"] === "go-live";
const cache = new ProfileCache(ports);
const deps = { store, ports, advisor, liveActions, cache };

const port = Number(env["PORT"] ?? 8787);
createServer({ ...deps, appToken: env["APP_TOKEN"] ?? null, allowedOrigin: env["APP_ORIGIN"] ?? null, connected: keys !== null }).listen(port, () => {
  console.log(`Morrow worker on port ${port}. Bitget ${keys ? "connected" : "not connected"}. Actions: ${liveActions ? "LIVE" : "dry run"}. Advisor: ${env["MODEL_NAME"] ?? "rules only"}.`);
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
  } catch (e) {
    console.error("Cycle failed:", e instanceof Error ? e.message : e);
  }
  setTimeout(() => void loop(), delay * 1000);
}
void loop();
