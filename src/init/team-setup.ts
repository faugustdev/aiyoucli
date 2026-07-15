/**
 * Team Setup — integrates aiyou-team agent teams into OpenCode.
 *
 * When `aiyoucli init --tool opencode` runs, this module:
 *   1. Detects aiyou-team CLI (npx from local dependency > global PATH)
 *   2. If not found, installs it globally via `npm install -g @aiyou-dev/team`
 *   3. Runs `aiyou-team setup` to configure agent teams in OpenCode
 *   4. Reports what was configured
 *
 * aiyou-dev/team is bundled as a dependency of @aiyou-dev/cli.
 * The npx resolution finds it in node_modules/.bin automatically.
 */

import { spawnSync } from "node:child_process";

// ── Types ──────────────────────────────────────────────────────────

export interface TeamSetupResult {
  installed: boolean;
  installedGlobally: boolean;
  setupRan: boolean;
  teamsConfigured: string[];
  message: string;
}

export interface TeamSetupOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

// ── Detection ──────────────────────────────────────────────────────

function runCommand(
  command: string,
  args: string[],
  stdio: "inherit" | "pipe"
): { status: number | null; stdout?: string; stderr?: string; error?: Error } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio,
  });

  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : undefined,
    stderr: typeof result.stderr === "string" ? result.stderr : undefined,
    error: result.error,
  };
}

/**
 * Detect aiyou-team CLI availability.
 * Priority: npx (local node_modules) > global PATH.
 * npx resolves from node_modules/.bin when @aiyou-dev/team is a dependency.
 */
function detectAiyouTeamCli(): { found: boolean; version?: string; via: "npx" | "global" | "none" } {
  // 1. Try npx (resolves from node_modules/.bin when installed as dependency)
  const npxResult = runCommand("npx", ["aiyou-team", "version"], "pipe");
  if (!npxResult.error && npxResult.status === 0) {
    const version = npxResult.stdout?.trim();
    return {
      found: true,
      version: version && version.length > 0 ? version : undefined,
      via: "npx",
    };
  }

  // 2. Try global PATH
  const globalResult = runCommand("aiyou-team", ["version"], "pipe");
  if (!globalResult.error && globalResult.status === 0) {
    const version = globalResult.stdout?.trim();
    return {
      found: true,
      version: version && version.length > 0 ? version : undefined,
      via: "global",
    };
  }

  return { found: false, via: "none" };
}

// ── Installation ───────────────────────────────────────────────────

function installAiyouTeamGlobally(options: TeamSetupOptions): boolean {
  const args = [
    "install",
    "-g",
    "@aiyou-dev/team",
    "--no-audit",
    "--no-fund",
  ];

  if (options.verbose) {
    console.log(`  Running: npm ${args.join(" ")}`);
  }

  if (options.dryRun) {
    console.log(`  [dry-run] Would run: npm ${args.join(" ")}`);
    return true;
  }

  try {
    const result = spawnSync("npm", args, {
      shell: process.platform === "win32",
      stdio: "inherit",
      timeout: 120_000, // 2 minutes max
    });

    if (result.error) {
      console.log(`  Warning: npm install failed: ${result.error.message}`);
      return false;
    }

    return (result.status ?? 1) === 0;
  } catch {
    return false;
  }
}

// ── Team Setup ─────────────────────────────────────────────────────

function runAiyouTeamSetup(options: TeamSetupOptions): {
  success: boolean;
  output: string;
} {
  const args = ["aiyou-team", "setup"];

  if (options.verbose) {
    args.push("--verbose");
  }

  if (options.dryRun) {
    args.push("--dry-run");
  }

  try {
    // Try npx first (resolves from node_modules/.bin)
    const result = spawnSync("npx", args, {
      shell: process.platform === "win32",
      stdio: "pipe",
      timeout: 60_000,
      encoding: "utf8",
    });

    const output = (result.stdout || result.stderr || "").toString().trim();

    // Exit code 1 means doctor found issues, but setup still completed
    if (result.status === 0 || (result.status === 1 && output.includes("setup completed"))) {
      return { success: true, output };
    }

    // Fallback to global
    const globalResult = spawnSync("aiyou-team", ["setup", ...args.slice(1)], {
      shell: process.platform === "win32",
      stdio: "pipe",
      timeout: 60_000,
      encoding: "utf8",
    });

    const globalOutput = (globalResult.stdout || globalResult.stderr || "").toString().trim();
    return {
      success: (globalResult.status ?? 1) === 0 || (globalResult.status === 1 && globalOutput.includes("setup completed")),
      output: globalOutput,
    };
  } catch {
    return { success: false, output: "" };
  }
}

function parseTeamsFromSetupOutput(output: string): string[] {
  // Parse lines like "✓ Config: /path/to/aiyou-team.json"
  // or "✓ Install root: /path/to/opencode"
  const teams: string[] = [];

  // Look for team names in output
  const teamPatterns = [
    /coding-team/,
    /general-team/,
    /wukong-team/,
  ];

  for (const pattern of teamPatterns) {
    if (pattern.test(output)) {
      teams.push(pattern.source);
    }
  }

  // Fallback: if setup succeeded, assume coding-team is configured
  if (teams.length === 0 && output.includes("completed")) {
    teams.push("coding-team");
  }

  return teams;
}

// ── Main Entry Point ───────────────────────────────────────────────

/**
 * Set up aiyou-team agent teams for OpenCode integration.
 *
 * Called from `aiyoucli init --tool opencode` to install and configure
 * structured agent teams (coding-team, general-team, etc.) that work
 * with OpenCode's plugin system.
 *
 * @returns TeamSetupResult describing what was configured
 */
export async function setupAiyouTeam(
  options: TeamSetupOptions = {}
): Promise<TeamSetupResult> {
  // Step 1: Check if aiyou-team is already installed globally
  const detection = detectAiyouTeamCli();

  if (detection.found) {
    // Already installed — run setup directly
    const setup = runAiyouTeamSetup(options);
    const teams = parseTeamsFromSetupOutput(setup.output);

    return {
      installed: true,
      installedGlobally: true,
      setupRan: true,
      teamsConfigured: teams.length > 0 ? teams : ["coding-team"],
      message: setup.success
        ? `aiyou-team v${detection.version ?? "unknown"} already installed. Teams configured: ${teams.join(", ") || "coding-team"}.`
        : `aiyou-team v${detection.version ?? "unknown"} found but setup failed. You can run 'aiyou-team setup' manually.`,
    };
  }

  // Step 2: Not installed — try to install globally
  if (!options.dryRun) {
    console.log("  aiyou-team not found. Installing...");
  }

  const installed = installAiyouTeamGlobally(options);

  if (!installed) {
    return {
      installed: false,
      installedGlobally: false,
      setupRan: false,
      teamsConfigured: [],
      message: [
        "Could not install aiyou-team automatically.",
        "",
        "To set up agent teams manually, run:",
        "  npm install -g @aiyou-dev/team",
        "  aiyou-team setup",
        "",
        "Or use npx (no global install needed):",
        "  npx @aiyou-dev/team setup",
      ].join("\n"),
    };
  }

  // Step 3: Re-detect after installation
  const postInstall = detectAiyouTeamCli();
  if (!postInstall.found) {
    return {
      installed: true,
      installedGlobally: true,
      setupRan: false,
      teamsConfigured: [],
      message: [
        "aiyou-team installed but not found in PATH.",
        "Open a new terminal or run: aiyou-team setup",
      ].join("\n"),
    };
  }

  // Step 4: Run setup
  const setup = runAiyouTeamSetup(options);
  const teams = parseTeamsFromSetupOutput(setup.output);

  return {
    installed: true,
    installedGlobally: true,
    setupRan: true,
    teamsConfigured: teams.length > 0 ? teams : ["coding-team"],
    message: setup.success
      ? `aiyou-team installed and configured. Teams: ${teams.join(", ") || "coding-team"}.`
      : `aiyou-team installed but setup failed. Run 'aiyou-team setup' manually.`,
  };
}

/**
 * Quick check: is aiyou-team already configured for the current OpenCode installation?
 * Useful for showing status during init without triggering any installs.
 */
export function checkAiyouTeamStatus(): {
  installed: boolean;
  cliAvailable: boolean;
  via: "npx" | "global" | "none";
} {
  const detection = detectAiyouTeamCli();
  return {
    installed: detection.found,
    cliAvailable: detection.found,
    via: detection.via,
  };
}
