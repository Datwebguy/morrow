// Writes docs/FAQ.md and docs/RISKS.md from the same content the site shows, so they cannot drift.
// Run: npx tsx tools/make-docs.ts
import { writeFileSync } from "node:fs";
import { FAQ } from "../apps/web/src/content/faq";
import { RISKS } from "../apps/web/src/content/risks";

const faq = ["# Questions", "", ...FAQ.flatMap((x) => [`## ${x.q}`, "", x.a, ""])].join("\n");
const risks = ["# Risks", "", "Read these before you protect a loan.", "", ...RISKS.flatMap((x) => [`## ${x.title}`, "", x.body, ""])].join("\n");
writeFileSync(new URL("../docs/FAQ.md", import.meta.url), faq);
writeFileSync(new URL("../docs/RISKS.md", import.meta.url), risks);
console.log("Wrote docs/FAQ.md and docs/RISKS.md");
