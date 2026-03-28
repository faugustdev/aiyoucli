/**
 * Command parser — argv to structured ParseResult.
 */

import type { Command, ParseResult, ParsedFlags } from "./types.js";

export class CommandParser {
  private commands = new Map<string, Command>();

  registerCommand(cmd: Command): void {
    this.commands.set(cmd.name, cmd);
    for (const alias of cmd.aliases ?? []) {
      this.commands.set(alias, cmd);
    }
  }

  getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  getAllCommands(): Command[] {
    const seen = new Set<string>();
    const result: Command[] = [];
    for (const [, cmd] of this.commands) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        result.push(cmd);
      }
    }
    return result.filter((c) => !c.hidden);
  }

  parse(argv: string[]): ParseResult {
    const command: string[] = [];
    const flags: ParsedFlags = { _: [] };
    const positional: string[] = [];
    let i = 0;

    // Extract command path (non-flag tokens at the start)
    while (i < argv.length && !argv[i].startsWith("-")) {
      const token = argv[i];
      const matched = this.commands.has(
        command.length === 0 ? token : `${command.join(":")}.${token}`
      ) || this.commands.has(token);

      if (command.length === 0 && matched) {
        command.push(token);
        i++;
        // Check for subcommand
        if (i < argv.length && !argv[i].startsWith("-")) {
          const parentCmd = this.commands.get(token);
          if (parentCmd?.subcommands?.some((s) => s.name === argv[i])) {
            command.push(argv[i]);
            i++;
          }
        }
        break;
      } else if (command.length === 0) {
        // Not a known command — still put it in command path for suggest
        command.push(token);
        i++;
        break;
      }
      i++;
    }

    // Parse remaining as flags and positional args
    while (i < argv.length) {
      const arg = argv[i];

      if (arg === "--") {
        // Everything after -- is positional
        positional.push(...argv.slice(i + 1));
        break;
      }

      if (arg.startsWith("--")) {
        const [key, ...valueParts] = arg.slice(2).split("=");
        const flagName = camelCase(key);

        if (valueParts.length > 0) {
          flags[flagName] = valueParts.join("=");
        } else if (key.startsWith("no-")) {
          flags[camelCase(key.slice(3))] = false;
        } else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
          // Peek: if next arg looks like a value, consume it
          const next = argv[i + 1];
          if (looksLikeValue(next)) {
            flags[flagName] = coerce(next);
            i++;
          } else {
            flags[flagName] = true;
          }
        } else {
          flags[flagName] = true;
        }
      } else if (arg.startsWith("-") && arg.length > 1) {
        // Short flags: -v, -vv, -k 5
        const chars = arg.slice(1);
        if (chars.length === 1) {
          const flagName = chars;
          if (i + 1 < argv.length && looksLikeValue(argv[i + 1])) {
            flags[flagName] = coerce(argv[i + 1]);
            i++;
          } else {
            flags[flagName] = true;
          }
        } else {
          // Multiple short flags: -abc → a=true, b=true, c=true
          for (const c of chars) {
            flags[c] = true;
          }
        }
      } else {
        positional.push(arg);
      }

      i++;
    }

    flags._ = positional;
    return { command, flags, positional, raw: argv };
  }
}

function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function looksLikeValue(s: string): boolean {
  if (s.startsWith("-")) return false;
  return true;
}

function coerce(s: string): string | number | boolean {
  if (s === "true") return true;
  if (s === "false") return false;
  const n = Number(s);
  if (!Number.isNaN(n) && s.trim() !== "") return n;
  return s;
}
