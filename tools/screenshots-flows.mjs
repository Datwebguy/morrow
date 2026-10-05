// Screenshots of the two interactive public pages after a visitor has used them: Check my loan with a result, and Watch a weekend after Start.
// Usage: node tools/screenshots-flows.mjs <siteUrl> <outDir>   (SIZES / SCHEMES narrow the run; IGNORE_CERT=1 in the sandbox)
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const [site, out] = process.argv.slice(2);
if (!site || !out) throw new Error("Usage: node tools/screenshots-flows.mjs <siteUrl> <outDir>");
const allSizes = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };
const only = (list, all) => (list ? all.filter((x) => list.split(",").includes(x)) : all);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: process.env["IGNORE_CERT"] === "1" ? ["--no-sandbox", "--ignore-certificate-errors"] : ["--no-sandbox"] });
for (const scheme of only(process.env["SCHEMES"], ["light", "dark"])) {
  for (const name of only(process.env["SIZES"], Object.keys(allSizes))) {
    const ctx = await browser.newContext({ viewport: allSizes[name], colorScheme: scheme, reducedMotion: "reduce" });
    const page = await ctx.newPage();

    // Check my loan: search by company name, type two numbers, read the answer.
    await page.goto(site + "/check", { waitUntil: "networkidle" });
    await page.locator("#token").waitFor();
    await page.waitForFunction(() => !document.querySelector("#token")?.disabled);
    await page.screenshot({ path: `${out}/check-empty-${name}-${scheme}.png`, fullPage: true });
    await page.locator("#token").click();
    await page.locator("#token").fill("nvidia");
    await page.screenshot({ path: `${out}/check-search-${name}-${scheme}.png` });
    await page.getByRole("option").first().click();
    await page.locator("#backing").fill("25");
    await page.locator("#borrowed").fill("3000");
    await page.getByRole("button", { name: "Check my loan" }).click();
    await page.getByText("Suggested action").waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/check-result-${name}-${scheme}.png`, fullPage: true });

    // Watch a weekend: Start, then skip to the end so the whole story is on the page.
    await page.goto(site + "/watch", { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.querySelector("#watch-token")?.disabled);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/watch-before-${name}-${scheme}.png`, fullPage: true });
    await page.getByRole("button", { name: /Start/ }).click();
    await page.getByText("The promise is sealed").waitFor({ timeout: 90000 });
    await page.screenshot({ path: `${out}/watch-playing-${name}-${scheme}.png`, fullPage: true });
    const skip = page.getByRole("button", { name: /Skip to the end/ });
    if (await skip.count()) await skip.click(); // with reduced motion the whole story is already showing
    await page.getByRole("region", { name: "Result" }).waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/watch-done-${name}-${scheme}.png`, fullPage: true });

    for (const f of ["/check", "/watch"]) {
      await page.goto(site + f, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      console.log(`${f} ${name} ${scheme}${overflow ? "  SIDEWAYS SCROLL" : ""}`);
    }
    await ctx.close();
  }
}
await browser.close();
