// Measures every paragraph in a real browser at desktop width and fails if any is longer than two lines.
// Usage: node tools/check-copy.mjs <siteUrl> [paths...]
import { chromium } from "playwright-core";

const [site, ...rest] = process.argv.slice(2);
const paths = rest.length ? rest : ["/", "/record", "/pricing", "/risks"];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let bad = 0;
for (const p of paths) {
  await page.goto(site + p, { waitUntil: "networkidle" });
  const buttons = await page.$$("#faq button[aria-expanded]");
  const measure = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll("p")]
        .filter((el) => el.offsetParent !== null && el.textContent.trim().length > 0)
        .map((el) => {
          const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.5;
          const cs = getComputedStyle(el);
          const content = el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
          return { text: el.textContent.trim().slice(0, 70), lines: Math.round(content / lh) };
        }),
    );
  const seen = new Map();
  for (const m of await measure()) seen.set(m.text, m.lines);
  for (const b of buttons) {
    await b.click();
    for (const m of await measure()) seen.set(m.text, m.lines);
  }
  for (const [text, lines] of seen) {
    if (lines > 2) {
      bad++;
      console.log(`${p}  ${lines} lines: ${text}`);
    }
  }
  console.log(`${p}: ${seen.size} paragraphs checked`);
}
await browser.close();
if (bad) process.exit(1);
