#!/usr/bin/env node
// V3.5.1: True Martial Diagnosis — wrapper around sim-ai styleAware
import { execFileSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";

// CLI args
function parseArgs(argv) {
  const p = {};
  for (const a of argv) {
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      p[eq >= 0 ? a.slice(2, eq) : a.slice(2)] = eq >= 0 ? a.slice(eq + 1) : "true";
    }
  }
  return p;
}

const args = parseArgs(process.argv.slice(2));
const RUNS = Number(args.runs ?? 80);
const SEEDS = Number(args.seeds ?? 1);
const SEED_BASE = Number(args.seedBase ?? 2026052700);

const cmdBase = [
  "scripts/sim-ai.mjs",
  "--mode=trueMartial",
  "--strategy=styleAware",
  `--runs=${RUNS}`,
  `--seeds=${SEEDS}`,
  `--seedBase=${SEED_BASE}`,
];

// 1. Get JSON data
let jsonOutput;
try {
  jsonOutput = execFileSync("node", [...cmdBase, "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  console.error("sim-ai --json failed:\n", e.stderr || e.stdout || e.message);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(jsonOutput);
} catch {
  console.error("JSON parse failed. First 1000 chars:\n", jsonOutput.slice(0, 1000));
  process.exit(1);
}

// Filter to trueMartial only
const tmResults = data.filter(r => r.mode === "trueMartial");
if (tmResults.length === 0) {
  console.error("No trueMartial results in sim-ai output.");
  process.exit(1);
}

// 2. Get human-readable output for timeout notes
let textOutput;
try {
  textOutput = execFileSync("node", cmdBase, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  textOutput = "(sim-ai text output failed: " + (e.stderr || e.message) + ")";
}

// Extract timeout lines from text output
const timeoutLines = textOutput.split("\n").filter(l => l.includes("timeouts detected") || l.includes("timeouts ("));

// Build markdown
let md = "# True Martial Diagnosis\n\n";
md += `**Source of truth**: \`scripts/sim-ai.mjs --mode=trueMartial --strategy=styleAware --runs=${RUNS} --seeds=${SEEDS} --seedBase=${SEED_BASE}\`\n\n`;
md += "> This report does **not** maintain a second combat AI.\n";
md += "> Complex metrics (ascension relic acquisition, blood sacrifice mortality, formation exposure) are **not** available from sim-ai output and are omitted to avoid misleading tuning decisions.\n";
md += "> If those metrics are needed, extend sim-ai JSON output rather than duplicating AI logic.\n\n";

md += "## Summary\n\n";
md += "| Style | WinRate | AvgFloor | Early(1-6) | Mid(7-12) | Late(13-18) | AvgDeck | AvgRelics | AvgEnergy |\n";
md += "|-------|---------|----------|------------|-----------|-------------|---------|-----------|----------|\n";

for (const r of tmResults) {
  const wr = (r.winRate * 100).toFixed(1) + "%";
  const avgFloor = r.avgFloor.toFixed(1);
  const deck = r.avgDeckSize.toFixed(0);
  const relics = r.avgRelics.toFixed(1);
  const energy = r.avgEnergy.toFixed(1);
  const d = r.deathFloorDistribution || {};
  md += `| ${r.profile} | ${wr} | ${avgFloor} | ${d.early ?? "-"} | ${d.mid ?? "-"} | ${d.late ?? "-"} | ${deck} | ${relics} | ${energy} |\n`;
}

md += "\n## Timeout Notes\n\n";
if (timeoutLines.length > 0) {
  md += "```\n" + timeoutLines.join("\n") + "\n```\n";
} else {
  md += "No timeout lines detected.\n";
}

md += "\n## Recommendations\n\n";
const avgWR = tmResults.reduce((s, r) => s + r.winRate, 0) / tmResults.length;
const avgFloor = tmResults.reduce((s, r) => s + r.avgFloor, 0) / tmResults.length;

if (avgFloor < 10) {
  md += "- **Average death floor is <10**: consider reducing early-game (1-10) enemy pressure or formation intensity for trueMartial.\n";
}
if (avgWR < 0.01) {
  md += "- **Win rate near 0%**: trueMartial is currently impossible for the AI. For real players, even reaching floor 15 would be significant. Consider targeted enemy/fomation reductions.\n";
}
if (timeoutLines.length > 10) {
  md += "- **High timeout count**: some combat scenarios are running 5000+ steps. Consider investigating combat stalemate patterns.\n";
}

console.log(`\n=== True Martial Diagnosis ===`);
console.log(`Source: sim-ai --mode=trueMartial --strategy=styleAware --runs=${RUNS} --seeds=${SEEDS}`);
for (const r of tmResults) {
  console.log(`${r.profile.padEnd(8)} WR=${(r.winRate*100).toFixed(1)}%  avgFloor=${r.avgFloor.toFixed(1)}  deck=${r.avgDeckSize.toFixed(0)}  relics=${r.avgRelics.toFixed(1)}`);
}

mkdirSync("_ai_review", { recursive: true });
writeFileSync("_ai_review/TRUE_MARTIAL_DIAGNOSIS.md", md);
console.log(`\nWrote _ai_review/TRUE_MARTIAL_DIAGNOSIS.md`);
