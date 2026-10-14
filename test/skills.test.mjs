// Static checks: golden rule in every skill, frontmatter present, every lesson cites a doc or is marked UNVERIFIED.
import fs from "node:fs"; import path from "node:path";
const root = new URL("..", import.meta.url).pathname; let fail = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fail++; };
const dirs = fs.readdirSync(path.join(root, "skills"));
for (const d of dirs) {
  const s = fs.readFileSync(path.join(root, "skills", d, "SKILL.md"), "utf8");
  ok(/^---\nname: [\w-]+\ndescription:/m.test(s), `${d}: frontmatter name+description`);
  ok(s.includes("golden-rule-read-docs-first") && /Step 0/.test(s), `${d}: references the Golden Rule as step 0`);
}
const lessons = fs.readFileSync(path.join(root, "docs/LESSONS.md"), "utf8").split(/^### /m).slice(1);
ok(lessons.length > 0, "docs/LESSONS.md has lessons");
for (const l of lessons) ok(/Checked against: (https:\/\/hermes-agent\.nousresearch\.com\/docs\/\S+|https:\/\/github\.com\/NousResearch\/hermes-agent\S*|UNVERIFIED)/.test(l), `lesson cites official doc or UNVERIFIED: ${l.split("\n")[0]}`);
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
ok(/## Golden Rule/.test(readme) && readme.indexOf("Golden Rule") < readme.indexOf("## What's inside"), "README opens with the Golden Rule");
const pj = JSON.parse(fs.readFileSync(path.join(root, ".cursor-plugin/plugin.json"), "utf8"));
ok(/^2\.\d+\.\d+$/.test(pj.version) && /official Hermes docs/i.test(pj.description), "manifest v2.x and golden rule in description");
console.log(fail ? `\nSKILLS TEST FAIL (${fail})` : "\nSKILLS TEST PASS"); process.exit(fail ? 1 : 0);
