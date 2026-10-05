// Takes screenshots of the running app: every screen, light and dark, desktop and mobile.
// Usage: node tools/screenshots.mjs <siteUrl> <outDir> <accessKey> [paths...]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const [site, out, key, ...rest] = process.argv.slice(2);
if (!site || !out) throw new Error("Usage: node tools/screenshots.mjs <siteUrl> <outDir> <accessKey> [paths...]");
const paths = rest.length ? rest : ["/app/connect", "/app", "/app/activity", "/app/record", "/app/settings"];
const sizes = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: process.env["IGNORE_CERT"] === "1" ? ["--no-sandbox", "--ignore-certificate-errors"] : ["--no-sandbox"] });
for (const scheme of ["light", "dark"]) {
  for (const [name, viewport] of Object.entries(sizes)) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "reduce" });
    if (key) await ctx.addInitScript((k) => window.localStorage.setItem("morrow.key", k), key);
    const page = await ctx.newPage();
    for (const p of paths) {
      await page.goto(site + p, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const file = `${out}/${(p === "/" ? "home" : p.replace(/^\//, "").replace(/\//g, "-"))}-${name}-${scheme}.png`;
      if (process.env["FULL_PAGE"] === "1") {
        // Marketing pages: a true full-page capture, so viewport-height sections keep their real size.
        // Scroll through first, as a visitor would, so sections that fade in on scroll are showing.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 400) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(700);
        await page.screenshot({ path: file, fullPage: true });
      } else {
        // App screens: size the window to the page so the fixed tab bar sits where it really is.
        const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, window.innerHeight));
        await page.setViewportSize({ width: viewport.width, height });
        await page.waitForTimeout(150);
        await page.screenshot({ path: file });
        await page.setViewportSize(viewport);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      console.log(`${file}${overflow ? "  SIDEWAYS SCROLL" : ""}`);
    }
    await ctx.close();
  }
}
await browser.close();
