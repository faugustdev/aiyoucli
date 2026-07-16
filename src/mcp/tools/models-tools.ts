/**
 * Models tools — unified dispatch by action.
 * Consolidates: list, optimize, start, stop, status, list_remote.
 */

import type { MCPTool, MCPToolResult } from "../../types.js";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function text(t: string): MCPToolResult { return { content: [{ type: "text", text: t }] }; }
function json(d: unknown): MCPToolResult { return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] }; }

const UNSLOTH_UPGRADES: Record<string, { repo: string; note: string }> = {
  "llama-3.1-8b": { repo: "unsloth/llama-3.1-8b-Instruct-bnb-4bit", note: "Dynamic v2.0 — 4-bit quantized, faster inference" },
  "llama-3.1-70b": { repo: "unsloth/llama-3.1-70b-Instruct-bnb-4bit", note: "Dynamic v2.0 — 4-bit quantized" },
  "codellama-7b": { repo: "unsloth/codellama-7b-Instruct-bnb-4bit", note: "Dynamic v2.0 — code-specialized" },
  "codellama-13b": { repo: "unsloth/codellama-13b-Instruct-bnb-4bit", note: "Dynamic v2.0 — code-specialized" },
  "mistral-7b": { repo: "unsloth/mistral-7b-Instruct-v0.3-bnb-4bit", note: "Dynamic v2.0" },
  "qwen2.5-7b": { repo: "unsloth/Qwen2.5-7B-Instruct-bnb-4bit", note: "Dynamic v2.0" },
  "qwen2.5-coder-7b": { repo: "unsloth/Qwen2.5-Coder-7B-Instruct-bnb-4bit", note: "Dynamic v2.0 — code-specialized" },
};

function detectQuantization(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("q4_k_m")) return "Q4_K_M";
  if (lower.includes("q4_k_s")) return "Q4_K_S";
  if (lower.includes("q5_k_m")) return "Q5_K_M";
  if (lower.includes("q5_k_s")) return "Q5_K_S";
  if (lower.includes("q6_k")) return "Q6_K";
  if (lower.includes("q8_0")) return "Q8_0";
  if (lower.includes("q2_k")) return "Q2_K";
  if (lower.includes("q3_k_s")) return "Q3_K_S";
  if (lower.includes("q3_k_m")) return "Q3_K_M";
  if (lower.includes("q3_k_l")) return "Q3_K_L";
  if (lower.includes("iq4_xxs")) return "IQ4_XXS";
  if (lower.includes("iq4_xs")) return "IQ4_XS";
  if (lower.includes("iq3_xxs")) return "IQ3_XXS";
  if (lower.includes("iq3_xs")) return "IQ3_XS";
  if (lower.includes("iq3_s")) return "IQ3_S";
  if (lower.includes("iq3_m")) return "IQ3_M";
  if (lower.includes("iq2_xxs")) return "IQ2_XXS";
  if (lower.includes("iq2_xs")) return "IQ2_XS";
  if (lower.includes("iq2_s")) return "IQ2_S";
  if (lower.includes("iq2_m")) return "IQ2_M";
  if (lower.includes("f16")) return "F16";
  if (lower.includes("f32")) return "F32";
  return "unknown";
}

function extractModelName(filename: string): string {
  return filename
    .replace(/\.gguf$/i, "")
    .replace(/[-_]Q[0-9]+[-_].*$/i, "")
    .replace(/[-_]iq[0-9]+[-_].*$/i, "")
    .replace(/[-_]f(16|32)$/i, "")
    .replace(/[-_]gguf$/i, "");
}

function findUnslothUpgrade(modelName: string): { repo: string; note: string } | null {
  const lower = modelName.toLowerCase();
  for (const [key, upgrade] of Object.entries(UNSLOTH_UPGRADES)) {
    if (lower.includes(key)) return upgrade;
  }
  return null;
}

function getProxyEngine(): any {
  try {
    const mod = require("../../napi/proxy.js");
    return mod.getProxyEngine?.() ?? null;
  } catch { return null; }
}

export const modelsTools: MCPTool[] = [
  {
    name: "models",
    description: "Model management. action=list: scan local GGUF. action=optimize: get Unsloth upgrade. action=start: interactive launcher. action=stop: stop all. action=status: show running. action=list_remote: list via proxy.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "optimize", "start", "stop", "status", "list_remote"],
          description: "Model action",
        },
        path: { type: "string", description: "Directory to scan (for action=list, default: .aiyoucli/models/)" },
        model: { type: "string", description: "Model name (for action=optimize)" },
      },
      required: ["action"],
    },
    handler: async (input) => {
      const action = input.action as string;
      switch (action) {
        case "list": {
          const cwd = process.cwd();
          const scanPath = (input.path as string) || join(cwd, ".aiyoucli", "models");
          if (!existsSync(scanPath)) {
            return json({ scanned_path: scanPath, exists: false, message: `Directory not found: ${scanPath}`, models: [], total_models: 0, total_size_gb: 0 });
          }
          const files = readdirSync(scanPath).filter((f) => f.endsWith(".gguf"));
          const models = files.map((file) => {
            const fullPath = join(scanPath, file);
            const sizeBytes = statSync(fullPath).size;
            const sizeGb = sizeBytes / (1024 * 1024 * 1024);
            const modelName = extractModelName(file);
            return {
              file,
              model_name: modelName,
              quantization: detectQuantization(file),
              size_gb: Math.round(sizeGb * 100) / 100,
              size_bytes: sizeBytes,
              unsloth_upgrade: findUnslothUpgrade(modelName),
            };
          });
          const totalSize = models.reduce((s, m) => s + m.size_bytes, 0);
          return json({ scanned_path: scanPath, exists: true, models, total_models: models.length, total_size_gb: Math.round((totalSize / (1024 * 1024 * 1024)) * 100) / 100 });
        }
        case "optimize": {
          if (!input.model) return text("Missing 'model' for action=optimize");
          const model = (input.model as string).toLowerCase();
          const upgrade = findUnslothUpgrade(model);
          if (upgrade) return json({ model, available: true, repo: upgrade.repo, note: upgrade.note, install: `huggingface-cli download ${upgrade.repo}` });
          return json({ model, available: false, message: "No Unsloth Dynamic v2.0 known for this model", known_models: Object.keys(UNSLOTH_UPGRADES) });
        }
        case "start": {
          const { startInteractive } = await import("../../models/manager.js");
          try { return json(await startInteractive()); }
          catch (err) { return text(`Error: ${err instanceof Error ? err.message : String(err)}`); }
        }
        case "stop": {
          const { stopInteractive } = await import("../../models/manager.js");
          try { return json(stopInteractive()); }
          catch (err) { return text(`Error: ${err instanceof Error ? err.message : String(err)}`); }
        }
        case "status": {
          const { showStatus } = await import("../../models/manager.js");
          try { return text(showStatus()); }
          catch (err) { return text(`Error: ${err instanceof Error ? err.message : String(err)}`); }
        }
        case "list_remote": {
          const engine = getProxyEngine();
          if (!engine) return text("Proxy engine not available");
          try { return json(engine.listModels()); }
          catch { return text("Failed to list models"); }
        }
        default:
          return text(`Unknown action: ${action}. Valid: list, optimize, start, stop, status, list_remote`);
      }
    },
  },
];
