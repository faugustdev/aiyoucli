/**
 * aiyoucli — AI agent CLI with Rust-powered vector intelligence.
 */

import type { CommandContext } from "./types.js";
import { CommandParser } from "./parser.js";
import { output, color } from "./output.js";
import { loadConfig } from "./config.js";
import { suggestCommand } from "./suggest.js";
import { commands } from "./commands/index.js";
import { handleError } from "./production/error-handler.js";

const VERSION = "0.1.0";

export interface CLIOptions {
  name?: string;
  version?: string;
}

export class CLI {
  private name: string;
  private version: string;
  private parser = new CommandParser();

  constructor(options: CLIOptions = {}) {
    this.name = options.name ?? "aiyoucli";
    this.version = options.version ?? VERSION;
    this.registerCommands();
  }

  async run(args: string[] = process.argv.slice(2)): Promise<void> {
    const parsed = this.parser.parse(args);

    // Global flags
    if (parsed.flags.version || parsed.flags.V) {
      console.log(`${this.name} v${this.version}`);
      return;
    }

    if (parsed.flags.verbose || parsed.flags.v) {
      output.setVerbosity("verbose");
    } else if (parsed.flags.quiet || parsed.flags.q || parsed.flags.Q) {
      output.setVerbosity("quiet");
    }

    if (parsed.flags.noColor) {
      // Output respects NO_COLOR env automatically
    }

    if (
      parsed.command.length === 0 ||
      parsed.flags.help ||
      parsed.flags.h
    ) {
      if (parsed.command.length > 0) {
        this.showCommandHelp(parsed.command[0]);
      } else {
        this.showHelp();
      }
      return;
    }

    // Find command
    const cmdName = parsed.command[0];
    const cmd = this.parser.getCommand(cmdName);

    if (!cmd) {
      const suggestion = suggestCommand(
        cmdName,
        this.parser.getAllCommands().map((c) => c.name)
      );
      output.error(`Unknown command: ${cmdName}`);
      if (suggestion) {
        output.log(`\n  Did you mean ${color.cyan(suggestion)}?\n`);
      }
      output.log(`Run ${color.dim(`${this.name} --help`)} for available commands.`);
      process.exitCode = 127;
      return;
    }

    // Resolve subcommand
    let activeCmd = cmd;
    if (parsed.command.length > 1 && cmd.subcommands) {
      const sub = cmd.subcommands.find((s) => s.name === parsed.command[1]);
      if (sub) activeCmd = sub;
    }

    if (!activeCmd.action) {
      this.showCommandHelp(cmdName);
      return;
    }

    // Build context
    const config = loadConfig(parsed.flags.config as string | undefined);
    const ctx: CommandContext = {
      args: parsed.positional,
      flags: parsed.flags,
      config,
      cwd: process.cwd(),
      interactive: config.cli.interactive,
    };

    output.debug(`Command: ${parsed.command.join(" ")}`);
    output.debug(`Flags: ${JSON.stringify(parsed.flags)}`);

    try {
      const result = await activeCmd.action(ctx);
      if (result && !result.success) {
        process.exitCode = result.exitCode ?? 1;
      }
    } catch (err) {
      const { message, code, exitCode } = handleError(err);
      output.error(`[${code}] ${message}`);
      output.debug(`Exit code: ${exitCode}`);
      process.exitCode = exitCode;
    }
  }

  private showHelp(): void {
    const cmds = this.parser.getAllCommands();
    const maxLen = Math.max(...cmds.map((c) => c.name.length));

    console.log(`
${color.bold(this.name)} v${this.version} — AI agent CLI with Rust-powered vector intelligence

${color.bold("Usage:")} ${this.name} <command> [options]

${color.bold("Commands:")}
${cmds.map((c) => `  ${color.cyan(c.name.padEnd(maxLen + 2))}${c.description}`).join("\n")}

${color.bold("Flags:")}
  ${color.dim("-h, --help")}      Show help
  ${color.dim("-V, --version")}   Show version
  ${color.dim("-v, --verbose")}   Verbose output
  ${color.dim("-q, --quiet")}     Quiet output
  ${color.dim("--no-color")}      Disable colors
  ${color.dim("--config")}        Path to config file
  ${color.dim("--format")}        Output format (text, json, table)
`);
  }

  private showCommandHelp(name: string): void {
    const cmd = this.parser.getCommand(name);
    if (!cmd) return;

    console.log(`\n${color.bold(this.name + " " + cmd.name)} — ${cmd.description}`);

    if (cmd.subcommands?.length) {
      console.log(`\n${color.bold("Subcommands:")}`);
      for (const sub of cmd.subcommands) {
        console.log(`  ${color.cyan(sub.name.padEnd(14))}${sub.description}`);
      }
    }

    if (cmd.options?.length) {
      console.log(`\n${color.bold("Options:")}`);
      for (const opt of cmd.options) {
        const flag = opt.short ? `-${opt.short}, --${opt.name}` : `    --${opt.name}`;
        console.log(`  ${color.dim(flag.padEnd(20))}${opt.description}`);
      }
    }

    if (cmd.examples?.length) {
      console.log(`\n${color.bold("Examples:")}`);
      for (const ex of cmd.examples) {
        console.log(`  ${color.dim("$")} ${ex.command}`);
        console.log(`  ${color.gray(ex.description)}\n`);
      }
    }

    console.log();
  }

  private registerCommands(): void {
    for (const cmd of commands) {
      this.parser.registerCommand(cmd);
    }
  }
}
