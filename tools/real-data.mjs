// Real-data checks (AGENTS.md section 0.1). Run by `npm run lint`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SHIPPED_ROOTS = ["apps", "packages"];
const SHIPPED_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "coverage", "test", "tests", "__tests__", "fixtures"]);
const CONFIG_DIR = ["packages", "config"].join(sep);

// Words that must not appear in shipped code (the HTML `placeholder` attribute alone is allowed).
const BANNED = [/mock/i, /fake/i, /dummy/i, /lorem/i, /sample[\s_-]*data/i, /seed[\s_-]*data/i, /placeholder[\s_-]*data/i];

// Loan-limit numbers that must live only in packages/config (as decimals or percents).
const LIMIT_DECIMAL = /(?<![\w.])0?\.(65|70?|74|75|78|82|85|88|90?|91)(?![\w.])/;
const LIMIT_PERCENT = /(?<![\w.])(65|70|74|75|78|82|85|88|91)\s*%/;

function isTestFile(name) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      yield* walk(full);
    } else {
      const dot = name.lastIndexOf(".");
      if (dot < 0 || !SHIPPED_EXT.has(name.slice(dot))) continue;
      if (isTestFile(name)) continue;
      yield full;
    }
  }
}

/** Returns a list of problems found under `root`. */
export function scan(root) {
  const problems = [];
  for (const top of SHIPPED_ROOTS) {
    for (const file of walk(join(root, top))) {
      const rel = relative(root, file);
      const inConfig = rel.startsWith(CONFIG_DIR + sep);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const re of BANNED) {
          if (re.test(line)) problems.push(`${rel}:${i + 1} banned word ${re}`);
        }
        if (!inConfig && (LIMIT_DECIMAL.test(line) || LIMIT_PERCENT.test(line))) {
          problems.push(`${rel}:${i + 1} loan-limit number outside packages/config`);
        }
      });
    }
  }
  return problems;
}
