#!/usr/bin/env node
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = path.resolve(".");
const BASE = path.join(ROOT, "ai-review", "ui2-thunder-pickup-core-repair");
const RUNNER_JSON = path.join(BASE, "thunder-core-repair-runner.json");
const RUNNER_MD = path.join(BASE, "thunder-core-repair-runner.md");
const STARTED_AT_FILE = path.join(BASE, "harness-run-started-at.txt");
const STDOUT_LOG = path.join(BASE, "logs", "thunder-pickup-real.stdout.log");
const STDERR_LOG = path.join(BASE, "logs", "thunder-pickup-real.stderr.log");
const SUMMARY_JSON = path.join(BASE, "harness", "thunder-pickup-summary.json");
const SCREENSHOTS = {
  before: path.join(BASE, "harness", "screenshots", "thunder-before.png"),
  afterKill: path.join(BASE, "harness", "screenshots", "thunder-after-kill.png"),
  afterPickup: path.join(BASE, "harness", "screenshots", "thunder-after-pickup-attempt.png"),
};

function sha256File(fp) { try { return crypto.createHash("sha256").update(fs.readFileSync(fp)).digest("hex"); } catch { return "MISSING"; } }
function statFile(fp) { try { return fs.statSync(fp); } catch { return null; } }

const runnerChecks = [];
let runnerResult = "BLOCKED_UNKNOWN";
function addCheck(n, s, d = "") { runnerChecks.push({ name: n, status: s, detail: d }); }

// 1. Write started-at
const startedAt = new Date();
fs.mkdirSync(path.dirname(STARTED_AT_FILE), { recursive: true });
fs.writeFileSync(STARTED_AT_FILE, startedAt.toISOString() + "\n");
addCheck("runner_started_at_written", "PASS");

// 2. Clean old harness outputs
for (const f of [SUMMARY_JSON, ...Object.values(SCREENSHOTS)]) { try { fs.rmSync(f, { force: true }); } catch {} }
addCheck("old_harness_outputs_cleaned", "PASS");

// 3. Execute harness
addCheck("harness_command_execution_attempted", "PASS", "node scripts/harness-release-rc.mjs --ui2-thunder-pickup-real");
let harnessProc;
try {
  harnessProc = spawnSync(process.execPath, ["scripts/harness-release-rc.mjs", "--ui2-thunder-pickup-real"], {
    cwd: ROOT, timeout: 120000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
} catch (e) {
  addCheck("harness_command_executed", "BLOCKED", e.message);
  runnerResult = "BLOCKED_HARNESS_COMMAND_NOT_EXECUTED";
  finalize(); process.exit(1);
}

fs.mkdirSync(path.dirname(STDOUT_LOG), { recursive: true });
fs.writeFileSync(STDOUT_LOG, harnessProc.stdout || "");
fs.writeFileSync(STDERR_LOG, harnessProc.stderr || "");

if (harnessProc.error) { addCheck("harness_command_executed", "BLOCKED", harnessProc.error.message); runnerResult = "BLOCKED_HARNESS_COMMAND_NOT_EXECUTED"; finalize(); process.exit(1); }
addCheck("harness_command_executed", "PASS", `exitCode=${harnessProc.status}`);

// 4. Check summary
const sumStat = statFile(SUMMARY_JSON);
if (!sumStat) { addCheck("summary_exists", "BLOCKED"); runnerResult = "BLOCKED_MISSING_EVIDENCE"; finalize(); process.exit(1); }
addCheck("summary_exists", "PASS");

const startedStat = statFile(STARTED_AT_FILE);
addCheck("summary_mtime_after_harness_started", (sumStat.mtimeMs >= startedStat.mtimeMs) ? "PASS" : "BLOCKED");

let summary;
try { summary = JSON.parse(fs.readFileSync(SUMMARY_JSON, "utf8")); addCheck("summary_parsed", "PASS"); }
catch (e) { addCheck("summary_parsed", "BLOCKED", e.message); runnerResult = "BLOCKED_MISSING_EVIDENCE"; finalize(); process.exit(1); }

// 5. Required checks
const requiredChecks = ["browser_started","app_loaded_with_harness_query","harness_api_available","combat_entered","thunder_card_present","pickup_card_present_before_thunder_or_blocked_with_reason","thunder_before_screenshot_created","thunder_before_state_recorded","thunder_trigger_attempted","thunder_triggered_or_blocked_with_reason","final_enemy_killed_by_thunder_or_blocked_with_reason","phase_after_thunder_recorded","phase_after_thunder_not_combat_when_final_enemy_dead","illegal_combat_zero_alive_enemies_absent","thunder_after_kill_screenshot_created","pickup_attempted_or_skipped_with_reason","page_not_blank_after_pickup_attempt","thunder_after_pickup_attempt_screenshot_created","screenshots_are_not_identical_for_state_changes","pageErrors_zero","consoleErrors_zero"];
const cmap = new Map((summary.checks || []).map(c => [c.name, c]));
const missing = requiredChecks.filter(n => !cmap.has(n));
addCheck("all_required_checks_present", missing.length ? "BLOCKED" : "PASS", missing.join(", "));

// 6. Screenshots
let allScreenshotsOk = true;
for (const [k, fp] of Object.entries(SCREENSHOTS)) {
  const st = statFile(fp);
  if (st && st.size > 100) { addCheck(`screenshot_${k}`, "PASS", `${st.size} bytes`); }
  else { allScreenshotsOk = false; addCheck(`screenshot_${k}`, "BLOCKED", st ? `size=${st.size}` : "missing"); }
  if (st && startedStat && st.mtimeMs >= startedStat.mtimeMs) addCheck(`screenshot_${k}_mtime`, "PASS");
  else if (st) addCheck(`screenshot_${k}_mtime`, "BLOCKED", "older than runner start");
}

// 7. Key checks
addCheck("pageErrors_zero", (summary.pageErrors||[]).length === 0 ? "PASS" : "BLOCKED", `${(summary.pageErrors||[]).length} errors`);
addCheck("consoleErrors_zero", (summary.consoleErrors||[]).length === 0 ? "PASS" : "BLOCKED", `${(summary.consoleErrors||[]).length} errors`);
addCheck("commandExecuted", summary.commandExecuted ? "PASS" : "BLOCKED");
addCheck("browserStarted", summary.browserStarted ? "PASS" : "BLOCKED");

// 8. Functional checks
const fnNames = ["final_enemy_killed_by_thunder_or_blocked_with_reason","phase_after_thunder_not_combat_when_final_enemy_dead","illegal_combat_zero_alive_enemies_absent","page_not_blank_after_pickup_attempt","thunder_triggered_or_blocked_with_reason"];
let fnBlocked = 0;
for (const n of fnNames) {
  const c = cmap.get(n);
  if (c?.status === "PASS") addCheck(`fn_${n}`, "PASS");
  else { addCheck(`fn_${n}`, "BLOCKED", c?.blockedReason || "missing"); fnBlocked++; }
}

// 9. State checks
const at = summary.stateAfterThunder || {};
addCheck("aliveEnemyCount_0", at.aliveEnemyCount === 0 ? "PASS" : "BLOCKED", `aliveEnemyCount=${at.aliveEnemyCount}`);
addCheck("phase_not_combat", at.phase !== "combat" ? "PASS" : "BLOCKED", `phase=${at.phase}`);
addCheck("illegal_state_absent", (at.phase === "combat" && at.aliveEnemyCount === 0) ? "BLOCKED" : "PASS");

// 10. Screenshot diversity
const bSha = sha256File(SCREENSHOTS.before);
const aSha = sha256File(SCREENSHOTS.afterKill);
addCheck("screenshots_differ", (bSha !== "MISSING" && aSha !== "MISSING" && bSha !== aSha) ? "PASS" : "BLOCKED");

// 11. Summary result
addCheck("summary_failed_0", summary.failed === 0 ? "PASS" : "BLOCKED", `failed=${summary.failed}`);
addCheck("summary_result_PASS", summary.result === "PASS" ? "PASS" : "BLOCKED", `result=${summary.result}`);

// 12. Determine runner result
const anyB = runnerChecks.some(c => c.status === "BLOCKED");
if (fnBlocked > 0) runnerResult = "BLOCKED_FUNCTIONAL_ASSERTION_FAILED";
else if (anyB) runnerResult = "BLOCKED_MISSING_EVIDENCE";
else if (summary.result === "PASS" && summary.failed === 0 && at.aliveEnemyCount === 0 && at.phase !== "combat") runnerResult = "PASS_FOR_GPT_AUDIT_THUNDER_CORE_REPAIR";
else runnerResult = "BLOCKED";

addCheck("runner_final_result", runnerResult.startsWith("PASS") ? "PASS" : "BLOCKED", runnerResult);
finalize();
process.exit(runnerResult.startsWith("PASS") ? 0 : 1);

function finalize() {
  const j = { result: runnerResult, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), harnessExitCode: harnessProc?.status ?? null, runnerChecks };
  fs.writeFileSync(RUNNER_JSON, JSON.stringify(j, null, 2) + "\n");
  fs.writeFileSync(RUNNER_MD, ["# Thunder Core Repair Runner", "", `**Result**: ${runnerResult}`, `**Harness exit**: ${harnessProc?.status ?? "N/A"}`, "", "| Check | Status | Detail |", "| --- | --- | --- |", ...runnerChecks.map(c => `| ${c.name} | ${c.status} | ${c.detail||""} |`), ""].join("\n"));
  console.log("Runner: " + runnerResult);
}
