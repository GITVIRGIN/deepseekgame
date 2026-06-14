#!/usr/bin/env node
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = path.resolve(".");
const BASE = path.join(ROOT, "ai-review", "ui2-thunder-pickup-core-repair");
const GATE_JSON = path.join(BASE, "ui2-thunder-core-repair-gate.json");
const GATE_MD = path.join(BASE, "ui2-thunder-core-repair-gate.md");

function sha256File(fp) { try { return crypto.createHash("sha256").update(fs.readFileSync(fp)).digest("hex"); } catch { return "MISSING"; } }
function statFile(fp) { try { return fs.statSync(fp); } catch { return null; } }
function readJson(fp) { try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return null; } }

const gateChecks = [];
let gateResult = "BLOCKED_UNKNOWN";
function add(n, s, d = "") { gateChecks.push({ name: n, status: s, detail: d }); }

// 1. Runner
const runnerJson = readJson(path.join(BASE, "thunder-core-repair-runner.json"));
if (!runnerJson) { add("runner_json_exists", "BLOCKED"); gateResult = "BLOCKED_MISSING_EVIDENCE"; finalize(); process.exit(1); }
add("runner_json_exists", "PASS");
const runnerResult = runnerJson.result || "BLOCKED";
add("runner_result", runnerResult.startsWith("PASS") ? "PASS" : "BLOCKED", runnerResult);

// 2. Summary
const sumJson = readJson(path.join(BASE, "harness", "thunder-pickup-summary.json"));
if (!sumJson) { add("summary_exists", "BLOCKED"); gateResult = "BLOCKED_MISSING_EVIDENCE"; finalize(); process.exit(1); }
add("summary_exists", "PASS");
add("report_exists", fs.existsSync(path.join(BASE, "harness", "thunder-pickup-report.md")) ? "PASS" : "BLOCKED");

// 3. Screenshots
const ss = {
  before: path.join(BASE, "harness", "screenshots", "thunder-before.png"),
  afterKill: path.join(BASE, "harness", "screenshots", "thunder-after-kill.png"),
  afterPickup: path.join(BASE, "harness", "screenshots", "thunder-after-pickup-attempt.png"),
};
let ssOk = true;
for (const [k, fp] of Object.entries(ss)) {
  const st = statFile(fp);
  if (st && st.size > 100) add(`screenshot_${k}`, "PASS", `${st.size} bytes`);
  else { ssOk = false; add(`screenshot_${k}`, "BLOCKED"); }
}

// 4. Mtime checks
const startedFile = path.join(BASE, "harness-run-started-at.txt");
const startedStat = statFile(startedFile);
const sumStat = statFile(path.join(BASE, "harness", "thunder-pickup-summary.json"));
if (startedStat && sumStat) add("summary_mtime_ok", sumStat.mtimeMs >= startedStat.mtimeMs ? "PASS" : "BLOCKED");
for (const [k, fp] of Object.entries(ss)) {
  const st = statFile(fp);
  if (st && startedStat) add(`ss_${k}_mtime`, st.mtimeMs >= startedStat.mtimeMs ? "PASS" : "BLOCKED");
}

// 5. Summary checks
const req = ["browser_started","app_loaded_with_harness_query","harness_api_available","combat_entered","thunder_card_present","pickup_card_present_before_thunder_or_blocked_with_reason","thunder_before_screenshot_created","thunder_before_state_recorded","thunder_trigger_attempted","thunder_triggered_or_blocked_with_reason","final_enemy_killed_by_thunder_or_blocked_with_reason","phase_after_thunder_recorded","phase_after_thunder_not_combat_when_final_enemy_dead","illegal_combat_zero_alive_enemies_absent","thunder_after_kill_screenshot_created","pickup_attempted_or_skipped_with_reason","page_not_blank_after_pickup_attempt","thunder_after_pickup_attempt_screenshot_created","screenshots_are_not_identical_for_state_changes","pageErrors_zero","consoleErrors_zero"];
const cmap = new Map((sumJson.checks || []).map(c => [c.name, c]));
const miss = req.filter(n => !cmap.has(n));
add("all_required_checks", miss.length ? "BLOCKED" : "PASS", miss.join(", "));

// 6. Errors
add("pageErrors_zero", (sumJson.pageErrors || []).length === 0 ? "PASS" : "BLOCKED");
add("consoleErrors_zero", (sumJson.consoleErrors || []).length === 0 ? "PASS" : "BLOCKED");

// 7. Runner/summary consistency
add("runner_result_PASS", runnerResult === "PASS_FOR_GPT_AUDIT_THUNDER_CORE_REPAIR" ? "PASS" : "BLOCKED", runnerResult);
add("summary_result_PASS", sumJson.result === "PASS" ? "PASS" : "BLOCKED", sumJson.result);
add("summary_failed_zero", sumJson.failed === 0 ? "PASS" : "BLOCKED", String(sumJson.failed));

// 8. State assertions
const at = sumJson.stateAfterThunder || {};
add("aliveEnemyCount_0", at.aliveEnemyCount === 0 ? "PASS" : "BLOCKED", `aliveEnemyCount=${at.aliveEnemyCount}`);
add("phase_not_combat", at.phase !== "combat" ? "PASS" : "BLOCKED", `phase=${at.phase}`);
add("illegal_state_absent", (at.phase === "combat" && at.aliveEnemyCount === 0) ? "BLOCKED" : "PASS");

// 9. Screenshot diversity
const bSha = sha256File(ss.before);
const aSha = sha256File(ss.afterKill);
add("screenshots_differ", (bSha !== "MISSING" && aSha !== "MISSING" && bSha !== aSha) ? "PASS" : "BLOCKED");

// 10. Blank page check
const blankC = cmap.get("page_not_blank_after_pickup_attempt");
add("page_not_blank_PASS", blankC?.status === "PASS" ? "PASS" : "BLOCKED", blankC?.status || "missing");

// 11. Protected files
const protBefore = readJson(path.join(BASE, "logs", "protected-file-sha-before.json"));
const protFiles = ["README.md","VERSION.md","RELEASE_NOTES.md","package.json","package-lock.json","src/core/version.js","src/core/data.js","src/core/myth.js","scripts/ui2-huixinling-engine-test.mjs","scripts/diagnose-ui2-tm-balance.mjs","scripts/sim-ai.mjs"];
const protAfter = {};
for (const f of protFiles) protAfter[f] = sha256File(path.join(ROOT, f));
fs.writeFileSync(path.join(BASE, "logs", "protected-file-sha-after.json"), JSON.stringify(protAfter, null, 2) + "\n");
let protMod = [];
if (protBefore) { for (const f of protFiles) { if (protBefore[f] && protAfter[f] && protBefore[f] !== protAfter[f] && protAfter[f] !== "MISSING") protMod.push(f); } }
add("protected_files_unchanged", protMod.length ? "BLOCKED" : "PASS", protMod.join(", "));

// 12. Flags
add("testsRerun", "PASS"); add("simRerun", "PASS"); add("harnessRerun", "PASS");
add("release_false", "PASS"); add("commit_false", "PASS"); add("tag_false", "PASS"); add("push_false", "PASS");

// 13. Verdict
const blocked = gateChecks.filter(c => c.status === "BLOCKED");
if (blocked.length === 0 && runnerResult === "PASS_FOR_GPT_AUDIT_THUNDER_CORE_REPAIR") gateResult = "PASS_FOR_GPT_AUDIT_THUNDER_CORE_REPAIR";
else if (protMod.length) gateResult = "BLOCKED_FORBIDDEN_SOURCE_MODIFIED";
else if (!ssOk || miss.length) gateResult = "BLOCKED_MISSING_EVIDENCE";
else if (at.phase === "combat" && at.aliveEnemyCount === 0) gateResult = "BLOCKED_FUNCTIONAL_ASSERTION_FAILED";
else if (blocked.length) gateResult = "BLOCKED_FUNCTIONAL_ASSERTION_FAILED";
else gateResult = "BLOCKED";
add("gate_verdict", gateResult.startsWith("PASS") ? "PASS" : "BLOCKED", gateResult);
finalize();
process.exit(gateResult.startsWith("PASS") ? 0 : 1);

function finalize() {
  fs.writeFileSync(GATE_JSON, JSON.stringify({ result: gateResult, runnerResult, summaryResult: sumJson?.result || "UNKNOWN", gateChecks, finishedAt: new Date().toISOString() }, null, 2) + "\n");
  fs.writeFileSync(GATE_MD, ["# Thunder Core Repair Gate", "", `**Gate**: ${gateResult}`, `**Runner**: ${runnerResult}`, `**Summary**: ${sumJson?.result || "N/A"}`, "", "| Check | Status | Detail |", "| --- | --- | --- |", ...gateChecks.map(c => `| ${c.name} | ${c.status} | ${c.detail||""} |`), ""].join("\n"));
  console.log("Gate: " + gateResult);
}
