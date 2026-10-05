import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module
import { scan } from "./real-data.mjs";

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "real-data-"));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

describe("real-data check", () => {
  it("passes clean code", () => {
    expect(scan(repo({ "packages/core/src/a.ts": "export const a = 1;\n" }))).toEqual([]);
  });
  it("fails on banned words in shipped code, any letter case", () => {
    for (const word of ["mock", "FAKE", "Dummy", "lorem ipsum", "sample data", "seed_data", "placeholder data"]) {
      const root = repo({ "apps/web/src/a.ts": `const x = "${word}";\n` });
      expect(scan(root).length).toBeGreaterThan(0);
    }
  });
  it("allows the placeholder attribute on form fields", () => {
    expect(scan(repo({ "apps/web/src/a.tsx": '<input placeholder="Amount" />\n' }))).toEqual([]);
  });
  it("ignores test folders and test files", () => {
    const root = repo({
      "packages/core/test/a.ts": "const x = 'mock'; const y = 0.75;\n",
      "packages/core/src/a.test.ts": "const x = 'fake'; const y = 0.91;\n",
    });
    expect(scan(root)).toEqual([]);
  });
  it("fails on loan-limit literals outside packages/config", () => {
    expect(scan(repo({ "apps/worker/src/a.ts": "const limit = 0.75;\n" })).length).toBe(1);
    expect(scan(repo({ "packages/core/src/a.ts": "const limit = 91%;\n" })).length).toBe(1);
    expect(scan(repo({ "packages/core/src/a.ts": "const p = .65;\n" })).length).toBe(1);
  });
  it("allows those numbers inside packages/config", () => {
    expect(scan(repo({ "packages/config/src/a.ts": "const limit = 0.75;\n" }))).toEqual([]);
  });
  it("does not flag unrelated numbers", () => {
    expect(scan(repo({ "packages/core/src/a.ts": "const a = 10.75 + 0.751 + 1075 + x0.75;\n" }))).toEqual([]);
  });
});
