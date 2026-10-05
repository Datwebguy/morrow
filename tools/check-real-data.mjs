import { scan } from "./real-data.mjs";

const problems = scan(process.cwd());
if (problems.length > 0) {
  console.error("Real-data check failed (AGENTS.md section 0.1):");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("real-data check: ok");
