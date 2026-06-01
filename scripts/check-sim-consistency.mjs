import { spawnSync } from "node:child_process";

const baseArgs = [
  "--mode=trueMartial", "--strategy=styleAware", "--runs=200", "--seeds=2",
  "--seedBase=2026052700", "--json"
];

function runSim() {
  const result = spawnSync("node", ["scripts/sim-ai.mjs", ...baseArgs], {
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error("sim-ai failed:", result.stderr || result.stdout);
    process.exit(1);
  }
  return result.stdout;
}

console.log("Run 1...");
const run1 = runSim();
console.log("Run 2...");
const run2 = runSim();

if (run1 === run2) {
  console.log("✅ sim-ai consistency check passed — exact deterministic match");
  process.exit(0);
} else {
  console.error("❌ sim-ai consistency check FAILED — JSON output differs");
  // Show first differing character position
  for (let i = 0; i < Math.min(run1.length, run2.length); i++) {
    if (run1[i] !== run2[i]) {
      console.error(`First diff at char ${i}: '${run1[i]}' vs '${run2[i]}'`);
      console.error(`Context: ...${run1.slice(Math.max(0,i-20), i+20)}...`);
      break;
    }
  }
  if (run1.length !== run2.length) {
    console.error(`Length differs: ${run1.length} vs ${run2.length}`);
  }
  process.exit(1);
}
