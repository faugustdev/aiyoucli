/**
 * Interactive init — detects technologies, prompts for skills, installs + distills.
 * Zero runtime deps: uses Node readline for UI.
 */

import { createInterface } from "node:readline";
import { execSync, spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { detectTechnologies, distillMarkdown, type DetectResult } from "../napi/index.js";
import { output, color } from "../output.js";

// ── Simple UI helpers (zero deps) ────────────────────────────────

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await ask(`${question} ${hint} `);
  if (answer === "") return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

async function selectMultiple(
  title: string,
  items: Array<{ label: string; value: string; checked: boolean }>
): Promise<string[]> {
  console.log(`\n${color.bold(title)}\n`);
  for (let i = 0; i < items.length; i++) {
    const check = items[i].checked ? color.green("✔") : " ";
    console.log(`  ${check} ${i + 1}. ${items[i].label}`);
  }
  console.log(`\n  ${color.dim("Enter numbers to toggle (e.g. 1,3,5), 'a' for all, Enter to confirm:")}`);
  const answer = await ask("  > ");

  if (answer.toLowerCase() === "a") {
    return items.map((i) => i.value);
  }
  if (answer === "") {
    return items.filter((i) => i.checked).map((i) => i.value);
  }

  const indices = answer.split(",").map((s) => parseInt(s.trim(), 10) - 1);
  for (const idx of indices) {
    if (idx >= 0 && idx < items.length) {
      items[idx].checked = !items[idx].checked;
    }
  }
  return items.filter((i) => i.checked).map((i) => i.value);
}

// ── Skill installation ───────────────────────────────────────────

function parseSkillPath(skill: string): { repo: string; skillName: string } {
  const parts = skill.split("/");
  return {
    repo: parts.slice(0, 2).join("/"),
    skillName: parts.slice(2).join("/"),
  };
}

async function installSkill(skillPath: string): Promise<boolean> {
  const { repo, skillName } = parseSkillPath(skillPath);
  const args = ["-y", "skills", "add", repo];
  if (skillName) args.push("--skill", skillName, "-y");

  return new Promise((resolve) => {
    const child = spawn("npx", args, { stdio: ["pipe", "pipe", "pipe"] });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

// ── TOON distillation of installed skills ────────────────────────

function distillInstalledSkills(projectRoot: string): string[] {
  // Skills live in .agents/skills/ with symlinks in .claude/skills/
  const agentsSkillsDir = join(projectRoot, ".agents", "skills");
  const claudeSkillsDir = join(projectRoot, ".claude", "skills");
  const searchDir = existsSync(agentsSkillsDir) ? agentsSkillsDir : claudeSkillsDir;
  if (!existsSync(searchDir)) return [];

  const distilled: string[] = [];
  const toonDir = join(projectRoot, ".aiyoucli", "skills");
  mkdirSync(toonDir, { recursive: true });

  try {
    const entries = readDirRecursive(searchDir);
    for (const entry of entries) {
      if (!entry.endsWith("SKILL.md")) continue;

      const content = readFileSync(entry, "utf-8");
      const toon = distillMarkdown(content);
      const name = dirname(entry).split("/").pop() ?? "unknown";
      const toonPath = join(toonDir, `${name}.dsi.toon`);
      writeFileSync(toonPath, toon);
      distilled.push(toonPath);
    }
  } catch {
    // Non-critical
  }

  return distilled;
}

function readDirRecursive(dir: string): string[] {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...readDirRecursive(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

// ── Generate path-based rules ────────────────────────────────────

interface RuleDef {
  name: string;
  paths: string[];
  toonFiles: string[];
}

function generateRules(
  detected: DetectResult["detected"],
  distilledPaths: string[],
  projectRoot: string
): void {
  const rulesDir = join(projectRoot, ".claude", "rules");
  mkdirSync(rulesDir, { recursive: true });

  const ruleMap: Record<string, RuleDef> = {
    frontend: {
      name: "frontend",
      paths: ["src/components/**", "src/pages/**", "*.tsx", "*.jsx", "*.vue", "*.svelte", "*.astro"],
      toonFiles: [],
    },
    backend: {
      name: "backend",
      paths: ["src/api/**", "src/server/**", "*.controller.ts", "*.service.ts", "routes/**"],
      toonFiles: [],
    },
    mobile: {
      name: "mobile",
      paths: ["app/**", "src/screens/**", "*.swift", "*.kt", "*.dart"],
      toonFiles: [],
    },
    styling: {
      name: "styling",
      paths: ["*.css", "*.scss", "*.sass", "tailwind.config.*"],
      toonFiles: [],
    },
    testing: {
      name: "testing",
      paths: ["__tests__/**", "*.test.*", "*.spec.*", "tests/**", "e2e/**"],
      toonFiles: [],
    },
    database: {
      name: "database",
      paths: ["prisma/**", "*.sql", "migrations/**", "drizzle/**"],
      toonFiles: [],
    },
    devops: {
      name: "devops",
      paths: ["Dockerfile", "docker-compose.*", ".github/**", "*.tf", "wrangler.*"],
      toonFiles: [],
    },
  };

  // Map distilled skills to categories based on detected technologies
  for (const tech of detected) {
    const rule = ruleMap[tech.category];
    if (!rule) continue;

    for (const dp of distilledPaths) {
      const filename = dp.split("/").pop() ?? "";
      // Match skill to tech by checking if the toon file relates to this tech
      if (filename.toLowerCase().includes(tech.id) || tech.skills.some((s) => filename.includes(s.split("/").pop() ?? ""))) {
        if (!rule.toonFiles.includes(dp)) {
          rule.toonFiles.push(dp);
        }
      }
    }
  }

  // Write rules that have matching categories
  const activeCategories = new Set(detected.map((t) => t.category));
  for (const [category, rule] of Object.entries(ruleMap)) {
    if (!activeCategories.has(category)) continue;

    const relativeToonPaths = rule.toonFiles.map((p) =>
      p.replace(projectRoot + "/", "")
    );

    let content = `---\npaths:\n`;
    for (const p of rule.paths) {
      content += `  - "${p}"\n`;
    }
    content += `---\n\n`;
    content += `# ${rule.name} rules\n\n`;

    if (relativeToonPaths.length > 0) {
      content += `Load skills:\n`;
      for (const tp of relativeToonPaths) {
        content += `@${tp}\n`;
      }
    } else {
      content += `Category: ${category}\nDetected: ${detected.filter((t) => t.category === category).map((t) => t.name).join(", ")}\n`;
    }

    writeFileSync(join(rulesDir, `${rule.name}.md`), content);
  }
}

// ── Main interactive flow ────────────────────────────────────────

export async function interactiveInit(projectRoot: string): Promise<string[]> {
  const paths: string[] = [];

  console.log(`\n${color.bold(color.cyan("■ aiyoucli init"))}\n`);

  // 1. Detect technologies
  const spinner = output.spinner("Scanning project...");
  spinner.start();
  const result = detectTechnologies(projectRoot);
  spinner.stop();

  if (result.total_technologies === 0) {
    console.log(color.dim("  No technologies detected. Generating base config only.\n"));
    return paths;
  }

  // 2. Show detected technologies
  console.log(`  ${color.green("Detected")} ${result.total_technologies} technologies:\n`);
  const byCategory: Record<string, string[]> = {};
  for (const tech of result.detected) {
    (byCategory[tech.category] ??= []).push(tech.name);
  }
  for (const [cat, techs] of Object.entries(byCategory)) {
    console.log(`  ${color.dim(cat + ":")} ${techs.join(", ")}`);
  }

  // 3. Ask about skills
  if (result.total_skills > 0) {
    console.log(`\n  ${color.yellow(String(result.total_skills))} community skills available\n`);

    const wantSkills = await confirm("  Install recommended skills?");

    if (wantSkills) {
      // Build selection list
      const items = result.skills.map((s) => {
        const name = s.split("/").pop() ?? s;
        const repo = s.split("/").slice(0, 2).join("/");
        return {
          label: `${name} ${color.dim(`(${repo})`)}`,
          value: s,
          checked: true,
        };
      });

      const selected = await selectMultiple("Select skills to install:", items);

      if (selected.length > 0) {
        console.log("");
        for (const skill of selected) {
          const name = skill.split("/").pop() ?? skill;
          process.stdout.write(`  ${color.dim("installing")} ${name}...`);
          const ok = await installSkill(skill);
          if (ok) {
            console.log(` ${color.green("✔")}`);
          } else {
            console.log(` ${color.red("✘")}`);
          }
        }

        // 4. Distill installed skills to TOON
        console.log("");
        const distilledSpinner = output.spinner("Distilling skills to TOON...");
        distilledSpinner.start();
        const distilled = distillInstalledSkills(projectRoot);
        distilledSpinner.stop();

        if (distilled.length > 0) {
          console.log(`  ${color.green("Distilled")} ${distilled.length} skills to TOON (${color.dim("-52% tokens")})`);
          paths.push(...distilled);
        }

        // 5. Generate path-based rules
        generateRules(result.detected, distilled, projectRoot);
        console.log(`  ${color.green("Generated")} .claude/rules/ (on-demand loading)`);
      }
    }
  }

  console.log("");
  return paths;
}
