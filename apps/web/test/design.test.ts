import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]));
}

function light(): Record<string, string> {
  return tokens(css.slice(css.indexOf(":root {"), css.indexOf("@media")));
}
function dark(): Record<string, string> {
  return tokens(css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf("@theme")));
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("colour tokens (AGENTS.md section 8)", () => {
  it("define every token in both themes with the exact values from the brief", () => {
    expect(light()).toMatchObject({ ink: "#0e1116", canvas: "#f7f8fa", surface: "#ffffff", line: "#e3e6eb", muted: "#5b6472", safe: "#127a5a", watch: "#8a5a0b", danger: "#c2362f", accent: "#2f5bff" });
    expect(dark()).toMatchObject({ ink: "#f2f4f7", canvas: "#0b0d12", surface: "#141821", line: "#252b36", muted: "#98a2b3", safe: "#3dd39b", watch: "#f2b84b", danger: "#ff6b5f", accent: "#6e8bff" });
  });
  for (const [name, get] of [["light", light], ["dark", dark]] as const) {
    it(`every text and background pair passes WCAG AA in the ${name} theme`, () => {
      const t = get();
      for (const bg of ["canvas", "surface"]) {
        for (const fg of ["ink", "muted", "safe", "watch", "danger", "accent"]) {
          expect(contrast(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(t["on-accent"]!, t["accent"]!), "button text on accent").toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["muted"]!, t["surface"]!), "form control border").toBeGreaterThanOrEqual(3);
    });
  }
  it("has a reduced-motion rule and a visible focus ring", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(":focus-visible");
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
  });
}

describe("words on screen (AGENTS.md section 8)", () => {
  // Developer words that must never reach the user. lib/types.ts and lib/api.ts name server fields, and app/api is server code: none of it is shown.
  const banned = [/\bLTV\b/i, /loan-to-value/i, /forceRate/, /supRate/, /\bpledge\b/i, /collateral/i, /\bAPI key\b/i, /\bOAuth\b/i, /order id/i, /request id/i, /tx hash/i, /SHA-?256/i, /\bhash\b/i, /stack trace/i, /revise/i, /repayCoins/];
  const files = sources(join(__dirname, "../src")).filter((f) => !/lib\/(types|api)\.ts$|\/app\/api\//.test(f));
  it("keeps developer terms out of every screen's text", () => {
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const re of banned) if (re.test(text)) hits.push(`${f.split("/src/")[1]} matches ${re}`);
    }
    expect(hits).toEqual([]);
  });
  it("uses only Geist, with no other font family", () => {
    const hits = files.filter((f) => /font-family:(?!\s*var\()/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
    expect(readFileSync(join(__dirname, "../src/app/layout.tsx"), "utf8")).toContain("geist/font/sans");
  });
});
