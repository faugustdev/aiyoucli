/**
 * Output formatter — colors, tables, spinners, verbosity.
 */

import type { Verbosity } from "./types.js";

const isColorSupported =
  process.env.FORCE_COLOR !== "0" &&
  !process.env.NO_COLOR &&
  (process.stdout.isTTY ?? false);

// ── ANSI codes ──────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";

function c(code: string, text: string): string {
  return isColorSupported ? `${code}${text}${RESET}` : text;
}

// ── Public color helpers ────────────────────────────────────────

export const color = {
  bold: (s: string) => c(BOLD, s),
  dim: (s: string) => c(DIM, s),
  red: (s: string) => c(RED, s),
  green: (s: string) => c(GREEN, s),
  yellow: (s: string) => c(YELLOW, s),
  blue: (s: string) => c(BLUE, s),
  cyan: (s: string) => c(CYAN, s),
  gray: (s: string) => c(GRAY, s),
};

// ── Output class ────────────────────────────────────────────────

export class Output {
  private verbosity: Verbosity = "normal";

  setVerbosity(v: Verbosity): void {
    this.verbosity = v;
  }

  isQuiet(): boolean {
    return this.verbosity === "quiet";
  }
  isVerbose(): boolean {
    return this.verbosity === "verbose" || this.verbosity === "debug";
  }
  isDebug(): boolean {
    return this.verbosity === "debug";
  }

  log(msg: string): void {
    if (!this.isQuiet()) console.log(msg);
  }

  success(msg: string): void {
    this.log(color.green(`OK`) + ` ${msg}`);
  }

  warn(msg: string): void {
    if (!this.isQuiet()) console.error(color.yellow(`WARN`) + ` ${msg}`);
  }

  error(msg: string): void {
    console.error(color.red(`ERR`) + ` ${msg}`);
  }

  debug(msg: string): void {
    if (this.isVerbose()) console.error(color.gray(`DBG ${msg}`));
  }

  info(msg: string): void {
    this.log(color.blue(`INFO`) + ` ${msg}`);
  }

  // ── Table ───────────────────────────────────────────────────

  table(
    headers: string[],
    rows: string[][],
    options: { padding?: number } = {}
  ): void {
    if (this.isQuiet()) return;

    const pad = options.padding ?? 2;
    const widths = headers.map((h, i) => {
      const colValues = [h, ...rows.map((r) => r[i] ?? "")];
      return Math.max(...colValues.map((v) => stripAnsi(v).length));
    });

    const formatRow = (cells: string[]) =>
      cells.map((cell, i) => {
        const w = stripAnsi(cell).length;
        return cell + " ".repeat(Math.max(0, widths[i] - w + pad));
      }).join("");

    console.log(color.bold(formatRow(headers)));
    console.log(color.dim("─".repeat(widths.reduce((a, b) => a + b + pad, 0))));
    for (const row of rows) {
      console.log(formatRow(row));
    }
  }

  // ── Spinner ─────────────────────────────────────────────────

  spinner(text: string): Spinner {
    return new Spinner(text);
  }

  // ── JSON output ─────────────────────────────────────────────

  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }
}

// ── Spinner ──────────────────────────────────────────────────────

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  start(): this {
    if (!process.stderr.isTTY) return this;
    this.timer = setInterval(() => {
      const f = FRAMES[this.frame % FRAMES.length];
      process.stderr.write(`\r${color.cyan(f)} ${this.text}`);
      this.frame++;
    }, 80);
    return this;
  }

  stop(finalText?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (process.stderr.isTTY) {
      process.stderr.write(`\r\x1b[K`); // Clear line
    }
    if (finalText) {
      console.log(finalText);
    }
  }

  succeed(text?: string): void {
    this.stop(color.green("OK") + ` ${text ?? this.text}`);
  }

  fail(text?: string): void {
    this.stop(color.red("FAIL") + ` ${text ?? this.text}`);
  }
}

// ── Util ────────────────────────────────────────────────────────

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export const output = new Output();
