// Builds the logo exports and every favicon size from one definition of the mark.
// Run: node tools/make-brand.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";
import { chromium } from "playwright-core";

const OUT = new URL("../apps/web/public/", import.meta.url).pathname;
const BRAND = new URL("../apps/web/public/brand/", import.meta.url).pathname;
mkdirSync(BRAND, { recursive: true });

const INK = "#0E1116";
const INK_DARK = "#F2F4F7";
const CANVAS_DARK = "#0B0D12";

// The mark: a heavy M cut by a thin gap. The two feet below the gap step sideways and land in the accent colour.
const BLUE = "#2F5BFF";
const BLUE_DARK = "#6E8BFF";
const mark = (body, feet = body, gap = 0) => {
  const cut = (33.6 - gap / 2).toFixed(2);
  const foot = (37 + gap / 2).toFixed(2);
  const top = `M6 5 H13.5 L24 21 L34.5 5 H42 V${cut} H35 V16.5 L24 32.5 L13 16.5 V${cut} H6 Z`;
  return `<path d="${top}" fill="${body}"/><rect x="8.6" y="${foot}" width="7" height="${(43 - foot).toFixed(2)}" fill="${feet}"/><rect x="37.6" y="${foot}" width="7" height="${(43 - foot).toFixed(2)}" fill="${feet}"/>`;
};

const fontFile = readFileSync(new URL("../node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf", import.meta.url));
const font = opentype.parse(fontFile.buffer.slice(fontFile.byteOffset, fontFile.byteOffset + fontFile.byteLength));
const SIZE = 30;
const SPACING = -0.03;
const textWidth = font.getAdvanceWidth("morrow", SIZE, { letterSpacing: SPACING });
const textPath = (color, x) => `<path d="${font.getPath("morrow", x, 33, SIZE, { letterSpacing: SPACING }).toPathData(2)}" fill="${color}"/>`;
const LOCKUP_W = 56 + Math.ceil(textWidth);

const svg = (w, h, body, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>${body}</svg>\n`;

writeFileSync(`${BRAND}mark.svg`, svg(48, 48, mark(INK, BLUE)));
writeFileSync(`${BRAND}mark-single-colour.svg`, svg(48, 48, mark("#000000")));
writeFileSync(`${BRAND}mark-wordmark.svg`, svg(LOCKUP_W, 48, mark(INK, BLUE) + textPath(INK, 56)));
writeFileSync(`${BRAND}mark-wordmark-single-colour.svg`, svg(LOCKUP_W, 48, mark("#000000") + textPath("#000000", 56)));
writeFileSync(`${BRAND}mark-wordmark-white.svg`, svg(LOCKUP_W, 48, mark("#FFFFFF", BLUE_DARK) + textPath("#FFFFFF", 56)));

// Favicon: a wider gap so it stays readable at 16 px, and it follows the browser's theme.
writeFileSync(
  `${OUT}favicon.svg`,
  svg(
    48, 48,
    `<style>.b{fill:${INK}}.f{fill:${BLUE}}@media (prefers-color-scheme:dark){.b{fill:${INK_DARK}}.f{fill:${BLUE_DARK}}}</style>` +
      mark("X", "Y", 1.6).replace('fill="X"', 'class="b"').replaceAll('fill="Y"', 'class="f"'),
  ).replace('viewBox="0 0 48 48"', 'viewBox="1.3 0 48 48"'),
);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage();
async function png(size, { bg, color, feet, gap = 0, inset }) {
  const pad = inset;
  const inner = size - pad * 2;
  const html = `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;${bg ? `background:${bg};border-radius:${Math.round(size * 0.22)}px;` : ""}display:flex;align-items:center;justify-content:center">
    <svg width="${inner}" height="${inner}" viewBox="1.3 0 48 48">${mark(color, feet, gap)}</svg></div></body>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  return page.screenshot({ omitBackground: true, type: "png", clip: { x: 0, y: 0, width: size, height: size } });
}

// App icon, home-screen icon and the large icon: the mark on the dark canvas colour.
const app = (size) => png(size, { bg: CANVAS_DARK, color: INK_DARK, feet: BLUE_DARK, inset: Math.round(size * 0.22) });
writeFileSync(`${BRAND}app-icon-1024.png`, await app(1024));
writeFileSync(`${OUT}icon-512.png`, await app(512));
writeFileSync(`${OUT}apple-touch-icon.png`, await app(180));

// favicon.ico with 16 and 32 pixel images (PNG inside ICO).
const fav = (size) => png(size, { bg: null, color: INK, feet: BLUE, gap: size <= 16 ? 2 : 1.2, inset: 0 });
const images = [await fav(16), await fav(32)];
const sizes = [16, 32];
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const dir = Buffer.concat(
  images.map((img, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(sizes[i], 0);
    e.writeUInt8(sizes[i], 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.length;
    return e;
  }),
);
writeFileSync(`${OUT}favicon.ico`, Buffer.concat([head, dir, ...images]));
await browser.close();
console.log("Brand files written to apps/web/public");
