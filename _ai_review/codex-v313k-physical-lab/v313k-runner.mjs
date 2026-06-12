import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(".");
const reviewDir = join(root, "_ai_review");
const labDir = join(reviewDir, "codex-v313k-physical-lab");
mkdirSync(labDir, { recursive: true });

const dataPath = join(root, "src", "core", "data.js");
const typesPath = join(root, "src", "core", "types.js");
const archetypesPath = join(root, "src", "core", "archetypes.js");
const baseline = {
  data: readFileSync(dataPath, "utf8"),
  types: readFileSync(typesPath, "utf8"),
  archetypes: readFileSync(archetypesPath, "utf8"),
};

const candidates = [
  { id: "P0_BASELINE", changes: [], modCount: 0, combo: false, description: "V3.13I-C12 baseline" },
  { id: "P1_PHYSICAL_REWARD_MED", changes: ["rewardMed"], modCount: 2, combo: false, description: "beginner physical 0.96, regular physical 1.55" },
  { id: "P2_PHYSICAL_REWARD_BIG", changes: ["rewardBig"], modCount: 2, combo: false, description: "beginner physical 1.00, regular physical 1.85" },
  { id: "P3_PHYSICAL_ARCHETYPE_LIGHT", changes: ["archetypeLight"], modCount: 2, combo: false, description: "physical guarantee threshold 6 and physical reward base weights" },
  { id: "P4_PHYSICAL_CARDS_LIGHT", changes: ["cardsLight"], modCount: 4, combo: false, description: "light physical card buffs" },
  { id: "P5_PHYSICAL_CARDS_MED", changes: ["cardsMed"], modCount: 5, combo: false, description: "medium physical card buffs" },
  { id: "P6_ARCHETYPE_PLUS_REWARD_MED", changes: ["rewardMed", "archetypeLight"], modCount: 4, combo: true, description: "P1 + P3" },
  { id: "P7_ARCHETYPE_PLUS_CARDS_LIGHT", changes: ["archetypeLight", "cardsLight"], modCount: 6, combo: true, description: "P3 + P4" },
  { id: "P8_REWARD_MED_PLUS_CARDS_LIGHT", changes: ["rewardMed", "cardsLight"], modCount: 6, combo: true, description: "P1 + P4" },
  { id: "P9_PHYSICAL_FULL_SAFE", changes: ["rewardMed", "archetypeLight", "cardsLight"], modCount: 8, combo: true, description: "P1 + P3 + P4" },
  { id: "P10_PHYSICAL_FULL_STRONG", changes: ["rewardBig", "archetypeLight", "cardsMed"], modCount: 9, combo: true, description: "P2 + P3 + P5" },
];

function replaceOnce(text, from, to, label) {
  const next = text.replace(from, to);
  if (next === text) throw new Error(`replacement failed: ${label}`);
  return next;
}
function cardRange(text, cardId) {
  const start = text.indexOf(`  ${cardId}: {`);
  if (start < 0) throw new Error(`missing card block: ${cardId}`);
  const rest = text.slice(start + 1);
  const nextCard = /\n\s{2}[A-Za-z0-9_]+:\s*\{/.exec(rest);
  const end = nextCard ? start + 1 + nextCard.index : text.indexOf("\n};", start);
  if (end < 0) throw new Error(`missing card block end: ${cardId}`);
  return { start, end };
}
function replaceInCard(text, cardId, pattern, replacement, label) {
  const { start, end } = cardRange(text, cardId);
  const block = text.slice(start, end);
  const nextBlock = block.replace(pattern, () => replacement);
  if (nextBlock === block) throw new Error(`replacement failed: ${label}`);
  return text.slice(0, start) + nextBlock + text.slice(end);
}
function applyChange(files, change) {
  let { data, types, archetypes } = files;
  switch (change) {
    case "rewardMed":
      types = replaceOnce(types, "physicalRewardMult: 0.90,", "physicalRewardMult: 0.96,", "beginner physical reward med");
      types = replaceOnce(types, "physicalRewardMult: 1.32,", "physicalRewardMult: 1.55,", "regular physical reward med");
      break;
    case "rewardBig":
      types = replaceOnce(types, "physicalRewardMult: 0.90,", "physicalRewardMult: 1.00,", "beginner physical reward big");
      types = replaceOnce(types, "physicalRewardMult: 1.32,", "physicalRewardMult: 1.85,", "regular physical reward big");
      break;
    case "archetypeLight":
      archetypes = replaceOnce(archetypes, 'dominant.style === "physical"\n        ? 7', 'dominant.style === "physical"\n        ? 6', "physical guarantee threshold");
      archetypes = replaceOnce(archetypes, `  if (styleId === "physical") {
    if (dominant?.style === "physical" && score >= 9) {
      return floor >= 13 ? 1.1 : floor >= 7 ? 0.9 : 0.6;
    }
    if (score >= 5) return 0.55;
    return 0.45;
  }`, `  if (styleId === "physical") {
    if (dominant?.style === "physical" && score >= 8) {
      return floor >= 13 ? 1.18 : floor >= 7 ? 0.98 : 0.68;
    }
    if (score >= 5) return 0.64;
    return 0.52;
  }`, "physical styleBaseRewardWeight");
      break;
    case "cardsLight":
      data = replaceInCard(data, "heavySlash", /text: "造成 22 点伤害。"/, 'text: "造成 24 点伤害。"', "heavySlash text light");
      data = replaceInCard(data, "heavySlash", /value: 22/, "value: 24", "heavySlash value light");
      data = replaceInCard(data, "traceCutter", /text: "造成 13 点伤害。目标已有负面状态各增加 2 层。"/, 'text: "造成 15 点伤害。目标已有负面状态各增加 2 层。"', "traceCutter text light");
      data = replaceInCard(data, "traceCutter", /value: 13/, "value: 15", "traceCutter value light");
      data = replaceInCard(data, "xingtianCleave", /text: "若目标生命不高于 45%，无视格挡斩杀；否则造成 36 点伤害。"/, 'text: "若目标生命不高于 45%，无视格挡斩杀；否则造成 40 点伤害。"', "xingtian text light");
      data = replaceInCard(data, "xingtianCleave", /fallbackDamage: 36/, "fallbackDamage: 40", "xingtian value light");
      data = replaceInCard(data, "tiangangBreak", /text: "对所有敌人造成 36 点伤害，获得 20 点格挡。"/, 'text: "对所有敌人造成 40 点伤害，获得 22 点格挡。"', "tiangang text light");
      data = replaceInCard(data, "tiangangBreak", /value: 36/, "value: 40", "tiangang damage light");
      data = replaceInCard(data, "tiangangBreak", /value: 20/, "value: 22", "tiangang block light");
      break;
    case "cardsMed":
      data = replaceInCard(data, "heavySlash", /text: "造成 22 点伤害。"/, 'text: "造成 25 点伤害。"', "heavySlash text med");
      data = replaceInCard(data, "heavySlash", /value: 22/, "value: 25", "heavySlash value med");
      data = replaceInCard(data, "chainBlade", /text: "连续造成 8 点伤害两次。"/, 'text: "连续造成 9 点伤害两次。"', "chainBlade text med");
      data = replaceInCard(data, "chainBlade", /value: 8/, "value: 9", "chainBlade first value med");
      data = replaceInCard(data, "chainBlade", /value: 8/, "value: 9", "chainBlade second value med");
      data = replaceInCard(data, "traceCutter", /text: "造成 13 点伤害。目标已有负面状态各增加 2 层。"/, 'text: "造成 16 点伤害。目标已有负面状态各增加 2 层。"', "traceCutter text med");
      data = replaceInCard(data, "traceCutter", /value: 13/, "value: 16", "traceCutter value med");
      data = replaceInCard(data, "xingtianCleave", /text: "若目标生命不高于 45%，无视格挡斩杀；否则造成 36 点伤害。"/, 'text: "若目标生命不高于 45%，无视格挡斩杀；否则造成 42 点伤害。"', "xingtian text med");
      data = replaceInCard(data, "xingtianCleave", /fallbackDamage: 36/, "fallbackDamage: 42", "xingtian value med");
      data = replaceInCard(data, "tiangangBreak", /text: "对所有敌人造成 36 点伤害，获得 20 点格挡。"/, 'text: "对所有敌人造成 42 点伤害，获得 24 点格挡。"', "tiangang text med");
      data = replaceInCard(data, "tiangangBreak", /value: 36/, "value: 42", "tiangang damage med");
      data = replaceInCard(data, "tiangangBreak", /value: 20/, "value: 24", "tiangang block med");
      break;
    default:
      throw new Error(`unknown change ${change}`);
  }
  return { data, types, archetypes };
}
function materialize(candidate) {
  let files = { ...baseline };
  for (const change of candidate.changes) files = applyChange(files, change);
  writeFileSync(dataPath, files.data, "utf8");
  writeFileSync(typesPath, files.types, "utf8");
  writeFileSync(archetypesPath, files.archetypes, "utf8");
}
function restoreBaseline() {
  writeFileSync(dataPath, baseline.data, "utf8");
  writeFileSync(typesPath, baseline.types, "utf8");
  writeFileSync(archetypesPath, baseline.archetypes, "utf8");
}
function shellQuote(s) {
  const text = String(s);
  return /[\s&()<>|]/.test(text) ? `"${text.replaceAll('"', '\\"')}"` : text;
}
function runCommand(label, command, args, opts = {}) {
  const commandLine = [command, ...args].map(shellQuote).join(" ");
  const startedAt = new Date().toISOString();
  const res = spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], { cwd: root, encoding: "utf8", timeout: opts.timeout ?? 15 * 60 * 1000 });
  const finishedAt = new Date().toISOString();
  return { label, command: commandLine, exitCode: res.status ?? 1, error: res.error?.message ?? null, stdout: res.stdout ?? "", stderr: res.stderr ?? "", startedAt, finishedAt };
}
function writeCommandFiles(candidateId, suffix, result) {
  writeFileSync(join(labDir, `${candidateId}_${suffix}.stdout.txt`), result.stdout, "utf8");
  writeFileSync(join(labDir, `${candidateId}_${suffix}.stderr.txt`), result.stderr, "utf8");
  writeFileSync(join(labDir, `${candidateId}_${suffix}.status.json`), JSON.stringify({ ...result, stdout: `${candidateId}_${suffix}.stdout.txt`, stderr: `${candidateId}_${suffix}.stderr.txt` }, null, 2), "utf8");
}
function parseProfile(text, style = "physical") {
  const timeoutMatch = text.match(/(?:物理|鐗╃悊|physical):\s+(\d+)\s+timeouts/i);
  const timeouts = timeoutMatch ? Number(timeoutMatch[1]) : 0;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(物理|鐗╃悊|physical)\s+/i.test(trimmed)) {
      const parts = trimmed.split(/\s+/);
      const winRate = parseFloat((parts[1] ?? "").replace("%", ""));
      const avgFloor = parseFloat(parts[2] ?? "");
      return { style, winRate: Number.isFinite(winRate) ? winRate : null, avgFloor: Number.isFinite(avgFloor) ? avgFloor : null, timeouts };
    }
  }
  return { style, winRate: null, avgFloor: null, timeouts, parseError: true };
}
function hardEliminationStage1(row) {
  const reasons = [];
  if (!row.validatePass || !row.smokePass) reasons.push("basic test failed");
  for (const key of ["regular80", "regular40", "normal80", "normal40"]) {
    if (!row[key] || row[key].winRate == null) reasons.push(`${key} parse failed`);
  }
  if (row.normal80?.winRate > 32) reasons.push("normal physical 80x1 > 32%");
  if (row.normal40?.winRate > 32) reasons.push("normal physical 40x2 > 32%");
  if (row.regular80?.winRate > 12) reasons.push("regular physical 80x1 > 12%");
  if (row.regular40?.winRate > 12) reasons.push("regular physical 40x2 > 12%");
  if (row.regular80?.winRate < 3 && row.regular40?.winRate < 3) reasons.push("regular physical both < 3%");
  if (row.normal80?.winRate < 12 && row.normal40?.winRate < 12) reasons.push("normal physical both < 12%");
  return reasons;
}
function distanceToRange(value, min, max) {
  if (value == null) return 999;
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}
function stage1SortScore(row) {
  const reg = distanceToRange(row.regular80?.winRate, 5, 10) + distanceToRange(row.regular40?.winRate, 5, 10);
  const norm = distanceToRange(row.normal80?.winRate, 15, 30) + distanceToRange(row.normal40?.winRate, 15, 30);
  const timeout = (row.regular80?.timeouts ?? 99) + (row.regular40?.timeouts ?? 99) + (row.normal80?.timeouts ?? 99) + (row.normal40?.timeouts ?? 99);
  return { reg, norm, timeout };
}
function entersStage2(row) {
  const r80 = row.regular80?.winRate ?? -1;
  const r40 = row.regular40?.winRate ?? -1;
  return (r80 >= 5 && r80 <= 10) || (r40 >= 5 && r40 <= 10) || (r80 >= 3 && r40 >= 3);
}
function parseBalanceJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
function stage2Elimination(json80, json40) {
  const reasons = [];
  if (!json80) reasons.push("missing 80x1 json");
  if (!json40) reasons.push("missing 40x2 json");
  const all = [...(json80?.results ?? []), ...(json40?.results ?? [])];
  if (all.some(r => r.mode === "trueMartial" && r.winRate > 2)) reasons.push("trueMartial > 2%");
  if (all.some(r => r.mode === "normal" && r.winRate > 32)) reasons.push("normal > 32%");
  if (all.some(r => r.mode === "regular" && r.winRate > 12)) reasons.push("regular > 12%");
  const nonPhysical = new Set(["spell", "bleed", "shell", "poison", "control"]);
  if (all.some(r => r.mode === "normal" && nonPhysical.has(r.style) && r.winRate < 10)) reasons.push("normal non-physical < 10%");
  if (all.some(r => r.mode === "regular" && nonPhysical.has(r.style) && r.winRate < 2)) reasons.push("regular non-physical < 2%");
  return reasons;
}
function finalCandidateSort(row, stage2) {
  const r80 = row.regular80?.winRate ?? -999;
  const r40 = row.regular40?.winRate ?? -999;
  const n80 = row.normal80?.winRate ?? -999;
  const n40 = row.normal40?.winRate ?? -999;
  const criterion1 = ((r80 >= 5 && r80 <= 10) || (r40 >= 5 && r40 <= 10)) && r80 >= 3 && r40 >= 3 ? 0 : 1;
  const criterion2 = ((n80 >= 15 && n80 <= 30) || (n40 >= 15 && n40 <= 30)) && n80 >= 12 && n40 >= 12 ? 0 : 1;
  const regDist = distanceToRange(r80, 5, 10) + distanceToRange(r40, 5, 10);
  const normDist = distanceToRange(n80, 15, 30) + distanceToRange(n40, 15, 30);
  return { criterion1, criterion2, regDist, normDist, modCount: row.modCount };
}

const stage1Rows = [];
for (const candidate of candidates) {
  console.log(`\n=== Stage1 ${candidate.id} ===`);
  const row = { id: candidate.id, description: candidate.description, changes: candidate.changes, modCount: candidate.modCount, combo: candidate.combo };
  try {
    materialize(candidate);
    const validate = runCommand("validate:data", "npm", ["run", "validate:data"]);
    writeCommandFiles(candidate.id, "validate", validate);
    const smoke = runCommand("smoke", "npm", ["run", "smoke"]);
    writeCommandFiles(candidate.id, "smoke", smoke);
    row.validatePass = validate.exitCode === 0;
    row.smokePass = smoke.exitCode === 0;
    if (row.validatePass && row.smokePass) {
      const runs = [
        ["regular80", "regular", "80", "1", `${candidate.id}_regular_physical_80x1.txt`],
        ["regular40", "regular", "40", "2", `${candidate.id}_regular_physical_40x2.txt`],
        ["normal80", "normal", "80", "1", `${candidate.id}_normal_physical_80x1.txt`],
        ["normal40", "normal", "40", "2", `${candidate.id}_normal_physical_40x2.txt`],
      ];
      for (const [key, mode, runsN, seeds, fileName] of runs) {
        const result = runCommand(key, "node", ["scripts/sim-ai.mjs", `--mode=${mode}`, "--profile=physical", "--strategy=styleAware", `--runs=${runsN}`, `--seeds=${seeds}`, "--seedBase=2026052700"], { timeout: 20 * 60 * 1000 });
        writeFileSync(join(labDir, fileName), result.stdout, "utf8");
        writeFileSync(join(labDir, fileName.replace(".txt", ".stderr.txt")), result.stderr, "utf8");
        writeFileSync(join(labDir, fileName.replace(".txt", ".status.json")), JSON.stringify({ ...result, stdout: fileName, stderr: fileName.replace(".txt", ".stderr.txt") }, null, 2), "utf8");
        row[key] = parseProfile(result.stdout);
        row[key].exitCode = result.exitCode;
      }
    }
    row.eliminationReasons = hardEliminationStage1(row);
    row.eliminated = row.eliminationReasons.length > 0;
    row.entersStage2 = !row.eliminated && entersStage2(row);
    row.sort = stage1SortScore(row);
    console.log(`${candidate.id}: validate=${row.validatePass} smoke=${row.smokePass} n80=${row.normal80?.winRate} n40=${row.normal40?.winRate} r80=${row.regular80?.winRate} r40=${row.regular40?.winRate} stage2=${row.entersStage2} elim=${row.eliminationReasons.join(";") || "no"}`);
  } catch (error) {
    row.validatePass = false;
    row.smokePass = false;
    row.eliminated = true;
    row.entersStage2 = false;
    row.eliminationReasons = [error.message];
    console.error(`${candidate.id}: ERROR ${error.stack || error.message}`);
  }
  stage1Rows.push(row);
  writeFileSync(join(reviewDir, "CODEX_V313K_STAGE1_PHYSICAL.json"), JSON.stringify({ rows: stage1Rows }, null, 2), "utf8");
}

const stage2Candidates = stage1Rows
  .filter(r => r.entersStage2)
  .sort((a, b) => a.sort.reg - b.sort.reg || a.sort.norm - b.sort.norm || a.sort.timeout - b.sort.timeout || a.modCount - b.modCount || Number(a.combo) - Number(b.combo))
  .slice(0, 4);

const stage2Rows = [];
for (const row of stage2Candidates) {
  const candidate = candidates.find(c => c.id === row.id);
  console.log(`\n=== Stage2 ${candidate.id} ===`);
  materialize(candidate);
  const report80 = join(labDir, `${candidate.id}_BALANCE_80x1.md`);
  const json80 = join(labDir, `${candidate.id}_BALANCE_80x1.json`);
  const bal80 = runCommand("balance80", "node", ["scripts/balance-check.mjs", "--runs=80", "--seeds=1", "--seedBase=2026052700", `--reportOut=${report80}`, `--jsonOut=${json80}`], { timeout: 25 * 60 * 1000 });
  writeCommandFiles(candidate.id, "BALANCE_80x1", bal80);
  const report40 = join(labDir, `${candidate.id}_BALANCE_40x2.md`);
  const json40 = join(labDir, `${candidate.id}_BALANCE_40x2.json`);
  const bal40 = runCommand("balance40", "node", ["scripts/balance-check.mjs", "--runs=40", "--seeds=2", "--seedBase=2026052700", `--reportOut=${report40}`, `--jsonOut=${json40}`], { timeout: 25 * 60 * 1000 });
  writeCommandFiles(candidate.id, "BALANCE_40x2", bal40);
  const parsed80 = parseBalanceJson(json80);
  const parsed40 = parseBalanceJson(json40);
  const reasons = stage2Elimination(parsed80, parsed40);
  const s2 = { id: candidate.id, balance80Exit: bal80.exitCode, balance40Exit: bal40.exitCode, has80Json: Boolean(parsed80), has40Json: Boolean(parsed40), has80Report: existsSync(report80), has40Report: existsSync(report40), eliminated: reasons.length > 0, eliminationReasons: reasons, results80: parsed80?.results ?? [], results40: parsed40?.results ?? [] };
  s2.finalSort = finalCandidateSort(row, s2);
  stage2Rows.push(s2);
  console.log(`${candidate.id}: balance80=${bal80.exitCode} balance40=${bal40.exitCode} elim=${reasons.join(";") || "no"}`);
  writeFileSync(join(reviewDir, "CODEX_V313K_STAGE2_BALANCE.json"), JSON.stringify({ selectedForStage2: stage2Candidates.map(r => r.id), rows: stage2Rows }, null, 2), "utf8");
}

const safe = stage2Rows.filter(r => !r.eliminated)
  .sort((a, b) => a.finalSort.criterion1 - b.finalSort.criterion1 || a.finalSort.criterion2 - b.finalSort.criterion2 || a.finalSort.regDist - b.finalSort.regDist || a.finalSort.normDist - b.finalSort.normDist || a.finalSort.modCount - b.finalSort.modCount);
const selected = safe[0]?.id ?? "P0_BASELINE";
const selectionReason = safe[0] ? "safe Stage2 candidate selected by final priority" : "no safe Stage2 candidate; restored baseline";
const finalCandidate = candidates.find(c => c.id === selected) ?? candidates[0];
materialize(finalCandidate);

writeFileSync(join(reviewDir, "CODEX_V313K_SELECTION.json"), JSON.stringify({ selected, selectionReason, stage2Candidates: stage2Candidates.map(r => r.id) }, null, 2), "utf8");
writeStage1Markdown(stage1Rows, stage2Candidates.map(r => r.id));
writeStage2Markdown(stage2Rows, selected, selectionReason);
console.log(`\nSelected ${selected}: ${selectionReason}`);

function writeStage1Markdown(rows, stage2Ids) {
  let md = "# CODEX V3.13K Stage1 Physical Matrix\n\n";
  md += "| Candidate | Normal 80x1 | Normal 40x2 | Regular 80x1 | Regular 40x2 | Stage2 | Eliminated |\n";
  md += "|---|---:|---:|---:|---:|---|---|\n";
  for (const r of rows) {
    md += `| ${r.id} | ${fmtProfile(r.normal80)} | ${fmtProfile(r.normal40)} | ${fmtProfile(r.regular80)} | ${fmtProfile(r.regular40)} | ${stage2Ids.includes(r.id) ? "yes" : "no"} | ${r.eliminated ? r.eliminationReasons.join("; ") : "no"} |\n`;
  }
  writeFileSync(join(reviewDir, "CODEX_V313K_STAGE1_PHYSICAL.md"), md, "utf8");
}
function fmtProfile(p) {
  if (!p || p.winRate == null) return "N/A";
  return `${p.winRate}% / floor ${p.avgFloor} / timeout ${p.timeouts}`;
}
function writeStage2Markdown(rows, selected, selectionReason) {
  let md = "# CODEX V3.13K Stage2 Balance Matrix\n\n";
  md += `Selected: **${selected}** (${selectionReason})\n\n`;
  for (const row of rows) {
    md += `## ${row.id}\n\n`;
    md += `Eliminated: ${row.eliminated ? "yes - " + row.eliminationReasons.join("; ") : "no"}\n\n`;
    md += "### 80x1\n\n" + balanceTable(row.results80) + "\n";
    md += "### 40x2\n\n" + balanceTable(row.results40) + "\n";
  }
  writeFileSync(join(reviewDir, "CODEX_V313K_STAGE2_BALANCE.md"), md, "utf8");
}
function balanceTable(results) {
  let md = "| Mode | Style | WinRate | AvgFloor | Timeout | Status |\n|---|---|---:|---:|---:|---|\n";
  for (const mode of ["normal", "regular", "trueMartial"]) {
    for (const r of results.filter(x => x.mode === mode)) md += `| ${r.mode} | ${r.style} | ${r.winRate}% | ${r.avgFloor} | ${r.timeouts} | ${r.status} |\n`;
  }
  return md;
}
