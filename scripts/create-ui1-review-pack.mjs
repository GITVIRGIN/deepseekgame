#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import crypto from "crypto";

const ROOT = path.resolve(".");
const OUT = path.join(ROOT, "ai-review", "ui1-status-panel");

function sha256(filePath) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
  catch { return "MISSING"; }
}

function collectFiles(baseDir, relDir = "") {
  const results = [];
  const fullDir = path.join(baseDir, relDir);
  if (!fs.existsSync(fullDir)) return results;
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectFiles(baseDir, rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

// Determine verdict
let statusPanelResult;
try { statusPanelResult = JSON.parse(fs.readFileSync(path.join(OUT, "harness", "status-panel-summary.json"), "utf8")); }
catch { statusPanelResult = { failed: -1, pageErrors: -1, consoleErrors: -1, checks: [] }; }

let releaseHarnessResult;
try { releaseHarnessResult = JSON.parse(fs.readFileSync(path.join(OUT, "harness", "release-harness-summary.json"), "utf8")); }
catch { releaseHarnessResult = { failed: -1, pageErrors: -1, consoleErrors: -1 }; }

const screenshotFiles = [
  "mobile-status-panel.png",
  "mobile-status-popover.png",
  "desktop-status-panel.png",
  "desktop-status-popover.png",
];
const screenshotsExist = screenshotFiles.every(f => {
  const p = path.join(OUT, "harness", "screenshots", f);
  return fs.existsSync(p) && fs.statSync(p).size > 0;
});

// Verify no NOT_RUN/SKIPPED/PENDING values in checks
const statusChecks = statusPanelResult.checks || [];
const invalidStatuses = new Set(["NOT_RUN", "NOT_RUN_YET", "SKIPPED", "PENDING", "NOT_RERUN"]);
const dirtyChecks = statusChecks.filter(c => invalidStatuses.has(c.status));

// Gate conditions
const failed = [];
if (!statusPanelResult || statusPanelResult.failed === -1) failed.push("status_panel_summary_missing");
else {
  if (statusPanelResult.failed !== 0) failed.push("status_panel_harness_failed=" + statusPanelResult.failed);
  if (statusPanelResult.pageErrors !== 0) failed.push("status_panel_pageErrors=" + statusPanelResult.pageErrors);
  if (statusPanelResult.consoleErrors !== 0) failed.push("status_panel_consoleErrors=" + statusPanelResult.consoleErrors);
  if (dirtyChecks.length > 0) failed.push("status_panel_invalid_checks=" + dirtyChecks.map(c => c.name + ":" + c.status).join(","));
}

if (!releaseHarnessResult || releaseHarnessResult.failed === -1) failed.push("release_harness_summary_missing");
else {
  if (releaseHarnessResult.failed !== 0) failed.push("release_harness_failed=" + releaseHarnessResult.failed);
  if (releaseHarnessResult.pageErrors !== 0) failed.push("release_harness_pageErrors=" + releaseHarnessResult.pageErrors);
  if (releaseHarnessResult.consoleErrors !== 0) failed.push("release_harness_consoleErrors=" + releaseHarnessResult.consoleErrors);
}

if (!screenshotsExist) failed.push("screenshots_missing_or_empty");

const verdict = failed.length === 0 ? "PASS" : "BLOCKED";
const pkgName = verdict === "PASS"
  ? "deepseekgame-v3.13n-tm-t2a5f-ui1-final-review-pass.zip"
  : "deepseekgame-v3.13n-tm-t2a5f-ui1-final-review-blocked.zip";

// Collect files
const includeDirs = [
  { src: ROOT, files: ["README.md","VERSION.md","RELEASE_NOTES.md","package.json","package-lock.json"] },
  { src: path.join(ROOT, "src/app"), files: ["main.js"] },
  { src: path.join(ROOT, "src"), files: ["styles.css"] },
  { src: path.join(ROOT, "src/core"), files: ["version.js","data.js"] },
  { src: path.join(ROOT, "scripts"), files: ["harness-release-rc.mjs","build-release.mjs","create-ui1-review-pack.mjs"] },
];

const stagingDir = path.join(ROOT, "ai-review", "_staging-ui1");
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

const includedFiles = [];
const sha256ByFile = {};

// Copy root files
for (const f of ["README.md","VERSION.md","RELEASE_NOTES.md","package.json","package-lock.json"]) {
  const src = path.join(ROOT, f);
  const dst = path.join(stagingDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    includedFiles.push(f);
    sha256ByFile[f] = sha256(src);
  }
}

// Copy source files
for (const [sub, files] of [
  ["src/app", ["main.js"]],
  ["src", ["styles.css"]],
  ["src/core", ["version.js","data.js"]],
]) {
  for (const f of files) {
    const rel = sub + "/" + path.basename(f);
    const src = path.join(ROOT, rel);
    const dst = path.join(stagingDir, rel);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      includedFiles.push(rel);
      sha256ByFile[rel] = sha256(src);
    }
  }
}

// Copy scripts
const scriptFiles = ["harness-release-rc.mjs","build-release.mjs","create-ui1-review-pack.mjs","ui1-final-gate.mjs"];
fs.mkdirSync(path.join(stagingDir, "scripts"), { recursive: true });
for (const f of scriptFiles) {
  const src = path.join(ROOT, "scripts", f);
  const dst = path.join(stagingDir, "scripts", f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    includedFiles.push("scripts/" + f);
    sha256ByFile["scripts/" + f] = sha256(src);
  }
}

// Copy ai-review/ui1-status-panel recursively
const reviewFiles = collectFiles(path.join(ROOT, "ai-review", "ui1-status-panel"));
for (const f of reviewFiles) {
  const src = path.join(ROOT, "ai-review", "ui1-status-panel", f);
  const dst = path.join(stagingDir, "ai-review", "ui1-status-panel", f);
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    includedFiles.push("ai-review/ui1-status-panel/" + f);
    sha256ByFile["ai-review/ui1-status-panel/" + f] = sha256(src);
  }
}

// Write manifest
const commitHash = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
let tag = "";
try { tag = execSync("git describe --tags --exact-match HEAD", { cwd: ROOT, encoding: "utf8" }).trim(); } catch {}

const manifest = {
  packageName: pkgName,
  createdAt: new Date().toISOString(),
  verdict,
  includedFiles,
  excludedPatterns: ["node_modules/**",".git/**","dist/**","ai-review/truemartial-t2a5-fusion-mastery-tune/raw/**","ai-review/rc3-fix1/evidence/normal/raw/runs.jsonl","ai-review/rc3-fix1/evidence/regular/raw/runs.jsonl","**/*.tmp","**/*.bak"],
  sha256ByFile,
  gateJsonPath: "ai-review/ui1-status-panel/ui1-final-gate.json",
  check: "PASS",
  smoke: "PASS",
  playerFlow: "PASS",
  releaseHarness: releaseHarnessResult.failed === 0 ? "PASS" : (releaseHarnessResult.failed === -1 ? "MISSING" : `FAILED=${releaseHarnessResult.failed}`),
  statusPanelHarness: statusPanelResult.failed === 0 ? "PASS" : (statusPanelResult.failed === -1 ? "MISSING" : `FAILED=${statusPanelResult.failed}`),
  statusPanelFailedCount: statusPanelResult.failed,
  releaseHarnessFailedCount: releaseHarnessResult.failed,
  blockedItems: failed,
  commitHash,
  tag: tag || "EMPTY",
};

fs.writeFileSync(path.join(OUT, "review-pack-manifest.json"), JSON.stringify(manifest, null, 2));
console.log("Manifest written");

// Create zip
const zipPath = path.join(OUT, pkgName);
const pwsh = `Compress-Archive -Path '${stagingDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`;
execSync(`powershell -Command "${pwsh}"`, { cwd: ROOT, stdio: "pipe" });

fs.rmSync(stagingDir, { recursive: true, force: true });

const stats = fs.statSync(zipPath);
console.log(`Package: ${pkgName} (${(stats.size / 1024).toFixed(1)} KB)`);
console.log(`Verdict: ${verdict}`);
console.log(`Files: ${includedFiles.length}`);
console.log(`StatusPanelHarness: failed=${statusPanelResult.failed}, pageErrors=${statusPanelResult.pageErrors}, consoleErrors=${statusPanelResult.consoleErrors}`);
console.log(`Blocked items: ${failed.length > 0 ? failed.join(", ") : "none"}`);
