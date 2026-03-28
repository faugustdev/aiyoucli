/**
 * Benchmark runner — executes the built-in benchmark suite and prints results.
 */

import { createAiyoucliSuite } from "../src/metrics/builtin-benchmarks.js";
import { formatReport } from "../src/metrics/benchmark.js";

async function main() {
  const suite = createAiyoucliSuite();
  const { report, filepath } = await suite.runAndSave(process.cwd());
  console.log(formatReport(report));
  console.log(`\nSaved to: ${filepath}`);
}

main();
