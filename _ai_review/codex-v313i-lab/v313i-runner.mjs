import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(".");
const labDir = join(root, "_ai_review", "codex-v313i-lab");
mkdirSync(labDir, { recursive: true });

const dataPath = join(root, "src", "core", "data.js");
const typesPath = join(root, "src", "core", "types.js");
const baselineData = readFileSync(dataPath, "utf8");
const baselineTypes = readFileSync(typesPath, "utf8");

const candidates = [
  { id: "C0_BASELINE", changes: [], note: "R4A baseline" },
  { id: "C1_SHELL_CARDS_LIGHT", changes: ["shellLight"], note: "Light shell card buffs" },
  { id: "C2_SHELL_CARDS_STRONG", changes: ["shellStrong"], note: "Strong shell card buffs" },
  { id: "C3_SHELL_REWARD_ONLY", changes: ["shellRewardOnly"], note: "Shell reward only" },
  { id: "C4_SHELL_CARDS_LIGHT_PLUS_REWARD", changes: ["shellLight", "shellRewardLight", "beginnerShell136"], note: "Light shell cards plus shell reward" },
  { id: "C5_POISON_CARDS", changes: ["poisonCards"], note: "Poison card buffs" },
  { id: "C6_POISON_REWARD_ONLY", changes: ["poisonRewardOnly"], note: "Poison reward only" },
  { id: "C7_POISON_CARDS_PLUS_REWARD", changes: ["poisonCards", "poisonRewardLight"], note: "Poison cards plus reward" },
  { id: "C8_CONTROL_REWARD_042", changes: ["controlReward042"], note: "Control reward 0.42" },
  { id: "C9_CONTROL_REWARD_050", changes: ["controlReward050"], note: "Control reward 0.50" },
  { id: "C10_PHYSICAL_TINY", changes: ["physicalTiny"], note: "BattleCry tiny buff" },
  { id: "C11_PHYSICAL_REWARD_ONLY", changes: ["physicalRewardOnly"], note: "Physical reward only" },
  { id: "C12_COMBO_SAFE", changes: ["shellLight", "poisonCards", "physicalTiny", "controlReward042", "physicalReward132", "poisonRewardLight", "shellRewardLight", "beginnerShell134"], note: "Combo safe" },
  { id: "C13_COMBO_NO_CONTROL", changes: ["shellLight", "poisonCards", "physicalTiny", "physicalReward132", "poisonRewardLight", "shellRewardLight", "beginnerShell134"], note: "Combo without control" },
  { id: "C14_COMBO_SHELL_POISON_ONLY", changes: ["shellLight", "poisonCards", "poisonRewardLight", "shellRewardLight", "beginnerShell134"], note: "Shell and poison only" },
];

function replaceOnce(text, from, to, label) {
  const next = text.replace(from, to);
  if (next === text) throw new Error(`replacement failed: ${label}`);
  if (next.indexOf(from) !== -1 && from !== to) {
    // Not fatal for repeated numeric values generally, but the patterns below are specific snippets.
  }
  return next;
}

function applyChange(data, types, change) {
  switch (change) {
    case "shellLight":
      data = replaceOnce(data, 'text: "获得 6 点格挡和 2 层荆棘。", mythTags: ["昆仑"], style: "shell", grade: 2, effects: [{ type: "block", target: "self", value: 6 },{ type: "status", target: "self", status: "spikes", stacks: 2 }]', 'text: "获得 7 点格挡和 2 层荆棘。", mythTags: ["昆仑"], style: "shell", grade: 2, effects: [{ type: "block", target: "self", value: 7 },{ type: "status", target: "self", status: "spikes", stacks: 2 }]', "reflectArt light");
      data = replaceOnce(data, 'text: "获得 10 点格挡和 3 层荆棘，并立即反射。", mythTags: ["山海"], style: "shell", grade: 3, effects: [{ type: "block", target: "self", value: 10 },{ type: "status", target: "self", status: "spikes", stacks: 3 },{ type: "spikeBurst", target: "allEnemies" }]', 'text: "获得 12 点格挡和 3 层荆棘，并立即反射。", mythTags: ["山海"], style: "shell", grade: 3, effects: [{ type: "block", target: "self", value: 12 },{ type: "status", target: "self", status: "spikes", stacks: 3 },{ type: "spikeBurst", target: "allEnemies" }]', "turtleCrush light");
      data = replaceOnce(data, 'text: "获得 5 点格挡，抽 1 张牌。"', 'text: "获得 6 点格挡，抽 1 张牌。"', "stoneShell text light");
      data = replaceOnce(data, '{ type: "block", target: "self", value: 5 },\n      { type: "draw", value: 1 },', '{ type: "block", target: "self", value: 6 },\n      { type: "draw", value: 1 },', "stoneShell block light");
      data = replaceOnce(data, 'text: "获得 18 点格挡和 4 层荆棘，格挡翻倍。", mythTags: ["洪荒"], style: "shell", grade: 3, effects: [{ type: "block", target: "self", value: 18 },{ type: "status", target: "self", status: "spikes", stacks: 4 },{ type: "doubleBlock" }]', 'text: "获得 20 点格挡和 4 层荆棘，格挡翻倍。", mythTags: ["洪荒"], style: "shell", grade: 3, effects: [{ type: "block", target: "self", value: 20 },{ type: "status", target: "self", status: "spikes", stacks: 4 },{ type: "doubleBlock" }]', "immovable light");
      data = replaceOnce(data, 'text: "获得 12 点格挡。对所有敌人反震，造成当前格挡 14% 的伤害，不消耗格挡。"', 'text: "获得 14 点格挡。对所有敌人反震，造成当前格挡 16% 的伤害，不消耗格挡。"', "xuanwu text light");
      data = replaceOnce(data, '{ type: "block", target: "self", value: 12 },\n      { type: "shellReflect", target: "allEnemies", ratio: 0.14, consumeRatio: 0 },', '{ type: "block", target: "self", value: 14 },\n      { type: "shellReflect", target: "allEnemies", ratio: 0.16, consumeRatio: 0 },', "xuanwu effects light");
      data = replaceOnce(data, 'text: "获得 14 点格挡。对所有敌人反震，造成当前格挡 20% 的伤害，不消耗格挡，抽 1 张牌。"', 'text: "获得 16 点格挡。对所有敌人反震，造成当前格挡 20% 的伤害，不消耗格挡，抽 1 张牌。"', "sky text light");
      data = replaceOnce(data, '{ type: "block", target: "self", value: 14 },\n      { type: "shellReflect", target: "allEnemies", ratio: 0.20, consumeRatio: 0 },', '{ type: "block", target: "self", value: 16 },\n      { type: "shellReflect", target: "allEnemies", ratio: 0.20, consumeRatio: 0 },', "sky effects light");
      break;
    case "shellStrong":
      ({ data, types } = applyChange(data, types, "shellLight"));
      data = data.replace('获得 7 点格挡和 2 层荆棘。", mythTags: ["昆仑"], style: "shell", grade: 2, effects: [{ type: "block", target: "self", value: 7 }', '获得 8 点格挡和 2 层荆棘。", mythTags: ["昆仑"], style: "shell", grade: 2, effects: [{ type: "block", target: "self", value: 8 }');
      data = data.replace('获得 12 点格挡和 3 层荆棘，并立即反射。", mythTags: ["山海"], style: "shell", grade: 3, effects: [{ type: "block", target: "self", value: 12 }', '获得 13 点格挡和 3 层荆棘，并立即反射。", mythTags: ["山海"], style: "shell", grade: 3, effects: [{ type: "block", target: "self", value: 13 }');
      data = data.replace('text: "获得 6 点格挡，抽 1 张牌。"', 'text: "获得 7 点格挡，抽 1 张牌。"');
      data = data.replace('{ type: "block", target: "self", value: 6 },\n      { type: "draw", value: 1 },', '{ type: "block", target: "self", value: 7 },\n      { type: "draw", value: 1 },');
      data = data.replace('获得 20 点格挡和 4 层荆棘，格挡翻倍。", mythTags: ["洪荒"], style: "shell", grade: 3, effects: [{ type: "block", target: "self", value: 20 }', '获得 21 点格挡和 4 层荆棘，格挡翻倍。", mythTags: ["洪荒"], style: "shell", grade: 3, effects: [{ type: "block", target: "self", value: 21 }');
      data = data.replace('text: "获得 14 点格挡。对所有敌人反震，造成当前格挡 16% 的伤害，不消耗格挡。"', 'text: "获得 15 点格挡。对所有敌人反震，造成当前格挡 17% 的伤害，不消耗格挡。"');
      data = data.replace('{ type: "block", target: "self", value: 14 },\n      { type: "shellReflect", target: "allEnemies", ratio: 0.16, consumeRatio: 0 },', '{ type: "block", target: "self", value: 15 },\n      { type: "shellReflect", target: "allEnemies", ratio: 0.17, consumeRatio: 0 },');
      data = data.replace('text: "获得 16 点格挡。对所有敌人反震，造成当前格挡 20% 的伤害，不消耗格挡，抽 1 张牌。"', 'text: "获得 17 点格挡。对所有敌人反震，造成当前格挡 20% 的伤害，不消耗格挡，抽 1 张牌。"');
      data = data.replace('{ type: "block", target: "self", value: 16 },\n      { type: "shellReflect", target: "allEnemies", ratio: 0.20, consumeRatio: 0 },', '{ type: "block", target: "self", value: 17 },\n      { type: "shellReflect", target: "allEnemies", ratio: 0.20, consumeRatio: 0 },');
      break;
    case "shellRewardOnly":
      types = replaceOnce(types, "shellRewardMult: 1.26,", "shellRewardMult: 1.42,", "beginner shell reward only");
      types = replaceOnce(types, "shellRewardMult: 0.78,", "shellRewardMult: 0.92,", "regular shell reward only");
      break;
    case "shellRewardLight":
      types = replaceOnce(types, "shellRewardMult: 0.78,", "shellRewardMult: 0.88,", "regular shell reward light");
      break;
    case "beginnerShell136":
      types = replaceOnce(types, "shellRewardMult: 1.26,", "shellRewardMult: 1.36,", "beginner shell 1.36");
      break;
    case "beginnerShell134":
      types = replaceOnce(types, "shellRewardMult: 1.26,", "shellRewardMult: 1.34,", "beginner shell 1.34");
      break;
    case "poisonCards":
      data = replaceOnce(data, 'text: "造成 8 点伤害，施加 6 层毒瘴。"', 'text: "造成 9 点伤害，施加 7 层毒瘴。"', "centipede text");
      data = replaceOnce(data, '{ type: "damage", target: "enemy", value: 8 },\n      { type: "status", target: "enemy", status: "poison", stacks: 6 },', '{ type: "damage", target: "enemy", value: 9 },\n      { type: "status", target: "enemy", status: "poison", stacks: 7 },', "centipede effects");
      data = replaceOnce(data, 'text: "对所有敌人施加 6 层毒瘴，获得 8 点格挡。"', 'text: "对所有敌人施加 7 层毒瘴，获得 9 点格挡。"', "softBone text");
      data = replaceOnce(data, '{ type: "status", target: "allEnemies", status: "poison", stacks: 6 },\n      { type: "block", target: "self", value: 8 },', '{ type: "status", target: "allEnemies", status: "poison", stacks: 7 },\n      { type: "block", target: "self", value: 9 },', "softBone effects");
      break;
    case "poisonRewardOnly":
      types = replaceOnce(types, "poisonRewardMult: 0.60,", "poisonRewardMult: 0.70,", "poison reward only");
      break;
    case "poisonRewardLight":
      types = replaceOnce(types, "poisonRewardMult: 0.60,", "poisonRewardMult: 0.66,", "poison reward light");
      break;
    case "controlReward042":
      types = replaceOnce(types, "controlRewardMult: 0.34,", "controlRewardMult: 0.42,", "control 0.42");
      break;
    case "controlReward050":
      types = replaceOnce(types, "controlRewardMult: 0.34,", "controlRewardMult: 0.50,", "control 0.50");
      break;
    case "physicalTiny":
      data = replaceOnce(data, 'text: "获得 7 层战意。战意存在时，物理牌伤害 +战意；每打出一张物理伤害牌后战意 +7。"', 'text: "获得 8 层战意。战意存在时，物理牌伤害 +战意；每打出一张物理伤害牌后战意 +7。"', "battleCry text");
      data = replaceOnce(data, 'effects: [{ type: "status", target: "self", status: "battleIntent", stacks: 7 }]', 'effects: [{ type: "status", target: "self", status: "battleIntent", stacks: 8 }]', "battleCry effects");
      break;
    case "physicalRewardOnly":
      types = replaceOnce(types, "physicalRewardMult: 1.24,", "physicalRewardMult: 1.38,", "physical reward only");
      break;
    case "physicalReward132":
      types = replaceOnce(types, "physicalRewardMult: 1.24,", "physicalRewardMult: 1.32,", "physical reward 1.32");
      break;
    default:
      throw new Error(`unknown change: ${change}`);
  }
  return { data, types };
}

function materialize(candidate) {
  let data = baselineData;
  let types = baselineTypes;
  for (const change of candidate.changes) ({ data, types } = applyChange(data, types, change));
  writeFileSync(dataPath, data, "utf8");
  writeFileSync(typesPath, types, "utf8");
}

function runCommand(name, command, args, extra = {}) {
  const startedAt = new Date().toISOString();
  const commandLine = [command, ...args].map((part) => {
    const s = String(part);
    return /[\s&()]/.test(s) ? `"${s.replaceAll('"', '\\"')}"` : s;
  }).join(" ");
  const res = spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], { cwd: root, encoding: "utf8", timeout: extra.timeout ?? 15 * 60 * 1000 });
  const finishedAt = new Date().toISOString();
  return {
    name,
    command: commandLine,
    exitCode: res.status ?? 1,
    error: res.error?.message ?? null,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    startedAt,
    finishedAt,
  };
}

function writeRunLog(candidateId, suffix, result) {
  writeFileSync(join(labDir, `${candidateId}_${suffix}.stdout.txt`), result.stdout ?? "", "utf8");
  writeFileSync(join(labDir, `${candidateId}_${suffix}.stderr.txt`), result.stderr ?? "", "utf8");
  const copy = { ...result, stdout: `${candidateId}_${suffix}.stdout.txt`, stderr: `${candidateId}_${suffix}.stderr.txt` };
  writeFileSync(join(labDir, `${candidateId}_${suffix}.status.json`), JSON.stringify(copy, null, 2), "utf8");
}

const statuses = [];
for (const candidate of candidates) {
  console.log(`\n=== ${candidate.id} ===`);
  const status = { id: candidate.id, note: candidate.note, changes: candidate.changes, valid: false, eliminated: false, commands: {} };
  try {
    materialize(candidate);
    const validate = runCommand("validate:data", "npm", ["run", "validate:data"]);
    writeRunLog(candidate.id, "validate", validate);
    status.commands.validate = { exitCode: validate.exitCode, error: validate.error };
    const smoke = runCommand("smoke", "npm", ["run", "smoke"]);
    writeRunLog(candidate.id, "smoke", smoke);
    status.commands.smoke = { exitCode: smoke.exitCode, error: smoke.error };
    if (validate.exitCode !== 0 || smoke.exitCode !== 0) {
      status.eliminated = true;
      status.eliminationReason = "basic test failed";
      console.log(`${candidate.id}: invalid basic tests validate=${validate.exitCode} smoke=${smoke.exitCode}`);
    } else {
      status.valid = true;
      const report80 = join(labDir, `${candidate.id}_80x1.md`);
      const json80 = join(labDir, `${candidate.id}_80x1.json`);
      const bal80 = runCommand("balance 80x1", "node", ["scripts/balance-check.mjs", "--runs=80", "--seeds=1", "--seedBase=2026052700", `--reportOut=${report80}`, `--jsonOut=${json80}`], { timeout: 20 * 60 * 1000 });
      writeRunLog(candidate.id, "80x1", bal80);
      status.commands.balance80 = { exitCode: bal80.exitCode, error: bal80.error, report: report80, json: json80 };
      const report40 = join(labDir, `${candidate.id}_40x2.md`);
      const json40 = join(labDir, `${candidate.id}_40x2.json`);
      const bal40 = runCommand("balance 40x2", "node", ["scripts/balance-check.mjs", "--runs=40", "--seeds=2", "--seedBase=2026052700", `--reportOut=${report40}`, `--jsonOut=${json40}`], { timeout: 20 * 60 * 1000 });
      writeRunLog(candidate.id, "40x2", bal40);
      status.commands.balance40 = { exitCode: bal40.exitCode, error: bal40.error, report: report40, json: json40 };
      status.has80Json = existsJson(json80);
      status.has40Json = existsJson(json40);
      console.log(`${candidate.id}: validate=0 smoke=0 balance80=${bal80.exitCode} balance40=${bal40.exitCode} json80=${status.has80Json} json40=${status.has40Json}`);
    }
  } catch (error) {
    status.eliminated = true;
    status.eliminationReason = error.message;
    console.error(`${candidate.id}: ERROR ${error.stack || error.message}`);
  }
  statuses.push(status);
  writeFileSync(join(labDir, "candidate-status-progress.json"), JSON.stringify(statuses, null, 2), "utf8");
}

// Restore baseline after matrix; final selection will be applied by follow-up code.
writeFileSync(dataPath, baselineData, "utf8");
writeFileSync(typesPath, baselineTypes, "utf8");
writeFileSync(join(labDir, "candidate-status.json"), JSON.stringify(statuses, null, 2), "utf8");
console.log("\nCandidate matrix complete; restored R4A baseline.");

function existsJson(path) {
  try {
    JSON.parse(readFileSync(path, "utf8"));
    return true;
  } catch {
    return false;
  }
}
