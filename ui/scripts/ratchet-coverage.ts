/**
 * ratchet-coverage.ts
 *
 * Runs `pnpm test:coverage`, reads the resulting json-summary report, and
 * rewrites the coverage thresholds in vitest.config.ts to
 * `floor(actual - margin)` for each metric.
 *
 * Usage:
 *   tsx scripts/ratchet-coverage.ts [--margin <N>]
 *
 * Options:
 *   --margin <N>  Percentage points below actual to set the threshold (default: 4)
 *
 * Run from ui/ directory.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const uiDir = resolve(__dirname, "..");

// Parse --margin argument
const marginArgIdx = process.argv.indexOf("--margin");
const margin =
  marginArgIdx !== -1 ? parseFloat(process.argv[marginArgIdx + 1]) : 4;

if (isNaN(margin) || margin < 0) {
  console.error(`Invalid --margin value: ${process.argv[marginArgIdx + 1]}`);
  process.exit(1);
}

console.log(`Running pnpm test:coverage (margin: ${margin}%)...`);
execFileSync("pnpm", ["test:coverage"], {
  cwd: uiDir,
  stdio: "inherit",
});

interface CoverageMetric {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
}

interface CoverageSummary {
  total: {
    statements: CoverageMetric;
    branches: CoverageMetric;
    functions: CoverageMetric;
    lines: CoverageMetric;
  };
  [key: string]: unknown;
}

const summaryPath = resolve(uiDir, "coverage", "coverage-summary.json");
let summary: CoverageSummary;
try {
  summary = JSON.parse(readFileSync(summaryPath, "utf-8")) as CoverageSummary;
} catch (err) {
  console.error(`Failed to read coverage summary at ${summaryPath}:`, err);
  process.exit(1);
}

const { statements, branches, functions, lines } = summary.total;

const newThresholds = {
  statements: Math.max(0, Math.floor(statements.pct - margin)),
  branches: Math.max(0, Math.floor(branches.pct - margin)),
  functions: Math.max(0, Math.floor(functions.pct - margin)),
  lines: Math.max(0, Math.floor(lines.pct - margin)),
};

console.log("\nActual coverage:");
console.log(`  statements: ${statements.pct.toFixed(2)}%`);
console.log(`  branches:   ${branches.pct.toFixed(2)}%`);
console.log(`  functions:  ${functions.pct.toFixed(2)}%`);
console.log(`  lines:      ${lines.pct.toFixed(2)}%`);

console.log(`\nNew thresholds (actual - ${margin}%, floored):`);
console.log(`  statements: ${newThresholds.statements}`);
console.log(`  branches:   ${newThresholds.branches}`);
console.log(`  functions:  ${newThresholds.functions}`);
console.log(`  lines:      ${newThresholds.lines}`);

const configPath = resolve(uiDir, "vitest.config.ts");
let config = readFileSync(configPath, "utf-8");

function replaceThreshold(source: string, key: string, value: number): string {
  const result = source.replace(
    new RegExp(`(\\b${key}:\\s*)\\d+`),
    `$1${value}`,
  );
  if (result === source) {
    throw new Error(
      `replaceThreshold: pattern for "${key}" did not match — ` +
        `vitest.config.ts may have been reformatted or restructured`,
    );
  }
  return result;
}

config = replaceThreshold(config, "statements", newThresholds.statements);
config = replaceThreshold(config, "branches", newThresholds.branches);
config = replaceThreshold(config, "functions", newThresholds.functions);
config = replaceThreshold(config, "lines", newThresholds.lines);

writeFileSync(configPath, config, "utf-8");
console.log(`\nUpdated thresholds in ${configPath}`);
