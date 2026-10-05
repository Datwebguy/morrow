// Takes screenshots of the running app: every screen, light and dark, desktop and mobile.
// Usage: node tools/screenshots.mjs <siteUrl> <outDir> <accessKey> [paths...]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const [site, out, key, ...rest] = process.argv.slice(2);
if (!site || !out) throw new Error("Usage: node tools/screenshots.mjs <siteUrl> <outDir> <accessKey> [paths...]");
const paths = rest.length ? rest : ["/app/connect", "/app", "/app/activity", "/app/record", "/app/settings"];
const sizes = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const scheme of ["light", "dark"]) {
  for (const [name, viewport] of Object.entries(sizes)) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "reduce" });
    if (key) await ctx.addInitScript((k) => window.localStorage.setItem("morrow.key", k), key);
    const page = await ctx.newPage();
    for (const p of paths) {
      await page.goto(site + p, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const file = `${out}/${(p === "/" ? "home" : p.replace(/^\//, "").replace(/\//g, "-"))}-${name}-${scheme}.png`;
      // Size the window to the whole page so fixed bars sit where they really are, then capture it.
      const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, window.innerHeight));
      await page.setViewportSize({ width: viewport.width, height });
      await page.waitForTimeout(150);
      await page.screenshot({ path: file });
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      console.log(`${file}${overflow ? "  SIDEWAYS SCROLL" : ""}`);
    }
    await ctx.close();
  }
}
await browser.close();
