/**
 * Security tools — scanning and auditing.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

export const securityTools: MCPTool[] = [
  {
    name: "security_scan",
    description: "Run security scan — npm audit + basic checks",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const results: Array<{ check: string; status: string; detail?: string }> = [];
      const cwd = process.cwd();

      // npm audit
      if (existsSync(join(cwd, "package.json"))) {
        try {
          const audit = execSync("npm audit --json 2>/dev/null", { encoding: "utf-8", timeout: 30000 });
          const parsed = JSON.parse(audit);
          const vulns = parsed.metadata?.vulnerabilities || {};
          const total = Object.values(vulns).reduce((a: number, b: unknown) => a + (b as number), 0);
          results.push({
            check: "npm audit",
            status: total > 0 ? "warn" : "ok",
            detail: `${total} vulnerabilities (${vulns.high || 0} high, ${vulns.critical || 0} critical)`,
          });
        } catch {
          results.push({ check: "npm audit", status: "skip", detail: "audit failed or not available" });
        }
      }

      // Check for .env in git
      try {
        const tracked = execSync("git ls-files .env .env.local .env.production 2>/dev/null", { encoding: "utf-8" }).trim();
        results.push({
          check: "secrets in git",
          status: tracked ? "fail" : "ok",
          detail: tracked ? `Tracked secret files: ${tracked}` : "No .env files tracked",
        });
      } catch {
        results.push({ check: "secrets in git", status: "skip" });
      }

      const hasIssues = results.some((r) => r.status === "fail" || r.status === "warn");
      return json({ clean: !hasIssues, results });
    },
  },
];
