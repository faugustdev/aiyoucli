/**
 * Tool module aggregator — registers all tool modules.
 */

import { registry } from "../client.js";
import { memoryTools } from "./memory-tools.js";
import { hooksTools } from "./hooks-tools.js";
import { configTools } from "./config-tools.js";
import { systemTools } from "./system-tools.js";
import { analyzeTools } from "./analyze-tools.js";
import { neuralTools } from "./neural-tools.js";
import { gccTools } from "./gcc-tools.js";
import { securityTools } from "./security-tools.js";
import { performanceTools } from "./performance-tools.js";
import { distillerTools } from "./distiller-tools.js";
import { skillsTools } from "./skills-tools.js";
import { proxyTools } from "./proxy-tools.js";
import { astTools } from "./ast-tools.js";
import { discoveryTools } from "./discovery-tools.js";
import { routeTools } from "./route-tools.js";
import { statusTools } from "./status-tools.js";
import { statsTools } from "./stats-tools.js";
import { embedTools } from "./embed-tools.js";
import { graphTools } from "./graph-tools.js";

export function registerAllTools(): void {
  registry.registerAll(memoryTools);
  registry.registerAll(hooksTools);
  registry.registerAll(configTools);
  registry.registerAll(systemTools);
  registry.registerAll(analyzeTools);
  registry.registerAll(neuralTools);
  registry.registerAll(gccTools);
  registry.registerAll(securityTools);
  registry.registerAll(performanceTools);
  registry.registerAll(distillerTools);
  registry.registerAll(skillsTools);
  registry.registerAll(proxyTools);
  registry.registerAll(astTools);
  registry.registerAll(discoveryTools);
  registry.registerAll(routeTools);
  registry.registerAll(statusTools);
  registry.registerAll(statsTools);
  registry.registerAll(embedTools);
  registry.registerAll(graphTools);
}
