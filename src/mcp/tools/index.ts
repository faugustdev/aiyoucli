/**
 * Tool module aggregator — registers all 14 tool modules.
 */

import { registry } from "../client.js";
import { memoryTools } from "./memory-tools.js";
import { agentTools } from "./agent-tools.js";
import { swarmTools } from "./swarm-tools.js";
import { taskTools } from "./task-tools.js";
import { sessionTools } from "./session-tools.js";
import { hooksTools } from "./hooks-tools.js";
import { configTools } from "./config-tools.js";
import { systemTools } from "./system-tools.js";
import { analyzeTools } from "./analyze-tools.js";
import { neuralTools } from "./neural-tools.js";
import { gccTools } from "./gcc-tools.js";
import { securityTools } from "./security-tools.js";
import { performanceTools } from "./performance-tools.js";
import { coordinationTools } from "./coordination-tools.js";
import { statuslineTools } from "./statusline-tools.js";
import { metricsTools } from "./metrics-tools.js";

export function registerAllTools(): void {
  registry.registerAll(memoryTools);
  registry.registerAll(agentTools);
  registry.registerAll(swarmTools);
  registry.registerAll(taskTools);
  registry.registerAll(sessionTools);
  registry.registerAll(hooksTools);
  registry.registerAll(configTools);
  registry.registerAll(systemTools);
  registry.registerAll(analyzeTools);
  registry.registerAll(neuralTools);
  registry.registerAll(gccTools);
  registry.registerAll(securityTools);
  registry.registerAll(performanceTools);
  registry.registerAll(coordinationTools);
  registry.registerAll(statuslineTools);
  registry.registerAll(metricsTools);
}
