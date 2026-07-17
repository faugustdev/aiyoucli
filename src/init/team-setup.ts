/**
 * Team Setup — integrates aiyou-team agent teams into OpenCode.
 *
 * When `aiyoucli init --tool opencode` runs, this module:
 *   1. Detects aiyou-team CLI (npx from local dependency > global PATH)
 *   2. Pre-flight: check network connectivity to npm registry
 *   3. If not found, installs it globally via `npm install -g @aiyou-dev/team`
 *   4. Validates the binary actually exists in PATH post-install
 *   5. Runs `aiyou-team setup` to configure agent teams in OpenCode
 *   6. Validates setup created expected artifacts before reporting success
 *
 * aiyou-dev/team is bundled as a dependency of @aiyou-dev/cli.
 * The npx resolution finds it in node_modules/.bin automatically.
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

// ── Types ──────────────────────────────────────────────────────────

export interface TeamSetupResult {
  installed: boolean;
  installedGlobally: boolean;
  setupRan: boolean;
  teamsConfigured: string[];
  /** Phase that failed (or null on success). Useful for actionable errors. */
  failurePhase: "preflight" | "install" | "postinstall-detect" | "setup" | "validation" | null;
  message: string;
}

export interface TeamSetupOptions {
  dryRun?: boolean;
  verbose?: boolean;
  /** Skip network pre-flight check (useful in air-gapped or cached envs). */
  skipNetworkCheck?: boolean;
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
    timeout: 60_000,
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

// ── Pre-flight: network connectivity ───────────────────────────────

/**
 * Probe npm registry reachability before attempting an install.
 * Distinguishes "no network" from "bad package version" so users get actionable errors.
 */
function checkNpmRegistryReachable(): { reachable: boolean; reason?: string } {
  // npm config get registry returns the configured registry URL.
  // We then HEAD it to confirm reachability. Time out fast — if it's not
  // reachable in 5s, no point waiting longer.
  const cfg = runCommand("npm", ["config", "get", "registry"], "pipe");
  if (cfg.error || cfg.status !== 0) {
    // npm itself broken — unusual, fall through to false positive
    return { reachable: true, reason: "npm not available; skipping preflight" };
  }

  const registry = cfg.stdout?.trim().replace(/\/$/, "");
  if (!registry) return { reachable: true, reason: "no registry configured" };

  // Use curl on POSIX, PowerShell on Windows. Skip if neither is available.
  const isWin = process.platform === "win32";
  const cmd = isWin ? "powershell" : "curl";
  const args = isWin
    ? ["-NoProfile", "-Command", `(Invoke-WebRequest -Uri '${registry}' -UseBasicParsing -TimeoutSec 5).StatusCode`]
    : ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "5", registry];

  const probe = runCommand(cmd, args, "pipe");
  if (probe.error) {
    return { reachable: false, reason: `${cmd} not available: ${probe.error.message}` };
  }

  const code = parseInt(probe.stdout?.trim() ?? "", 10);
  if (Number.isFinite(code) && code >= 200 && code < 500) {
    // 2xx/3xx = OK, 4xx = reachable (auth/config issue, not network)
    return { reachable: true };
  }

  return {
    reachable: false,
    reason: `${registry} returned ${probe.stdout?.trim() || "no response"}`,
  };
}

// ── Installation ───────────────────────────────────────────────────

interface InstallResult {
  ok: boolean;
  reason?: string;
  stderr?: string;
}

function installAiyouTeamGlobally(options: TeamSetupOptions): InstallResult {
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
    return { ok: true };
  }

  try {
    const result = spawnSync("npm", args, {
      shell: process.platform === "win32",
      stdio: "pipe",
      timeout: 180_000, // 3 minutes — package + transitive deps
    });

    if (result.error) {
      return {
        ok: false,
        reason: `npm install failed to spawn: ${result.error.message}`,
        stderr: typeof result.stderr === "string" ? result.stderr : undefined,
      };
    }

    if ((result.status ?? 1) !== 0) {
      const stderr = typeof result.stderr === "string" ? result.stderr : "";
      const stdout = typeof result.stdout === "string" ? result.stdout : "";
      return {
        ok: false,
        reason: `npm install exited with code ${result.status}`,
        stderr: stderr || stdout,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: `npm install threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Team Setup ─────────────────────────────────────────────────────

interface SetupResult {
  success: boolean;
  output: string;
  stderr: string;
}

function runAiyouTeamSetup(options: TeamSetupOptions): SetupResult {
  const args = ["aiyou-team", "setup"];

  if (options.verbose) {
    args.push("--verbose");
  }

  if (options.dryRun) {
    args.push("--dry-run");
  }

  // Try npx first (resolves from node_modules/.bin)
  const result = spawnSync("npx", args, {
    shell: process.platform === "win32",
    stdio: "pipe",
    timeout: 120_000,
    encoding: "utf8",
  });

  const stdout = (typeof result.stdout === "string" ? result.stdout : "").trim();
  const stderr = (typeof result.stderr === "string" ? result.stderr : "").trim();
  const output = stdout || stderr;

  if (result.status === 0 || (result.status === 1 && output.includes("setup completed"))) {
    return { success: true, output, stderr };
  }

  // Fallback to global
  const globalResult = spawnSync("aiyou-team", ["setup", ...args.slice(1)], {
    shell: process.platform === "win32",
    stdio: "pipe",
    timeout: 120_000,
    encoding: "utf8",
  });

  const globalStdout = (typeof globalResult.stdout === "string" ? globalResult.stdout : "").trim();
  const globalStderr = (typeof globalResult.stderr === "string" ? globalResult.stderr : "").trim();
  const globalOutput = globalStdout || globalStderr;

  return {
    success: (globalResult.status ?? 1) === 0 ||
      (globalResult.status === 1 && globalOutput.includes("setup completed")),
    output: globalOutput,
    stderr: globalStderr,
  };
}

function parseTeamsFromSetupOutput(output: string): string[] {
  const teams: string[] = [];
  const teamPatterns = [/coding-team/, /general-team/, /wukong-team/];

  for (const pattern of teamPatterns) {
    if (pattern.test(output)) {
      teams.push(pattern.source);
    }
  }

  if (teams.length === 0 && output.includes("completed")) {
    teams.push("coding-team");
  }

  return teams;
}

// ── Post-install validation ────────────────────────────────────────

/**
 * Confirm that the install actually produced a working binary AND setup
 * wrote the expected OpenCode config files. We validate instead of trusting
 * exit codes because npm can exit 0 with warnings, and `setup` can exit 0
 * without writing anything if it crashes early.
 */
function validateInstallation(): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // 1. Binary in PATH
  const detection = detectAiyouTeamCli();
  if (!detection.found) {
    reasons.push("`aiyou-team` binary not found in PATH after install");
  } else if (!detection.version) {
    reasons.push("`aiyou-team` binary found but `version` command failed");
  }

  // 2. Setup artifacts on disk
  const artifactPaths = [
    // Linux/macOS global OpenCode config
    `${process.env.HOME}/.config/opencode/agent-teams`,
    `${process.env.HOME}/.config/opencode/aiyou-team.json`,
    `${process.env.HOME}/.aiyou-team/teams`,
    // macOS-specific
    `${process.env.HOME}/Library/Application Support/opencode/agent-teams`,
  ];
  const artifactFound = artifactPaths.some((p) => existsSync(p));
  if (!artifactFound) {
    reasons.push(
      "OpenCode team artifacts not found in any known location (ran setup but nothing was written)"
    );
  }

  return { ok: reasons.length === 0, reasons };
}

// ── Main Entry Point ───────────────────────────────────────────────

/**
 * Set up aiyou-team agent teams for OpenCode integration.
 *
 * Returns a structured TeamSetupResult. Caller should inspect
 * `failurePhase` to decide whether to abort init or continue.
 */
export async function setupAiyouTeam(
  options: TeamSetupOptions = {}
): Promise<TeamSetupResult> {
  // Step 1: Detect
  const detection = detectAiyouTeamCli();

  if (detection.found) {
    // Already installed — run setup directly
    if (options.verbose) {
      console.log(`  aiyou-team already installed (via ${detection.via}, v${detection.version ?? "?"})`);
    }

    const setup = runAiyouTeamSetup(options);
    const teams = parseTeamsFromSetupOutput(setup.output);

    if (!setup.success) {
      return {
        installed: true,
        installedGlobally: true,
        setupRan: false,
        teamsConfigured: [],
        failurePhase: "setup",
        message: [
          `aiyou-team v${detection.version ?? "unknown"} found but \`setup\` failed.`,
          "",
          "Last output:",
          setup.output || setup.stderr || "(no output)",
          "",
          "Run `aiyou-team setup --verbose` manually to debug.",
        ].join("\n"),
      };
    }

    return {
      installed: true,
      installedGlobally: true,
      setupRan: true,
      teamsConfigured: teams.length > 0 ? teams : ["coding-team"],
      failurePhase: null,
      message: `aiyou-team v${detection.version ?? "unknown"} already installed. Teams configured: ${teams.join(", ") || "coding-team"}.`,
    };
  }

  // Step 2: Pre-flight network check
  if (!options.skipNetworkCheck && !options.dryRun) {
    const probe = checkNpmRegistryReachable();
    if (!probe.reachable) {
      return {
        installed: false,
        installedGlobally: false,
        setupRan: false,
        teamsConfigured: [],
        failurePhase: "preflight",
        message: [
          "Cannot reach the npm registry:",
          `  ${probe.reason ?? "unknown"}`,
          "",
          "aiyou-team could not be installed. Fix your network (or use a local npm mirror) and retry.",
          "",
          "Workarounds:",
          "  • npm config set registry https://registry.npmjs.org/",
          "  • Run `aiyoucli init --skip-team` to skip plugin installation and configure manually later",
          "  • Install manually: `npm install -g @aiyou-dev/team && aiyou-team setup`",
        ].join("\n"),
      };
    }
  }

  // Step 3: Install
  if (!options.dryRun) {
    console.log("  aiyou-team not found. Installing...");
  }

  const installResult = installAiyouTeamGlobally(options);

  if (!installResult.ok) {
    return {
      installed: false,
      installedGlobally: false,
      setupRan: false,
      teamsConfigured: [],
      failurePhase: "install",
      message: [
        "Could not install aiyou-team automatically.",
        `Reason: ${installResult.reason ?? "unknown"}`,
        installResult.stderr ? `\nnpm stderr:\n${installResult.stderr.trim().split("\n").slice(-10).join("\n")}` : "",
        "",
        "Try one of these:",
        "  • npm install -g @aiyou-dev/team",
        "  • npx @aiyou-dev/team setup",
        "  • aiyoucli init --skip-team   (configure teams manually later)",
      ].join("\n"),
    };
  }

  // Step 4: Re-detect after install
  const postInstall = detectAiyouTeamCli();
  if (!postInstall.found) {
    return {
      installed: true,
      installedGlobally: true,
      setupRan: false,
      teamsConfigured: [],
      failurePhase: "postinstall-detect",
      message: [
        "aiyou-team installed but not found in PATH.",
        "",
        "This usually means npm's global bin directory is not in your PATH.",
        "Fix it with one of:",
        `  • Add $(npm config get prefix)/bin to your PATH`,
        `  • Open a new terminal (PATH is reloaded on shell start)`,
        `  • Run: npm bin -g   to find the correct directory`,
        "",
        "Then verify: `aiyou-team version`",
      ].join("\n"),
    };
  }

  // Step 5: Run setup
  const setup = runAiyouTeamSetup(options);
  const teams = parseTeamsFromSetupOutput(setup.output);

  if (!setup.success) {
    return {
      installed: true,
      installedGlobally: true,
      setupRan: false,
      teamsConfigured: [],
      failurePhase: "setup",
      message: [
        `aiyou-team installed (v${postInstall.version ?? "?"}) but \`aiyou-team setup\` failed.`,
        "",
        "Last output:",
        setup.output || setup.stderr || "(no output)",
        "",
        "Run `aiyou-team setup --verbose` manually to debug.",
      ].join("\n"),
    };
  }

  // Step 6: Validate
  if (!options.dryRun) {
    const validation = validateInstallation();
    if (!validation.ok) {
      return {
        installed: true,
        installedGlobally: true,
        setupRan: true,
        teamsConfigured: teams,
        failurePhase: "validation",
        message: [
          `aiyou-team installed but setup validation failed:`,
          ...validation.reasons.map((r) => `  • ${r}`),
          "",
          "The plugin may not load correctly. Check:",
          "  • Run `aiyou-team doctor` for diagnostics",
          "  • Run `aiyou-team setup --verbose` to see what happened",
        ].join("\n"),
      };
    }
  }

  return {
    installed: true,
    installedGlobally: true,
    setupRan: true,
    teamsConfigured: teams.length > 0 ? teams : ["coding-team"],
    failurePhase: null,
    message: `aiyou-team installed and configured. Teams: ${teams.join(", ") || "coding-team"}.`,
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