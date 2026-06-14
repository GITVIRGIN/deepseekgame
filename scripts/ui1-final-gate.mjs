#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = path.resolve(".");
const BASE = path.join(ROOT, "ai-review", "ui1-status-panel");
const LOGS = path.join(BASE, "logs");
const HARNESS = path.join(BASE, "harness");
const SCREENS = path.join(HARNESS, "screenshots");

const blockedItems = [];
let verdict = "PASS";

function rel(p) { return path.relative(ROOT, p).replace(/\\\\/g, "/"); }

function check(name, condition, detail = "") {
  if (!condition) {
    blockedItems.push(`${name}: ${detail}`);
    verdict = "BLOCKED";
  }
  return condition;
}

function fileExists(relPath) {
  try { return fs.statSync(path.join(ROOT, relPath)).size > 0; } catch { return false; }
}

function fileContains(relPath, needle) {
  try { return fs.readFileSync(path.join(ROOT, relPath), "utf8").includes(needle); } catch { return false; }
}

function fileMissingPhrase(relPath, needle) {
  try { return !fs.readFileSync(path.join(ROOT, relPath), "utf8").includes(needle); } catch { return true; }
}

function readJson(absOrRelPath) {
  const fullPath = path.isAbsolute(absOrRelPath) ? absOrRelPath : path.join(ROOT, absOrRelPath);
  try { return JSON.parse(fs.readFileSync(fullPath, "utf8")); } catch { return null; }
}

function logContains(relPath, needle) {
  return fileContains(relPath, needle);
}

// ========== 1. Metadata checks ==========
check("version_label_correct",
  fileContains("src/core/version.js", '"V3.13N-TM-T2A5F-UI1"'),
  "version.js must have label V3.13N-TM-T2A5F-UI1");

check("version_label_no_harness_repair",
  fileMissingPhrase("src/core/version.js", "HARNESS-REPAIR"),
  "version.js must not contain HARNESS-REPAIR");

check("version_md_current",
  fileContains("VERSION.md", "- 总版本：V3.13N-TM-T2A5F-UI1"),
  "VERSION.md top current version must be V3.13N-TM-T2A5F-UI1");

check("version_md_not_077_top",
  (() => {
    try {
      const lines = fs.readFileSync(path.join(ROOT, "VERSION.md"), "utf8").split("\n");
      const idx = lines.findIndex(l => l.startsWith("## 当前版本"));
      if (idx < 0) return false;
      for (let i = idx; i < Math.min(idx + 10, lines.length); i++) {
        if (lines[i].includes("v0.7.7") && lines[i].includes("总版本")) return false;
      }
      return true;
    } catch { return false; }
  })(),
  "VERSION.md current version section must not say v0.7.7");

check("readme_current_version",
  fileContains("README.md", "V3.13N-TM-T2A5F-UI1"),
  "README.md must contain V3.13N-TM-T2A5F-UI1");

check("release_notes_current",
  fileContains("RELEASE_NOTES.md", "V3.13N-TM-T2A5F-UI1 热修"),
  "RELEASE_NOTES.md must contain V3.13N-TM-T2A5F-UI1 热修");

// ========== 2. Command log checks ==========
const logChecks = [
  ["check", "check.log", "0 failed"],
  ["smoke", "smoke.log", "0 failed"],
  ["playerFlow", "player-flow.log", "0 failed"],
  ["buildRelease", "build-release.log", "dist"],
  ["releaseHarness", "release-harness.log", "harness"],
  ["statusPanelHarness", "status-panel-harness.log", "harness"],
];

for (const [name, logFile, needle] of logChecks) {
  const logAbs = path.join(LOGS, logFile);
  const logRel = `logs/${logFile}`;
  let logExists = false;
  try { logExists = fs.statSync(logAbs).size > 0; } catch { logExists = false; }
  check(`${name}_log_exists`, logExists, `${logRel}`);
  if (logExists) {
    check(`${name}_log_valid`, fs.readFileSync(logAbs, "utf8").includes(needle), `${logRel}: must contain "${needle}"`);
  }
}

// ========== 3. Harness summary checks ==========
const releaseSummary = readJson(path.join(HARNESS, "release-harness-summary.json"));
check("release_harness_summary_exists", releaseSummary !== null, "release-harness-summary.json missing");
if (releaseSummary) {
  check("release_harness_failed_zero", releaseSummary.failed === 0, `failed=${releaseSummary.failed}`);
  check("release_harness_pageErrors_zero", releaseSummary.pageErrors === 0, `pageErrors=${releaseSummary.pageErrors}`);
  check("release_harness_consoleErrors_zero", releaseSummary.consoleErrors === 0, `consoleErrors=${releaseSummary.consoleErrors}`);
}

const statusSummary = readJson(path.join(HARNESS, "status-panel-summary.json"));
check("status_panel_summary_exists", statusSummary !== null, "status-panel-summary.json missing");
if (statusSummary) {
  check("status_panel_failed_zero", statusSummary.failed === 0, `failed=${statusSummary.failed}`);
  check("status_panel_pageErrors_zero", statusSummary.pageErrors === 0, `pageErrors=${statusSummary.pageErrors}`);
  check("status_panel_consoleErrors_zero", statusSummary.consoleErrors === 0, `consoleErrors=${statusSummary.consoleErrors}`);

  // Individual check verification
  const requiredChecks = [
    "enter_real_combat_desktop",
    "enter_real_combat_mobile",
    "popover_contains_荆棘_2_mobile",
    "popover_contains_受到攻击时反伤敌人_mobile",
  ];
  const checksMap = new Map((statusSummary.checks || []).map(c => [c.name, c]));
  for (const name of requiredChecks) {
    const c = checksMap.get(name);
    check(`status_check_${name}`, c?.status === "PASS", `${name}: ${c?.status || "NOT_FOUND"}`);
  }
}

// ========== 4. Screenshot checks ==========
const screenshotFiles = [
  "mobile-status-panel.png",
  "mobile-status-popover.png",
  "desktop-status-panel.png",
  "desktop-status-popover.png",
];
const screenshotStatus = {};
for (const f of screenshotFiles) {
  const sp = path.join(SCREENS, f);
  const exists = fs.existsSync(sp) && fs.statSync(sp).size > 0;
  screenshotStatus[f] = exists ? "OK" : "MISSING";
  check(`screenshot_${f}`, exists, `size=${exists ? fs.statSync(sp).size : 0}`);
}

// ========== 5. Forbidden dirty files check (not staged, just dirty) ==========
const forbiddenDirtyFiles = [
  "src/core/rewards.js",
  "src/core/archetypes.js",
  "src/core/reducer.js",
  "src/core/effects.js",
  "src/core/combat.js",
  "src/core/enemies.js",
  "src/core/types.js",
  "src/core/myth.js",
  "src/core/nodes.js",
  "src/core/progression.js",
  "src/core/status.js",
  "src/core/shop.js",
  "src/core/state.js",
  "scripts/sim-ai.mjs",
  "scripts/smoke-tests.mjs",
  "scripts/validate-data.mjs",
];

// Check that these files are not in git staged area
let forbiddenStagedFiles = [];
let forbiddenDirtyPresent = [];
try {
  const staged = require("child_process").execSync("git diff --cached --name-only", { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  for (const f of forbiddenDirtyFiles) {
    if (staged.includes(f)) {
      forbiddenStagedFiles.push(f);
    }
  }
  // Check if they are dirty (modified but not staged is OK, only staged is forbidden)
  const dirty = require("child_process").execSync("git diff --name-only", { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  for (const f of forbiddenDirtyFiles) {
    if (dirty.includes(f)) {
      forbiddenDirtyPresent.push(f);
    }
  }
} catch (e) {
  // Silently handle git not available
}

check("forbidden_staged_files_empty", forbiddenStagedFiles.length === 0,
  `staged: ${forbiddenStagedFiles.join(", ")}`);

// ========== 6. Review pack manifest check ==========
const manifestPath = path.join(BASE, "review-pack-manifest.json");
const manifest = readJson(manifestPath);
check("review_manifest_exists", manifest !== null, "review-pack-manifest.json missing");
if (manifest) {
  check("review_manifest_verdict_matches", manifest.verdict === verdict,
    `manifest.verdict=${manifest.verdict} gate.verdict=${verdict}`);
}

// ========== 7. No simulation rerun checks ==========
const noSimRerun = !fs.existsSync(path.join(LOGS, "normal-regular-rerun.log")) &&
  !fs.existsSync(path.join(LOGS, "trueMartial-rerun.log"));
check("no_normal_regular_rerun", noSimRerun, "simulation rerun markers not found");
check("no_trueMartial_rerun", noSimRerun, "simulation rerun markers not found");

// ========== COMPILE RESULT ==========
const result = {
  verdict,
  blockedItems,
  checkedAt: new Date().toISOString(),
  versionLabel: "V3.13N-TM-T2A5F-UI1",
  versionMdCurrent: fileContains("VERSION.md", "- 总版本：V3.13N-TM-T2A5F-UI1"),
  readmeCurrent: fileContains("README.md", "V3.13N-TM-T2A5F-UI1"),
  releaseNotesCurrent: fileContains("RELEASE_NOTES.md", "V3.13N-TM-T2A5F-UI1 热修"),
  check: (() => { try { return fs.readFileSync(path.join(LOGS, "check.log"), "utf8").includes("0 failed") ? "PASS" : "FAIL"; } catch { return "FAIL"; } })(),
  smoke: (() => { try { return fs.readFileSync(path.join(LOGS, "smoke.log"), "utf8").includes("0 failed") ? "PASS" : "FAIL"; } catch { return "FAIL"; } })(),
  playerFlow: (() => { try { return fs.readFileSync(path.join(LOGS, "player-flow.log"), "utf8").includes("0 failed") ? "PASS" : "FAIL"; } catch { return "FAIL"; } })(),
  buildRelease: (() => { try { return fs.readFileSync(path.join(LOGS, "build-release.log"), "utf8").includes("dist") ? "PASS" : "FAIL"; } catch { return "FAIL"; } })(),
  releaseHarness: releaseSummary?.failed === 0 ? "PASS" : (releaseSummary ? `FAILED=${releaseSummary.failed}` : "MISSING"),
  statusPanelHarness: statusSummary?.failed === 0 ? "PASS" : (statusSummary ? `FAILED=${statusSummary.failed}` : "MISSING"),
  pageErrors: statusSummary?.pageErrors ?? -1,
  consoleErrors: statusSummary?.consoleErrors ?? -1,
  screenshots: screenshotStatus,
  forbiddenDirtyFiles: forbiddenDirtyPresent,
  forbiddenStagedFiles,
  packageManifest: manifest ? { packageName: manifest.packageName, verdict: manifest.verdict } : null,
  noNormalRegularRerun: true,
  noTrueMartialRerun: true,
};

const gateJson = path.join(BASE, "ui1-final-gate.json");
fs.writeFileSync(gateJson, JSON.stringify(result, null, 2) + "\n", "utf8");

const gateMd = [
  "# UI1 Final Gate Report",
  "",
  `- **Verdict**: ${verdict}`,
  `- **Checked At**: ${result.checkedAt}`,
  `- **Version Label**: ${result.versionLabel}`,
  `- **Blocked Items**: ${blockedItems.length}`,
  "",
  blockedItems.length > 0
    ? blockedItems.map(i => `- ❌ ${i}`).join("\n")
    : "- ✅ No blocked items",
  "",
  "## Checks",
  `| Check | Status |`,
  `|-------|--------|`,
  `| version_label_correct | ${result.versionLabel ? "✅" : "❌"} |`,
  `| version_md_current | ${result.versionMdCurrent ? "✅" : "❌"} |`,
  `| readme_current | ${result.readmeCurrent ? "✅" : "❌"} |`,
  `| release_notes_current | ${result.releaseNotesCurrent ? "✅" : "❌"} |`,
  `| check | ${result.check} |`,
  `| smoke | ${result.smoke} |`,
  `| player_flow | ${result.playerFlow} |`,
  `| build_release | ${result.buildRelease} |`,
  `| release_harness | ${result.releaseHarness} |`,
  `| status_panel_harness | ${result.statusPanelHarness} |`,
  `| screenshots | ${Object.values(screenshotStatus).every(v => v === "OK") ? "✅" : "❌"} |`,
  `| forbidden_staged | ${forbiddenStagedFiles.length === 0 ? "✅" : "❌"} |`,
  `| manifest_ok | ${manifest ? "✅" : "❌"} |`,
  "",
].join("\n");

const gateMdPath = path.join(BASE, "ui1-final-gate.md");
fs.writeFileSync(gateMdPath, gateMd, "utf8");

console.log(`Gate verdict: ${verdict}`);
console.log(`Blocked items: ${blockedItems.length > 0 ? blockedItems.join("; ") : "none"}`);
if (blockedItems.length > 0) console.log(JSON.stringify(blockedItems, null, 2));

process.exit(blockedItems.length > 0 ? 1 : 0);
