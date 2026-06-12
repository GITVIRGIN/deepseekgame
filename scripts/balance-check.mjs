// V3.13A: Enhanced balance gate — per-style reporting + Markdown + JSON
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "fs";

function parseArgs(argv) {
  const p = {};
  for (const a of argv) {
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const k = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      const v = eq >= 0 ? a.slice(eq + 1) : "true";
      p[k] = v;
    }
  }
  return p;
}

const args = parseArgs(process.argv.slice(2));
const RUNS = Math.max(1, Number(args.runs ?? 80));
const SEEDS = Math.max(1, Number(args.seeds ?? 1));
const SEED_BASE = Number(args.seedBase ?? 2026052700);
const REPORT_OUT = args.reportOut || null;
const JSON_OUT = args.jsonOut || null;

function runSim(mode) {
  const result = spawnSync("node", [
    "scripts/sim-ai.mjs",
    `--mode=${mode}`,
    "--strategy=styleAware",
    `--runs=${RUNS}`,
    `--seeds=${SEEDS}`,
    `--seedBase=${SEED_BASE}`,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
  });
  if (result.error || result.status !== 0) {
    console.error(`sim-ai FAILED for ${mode}: status=${result.status}, error=${result.error?.message || "none"}`);
    if (result.stderr) console.error(result.stderr);
    process.exit(1);
  }
  return result.stdout;
}

function parseOutput(text, mode) {
  const lines = text.split("\n");
  const results = [];
  const timeoutMap = {};

  const styleNames = { physical: "物理", spell: "法术", bleed: "流血", shell: "龟壳", poison: "中毒", control: "控制" };
  const nameToKey = Object.fromEntries(Object.entries(styleNames).map(([k, v]) => [v, k]));
  let inTimeout = false;

  // Collect timeout info per style
  for (const line of lines) {
    if (line.includes("timeouts detected")) { inTimeout = true; continue; }
    if (inTimeout && line.trim() === "") { inTimeout = false; continue; }
    if (inTimeout && line.trim().startsWith("流派")) { inTimeout = false; continue; }
    if (inTimeout) {
      const m = line.trim().match(/^(\S+):\s+(\d+)\s+timeouts/);
      if (m) timeoutMap[nameToKey[m[1]] ?? m[1]] = Number(m[2]);
    }
  }

  // Parse the table

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("═") || trimmed.startsWith("流派") || trimmed.startsWith("===") || trimmed.startsWith("⚠")) continue;
    // Match style-name lines: "物理     21.3%  14.1  26  6.5  3.0  早0中1晚78"
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && nameToKey[parts[0]]) {
      const style = nameToKey[parts[0]];
      const wrStr = parts[1].replace("%", "");
      const winRate = parseFloat(wrStr);
      const avgFloor = parts.length >= 3 ? parseFloat(parts[2]) : null;
      const tmt = timeoutMap[style] ?? 0;
      const effectiveRuns = tmt != null ? RUNS - tmt : RUNS;
      results.push({ style, styleName: parts[0], winRate: Number.isNaN(winRate) ? null : winRate, avgFloor: Number.isNaN(avgFloor) ? null : avgFloor, timeouts: tmt, effectiveRuns, mode });
    }
  }
  return { results, timeoutMap };
}

const modes = ["normal", "regular", "trueMartial"];
const targets = {
  normal: { min: 15, max: 30, warnMax: 32, label: "入门" },
  regular: { min: 5, max: 10, warnMax: 12, label: "常规" },
  trueMartial: { min: 0, max: 2, label: "真武" },
};

let hasFail = false;
let hasWarn = false;
const allResults = [];
const rawOutputs = {};

for (const mode of modes) {
  console.log(`\n${targets[mode].label} / ${mode}:`);
  const output = runSim(mode);
  rawOutputs[mode] = output;
  const { results } = parseOutput(output, mode);

  for (const r of results) {
    const t = targets[mode];
    const warnMax = t.warnMax ?? t.max;
    let status;
    if (mode === "trueMartial") {
      status = r.winRate != null && r.winRate <= t.max ? "PASS" : "FAIL";
    } else {
      if (r.winRate != null && r.winRate >= t.min && r.winRate <= t.max) status = "PASS";
      else if (r.winRate != null && r.winRate >= t.min && r.winRate <= warnMax) status = "WARN";
      else status = "FAIL";
    }
    if (status === "FAIL") hasFail = true;
    if (status === "WARN") hasWarn = true;
    r.status = status;
    allResults.push(r);

    const mark = status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : "❌";
    const wr = r.winRate != null ? r.winRate.toFixed(1) + "%" : "N/A";
    const fl = r.avgFloor != null ? r.avgFloor.toFixed(1) : "?";
    console.log(`  ${mark} ${r.styleName} ${wr} avgFloor=${fl} timeout=${r.timeouts} (target: ${t.min}%-${t.max}%) ${status}`);
  }
}

// Console summary
console.log(hasFail ? "\n❌ Some targets failed — review above." : "\n🎉 No hard FAIL targets.");

// Generate reports if requested
if (REPORT_OUT || JSON_OUT) {
  // Markdown
  if (REPORT_OUT) {
    let md = "# Balance Gate Report\n\n";
    md += `**Config**: runs=${RUNS}, seeds=${SEEDS}, seedBase=${SEED_BASE}\n\n`;

    md += "## 1. Gate Summary\n\n";
    md += `- **Gate result**: ${hasFail ? "❌ FAIL" : "✅ PASS"}\n`;
    md += `- Hard FAIL present: ${hasFail ? "yes" : "no"}\n`;
    md += `- WARN present: ${hasWarn ? "yes" : "no"}\n`;
    md += `- ${hasFail ? "Recommend: review failing styles before releasing." : "All targets within acceptable range."}\n\n`;

    md += "## 2. Target Policy\n\n";
    md += "| Mode | Target | WARN Max |\n";
    md += "|------|--------|----------|\n";
    for (const m of modes) {
      const t = targets[m];
      md += `| ${t.label} / ${m} | ${t.min}%-${t.max}% | ${t.warnMax ?? t.max}% |\n`;
    }

    md += "\n## 3. Results by Mode\n\n";
    for (const mode of modes) {
      md += `### ${targets[mode].label} / ${mode}\n\n`;
      md += "| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |\n";
      md += "|-------|---------|----------|----------|---------|--------|--------|\n";
      for (const r of allResults.filter(x => x.mode === mode)) {
        const wr = r.winRate != null ? r.winRate.toFixed(1) + "%" : "N/A";
        const fl = r.avgFloor != null ? r.avgFloor.toFixed(1) : "?";
        const t = targets[mode];
        md += `| ${r.styleName} | ${wr} | ${fl} | ${r.timeouts} | ${r.effectiveRuns} | ${t.min}%-${t.max}% | ${r.status} |\n`;
      }
      md += "\n";
    }

    md += "## 4. Hard FAIL Details\n\n";
    const fails = allResults.filter(r => r.status === "FAIL");
    if (fails.length === 0) {
      md += "No hard FAILs.\n\n";
    } else {
      for (const r of fails) {
        const t = targets[r.mode];
        const wr = r.winRate != null ? r.winRate.toFixed(1) + "%" : "N/A";
        const direction = r.winRate != null && r.winRate < t.min ? "偏低" : "偏高";
        md += `- **${targets[r.mode].label} / ${r.styleName}**: ${wr} (target ${t.min}%-${t.max}%) — ${direction}\n`;
      }
      md += "\n";
    }

    md += "## 5. Timeout Notes\n\n";
    const timeoutResults = allResults.filter(r => r.timeouts > 0);
    if (timeoutResults.length === 0) md += "No timeouts.\n\n";
    else for (const r of timeoutResults) md += `- ${targets[r.mode].label} / ${r.styleName}: ${r.timeouts} timeouts\n`;
    md += "\n";

    md += "## 6. Recommendation\n\n";
    if (!hasFail) {
      md += "All targets met. No immediate tuning needed.\n";
    } else {
      const lowFails = fails.filter(r => r.winRate != null && r.winRate < targets[r.mode].min);
      if (lowFails.length > fails.length * 0.5) {
        md += "Majority of FAILs are due to low win rate. Consider targeted enemy/base-card buffs for affected styles.\n";
      } else {
        md += "FAILs distributed across modes. Review individual style performance before tuning.\n";
      }
      md += "Do not rush to adjust: confirm results with larger sample before committing changes.\n";
    }

    mkdirSync("_ai_review", { recursive: true });
    writeFileSync(REPORT_OUT, md);
    console.log(`\nWrote ${REPORT_OUT}`);
  }

  // JSON
  if (JSON_OUT) {
    const json = {
      pass: !hasFail,
      hasFail,
      hasWarn,
      runs: RUNS,
      seeds: SEEDS,
      seedBase: SEED_BASE,
      targets: {
        normal: { min: targets.normal.min, max: targets.normal.max, warnMax: targets.normal.warnMax || targets.normal.max },
        regular: { min: targets.regular.min, max: targets.regular.max, warnMax: targets.regular.warnMax || targets.regular.max },
        trueMartial: { min: targets.trueMartial.min, max: targets.trueMartial.max },
      },
      results: allResults.map(r => ({
        mode: r.mode,
        label: targets[r.mode].label,
        style: r.style,
        styleName: r.styleName,
        winRate: r.winRate,
        avgFloor: r.avgFloor,
        timeouts: r.timeouts,
        effectiveRuns: r.effectiveRuns,
        target: `${targets[r.mode].min}-${targets[r.mode].max}%`,
        status: r.status,
      })),
    };
    writeFileSync(JSON_OUT, JSON.stringify(json, null, 2));
    console.log(`Wrote ${JSON_OUT}`);
  }
}

process.exit(hasFail ? 1 : 0);
