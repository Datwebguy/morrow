// Captures a page as a series of real viewport-sized screenshots while scrolling, so layout is judged as a visitor sees it.
// Usage: node tools/slices.mjs <url> <outDir> <width> <height> [light|dark]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const [url, out, w, h, scheme = "light"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--ignore-certificate-errors"] });
const page = await (await browser.newContext({ viewport: { width: +w, height: +h }, colorScheme: scheme, reducedMotion: "reduce" })).newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const total = await page.evaluate(() => document.documentElement.scrollHeight);
let i = 0;
for (let y = 0; y < total; y += Math.round(+h * 0.9)) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/s${String(i++).padStart(2, "0")}.png` });
}
console.log(`${i} slices, page height ${total}`);
await browser.close();
