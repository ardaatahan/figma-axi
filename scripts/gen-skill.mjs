// Generates skills/figma-axi/SKILL.md from src/skill/content.ts (via the
// built dist/). Run `npm run build` first. `--check` exits 1 if the
// committed file is stale — wire it into CI (AXI principle 7).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "skills", "figma-axi", "SKILL.md");

let renderSkill;
try {
  ({ renderSkill } = await import(new URL("../dist/skill/content.js", import.meta.url).href));
} catch {
  console.log("error: dist/ not found — run 'npm run build' first");
  process.exit(1);
}

const content = renderSkill();
const check = process.argv.includes("--check");

if (check) {
  const existing = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
  if (existing !== content) {
    console.log("error: skills/figma-axi/SKILL.md is stale or missing");
    console.log("suggestion: run 'npm run skill:gen' and commit the result");
    process.exit(1);
  }
  console.log("skill: SKILL.md up to date");
  process.exit(0);
}

if (existsSync(outPath) && readFileSync(outPath, "utf8") === content) {
  console.log("skill: SKILL.md already up to date (no-op)");
  process.exit(0);
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, content);
console.log(`skill: wrote skills/figma-axi/SKILL.md (${content.length} chars)`);
