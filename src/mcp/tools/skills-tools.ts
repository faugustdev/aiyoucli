/**
 * Skills tools — sync, detect, and manage TOON-distilled skills.
 *
 * Detects new SKILL.md files installed outside of `aiyoucli init`,
 * distills them to TOON, removes originals, and updates rules.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { distillMarkdown, detectTechnologies } from "../../napi/index.js";
import {
  existsSync, mkdirSync, writeFileSync, readFileSync,
  readdirSync, lstatSync, rmSync, realpathSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";

function assertWithinCwd(dir: string): void {
  const resolved = existsSync(dir) ? realpathSync(resolve(dir)) : resolve(dir);
  const cwd = realpathSync(process.cwd());
  if (!resolved.startsWith(cwd + "/") && resolved !== cwd) {
    throw new Error(`Path must be within project root: ${resolved}`);
  }
}

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

function findSkillMds(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry.startsWith(".")) continue;
    if (lstatSync(full).isDirectory()) {
      results.push(...findSkillMds(full));
    } else if (entry === "SKILL.md") {
      results.push(full);
    }
  }
  return results;
}

export const skillsTools: MCPTool[] = [
  {
    name: "skills_sync",
    description: "Scan for new SKILL.md files, distill to TOON, remove originals. Run after installing skills outside of aiyoucli init.",
    inputSchema: {
      type: "object",
      properties: {
        project_dir: { type: "string", description: "Project root (default: cwd)" },
      },
    },
    handler: async (input) => {
      const projectDir = (input.project_dir as string) || process.cwd();
      assertWithinCwd(projectDir);
      const toonDir = join(projectDir, ".aiyoucli", "skills");
      mkdirSync(toonDir, { recursive: true });

      // Find existing TOON files
      const existingToon = new Set<string>();
      if (existsSync(toonDir)) {
        for (const f of readdirSync(toonDir)) {
          if (f.endsWith(".dsi.toon")) {
            existingToon.add(f.replace(".dsi.toon", ""));
          }
        }
      }

      // Scan for SKILL.md in both locations
      const searchDirs = [
        join(projectDir, ".agents", "skills"),
        join(projectDir, ".claude", "skills"),
      ];

      let distilled = 0;
      let skipped = 0;
      const newSkills: string[] = [];

      for (const searchDir of searchDirs) {
        const skillMds = findSkillMds(searchDir);
        for (const mdPath of skillMds) {
          const skillName = dirname(mdPath).split("/").pop() ?? "unknown";

          if (existingToon.has(skillName)) {
            skipped++;
            continue;
          }

          try {
            const md = readFileSync(mdPath, "utf-8");
            const toon = distillMarkdown(md);
            const toonPath = join(toonDir, `${skillName}.dsi.toon`);
            writeFileSync(toonPath, toon);
            distilled++;
            newSkills.push(skillName);
          } catch {
            // Skip individual failures
          }
        }
      }

      // Clean up original MD skills after distillation
      if (distilled > 0) {
        for (const searchDir of searchDirs) {
          if (existsSync(searchDir)) {
            rmSync(searchDir, { recursive: true, force: true });
          }
        }
        // Clean .agents/ if empty
        const agentsDir = join(projectDir, ".agents");
        if (existsSync(agentsDir)) {
          try {
            const entries = readdirSync(agentsDir).filter((e) => !e.startsWith("."));
            if (entries.length === 0) rmSync(agentsDir, { recursive: true, force: true });
          } catch {}
        }
      }

      const lines: string[] = [];
      if (distilled > 0) {
        lines.push(`Distilled ${distilled} new skills to TOON:`);
        for (const name of newSkills) lines.push(`  ✔ ${name}`);
        lines.push(`Cleaned original MDs.`);
      }
      if (skipped > 0) lines.push(`Skipped ${skipped} already distilled.`);
      if (distilled === 0 && skipped === 0) lines.push("No new skills found.");

      return text(lines.join("\n"));
    },
  },
  {
    name: "skills_list",
    description: "List all TOON-distilled skills in the project",
    inputSchema: {
      type: "object",
      properties: {
        project_dir: { type: "string", description: "Project root (default: cwd)" },
      },
    },
    handler: async (input) => {
      const projectDir = (input.project_dir as string) || process.cwd();
      assertWithinCwd(projectDir);
      const toonDir = join(projectDir, ".aiyoucli", "skills");

      if (!existsSync(toonDir)) return json({ skills: [], total: 0 });

      const skills = readdirSync(toonDir)
        .filter((f) => f.endsWith(".dsi.toon"))
        .map((f) => {
          const fullPath = join(toonDir, f);
          const size = lstatSync(fullPath).size;
          return {
            name: f.replace(".dsi.toon", ""),
            file: f,
            size_bytes: size,
            estimated_tokens: Math.round(size / 4),
          };
        });

      return json({ skills, total: skills.length });
    },
  },
  {
    name: "skills_detect",
    description: "Detect technologies in the project and show recommended skills",
    inputSchema: {
      type: "object",
      properties: {
        project_dir: { type: "string", description: "Project root (default: cwd)" },
      },
    },
    handler: async (input) => {
      const projectDir = (input.project_dir as string) || process.cwd();
      assertWithinCwd(projectDir);
      return json(detectTechnologies(projectDir));
    },
  },
];
