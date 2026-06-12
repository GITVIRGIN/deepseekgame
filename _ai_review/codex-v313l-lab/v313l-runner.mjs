import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

const root = resolve(".");
const reviewDir = join(root, "_ai_review");
const labDir = join(reviewDir, "codex-v313l-lab");
mkdirSync(labDir, { recursive: true });

const paths = {
  data: join(root, "src", "core", "data.js"),
  types: join(root, "src", "core", "types.js"),
  archetypes: join(root, "src", "core", "archetypes.js"),
  simAi: join(root, "scripts", "sim-ai.mjs"),
};

const baseline = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(path, "utf8")]));
const baselineSimHash = createHash("sha256").update(baseline.simAi).digest("hex").toUpperCase();

const candidates = [
  { id: "L0_BASELINE", changes: [], modCount: 0, touchesSimAi: false, description: "baseline" },
  { id: "L1_TARGETED_PHYSICAL_AI", changes: ["ai"], modCount: 2, touchesSimAi: true, description: "targeted physicalAI in normal/regular" },
  { id: "L2_TARGETED_PHYSICAL_AI_PLUS_TARGET", changes: ["aiTarget"], modCount: 3, touchesSimAi: true, description: "targeted physicalAI plus physical targetUid" },
  { id: "L3_PHYSICAL_FINISHER_ACCESS", changes: ["access"], modCount: 4, touchesSimAi: false, description: "physical finisher access via reward/archetype" },
  { id: "L4_PHYSICAL_LATE_PACKAGE_LIGHT", changes: ["lateLight"], modCount: 4, touchesSimAi: false, description: "light late physical package" },
  { id: "L5_PHYSICAL_LATE_PACKAGE_MED", changes: ["lateMed"], modCount: 5, touchesSimAi: false, description: "medium late physical package" },
  { id: "L6_AI_PLUS_FINISHER_ACCESS", changes: ["ai", "access"], modCount: 6, touchesSimAi: true, description: "L1 + L3" },
  { id: "L7_AI_PLUS_LATE_PACKAGE_LIGHT", changes: ["ai", "lateLight"], modCount: 6, touchesSimAi: true, description: "L1 + L4" },
  { id: "L8_ACCESS_PLUS_LATE_PACKAGE_LIGHT", changes: ["access", "lateLight"], modCount: 8, touchesSimAi: false, description: "L3 + L4" },
  { id: "L9_FULL_SAFE", changes: ["ai", "access", "lateLight"], modCount: 10, touchesSimAi: true, description: "L1 + L3 + L4" },
];

function restoreBaseline() {
  for (const [key, path] of Object.entries(paths)) writeFileSync(path, baseline[key], "utf8");
}

function replaceOnce(text, from, to, label) {
  const next = text.replace(from, to);
  if (next === text) throw new Error(`replacement failed: ${label}`);
  return next;
}

function replaceFunction(text, functionName, nextFunctionName, replacement) {
  const start = text.indexOf(`function ${functionName}(`);
  if (start < 0) throw new Error(`missing function ${functionName}`);
  const end = text.indexOf(`function ${nextFunctionName}(`, start);
  if (end < 0) throw new Error(`missing next function ${nextFunctionName}`);
  return text.slice(0, start) + replacement.trimEnd() + "\n\n" + text.slice(end);
}

function cardRange(text, cardId) {
  const start = text.indexOf(`  ${cardId}: {`);
  if (start < 0) throw new Error(`missing card ${cardId}`);
  const rest = text.slice(start + 1);
  const next = /\n\s{2}[A-Za-z0-9_]+:\s*\{/.exec(rest);
  const end = next ? start + 1 + next.index : text.indexOf("\n};", start);
  if (end < 0) throw new Error(`missing end for card ${cardId}`);
  return { start, end };
}

function replaceInCard(text, cardId, pattern, replacement, label) {
  const { start, end } = cardRange(text, cardId);
  const block = text.slice(start, end);
  const nextBlock = block.replace(pattern, replacement);
  if (nextBlock === block) throw new Error(`replacement failed: ${label}`);
  return text.slice(0, start) + nextBlock + text.slice(end);
}

function physicalAI({ target }) {
  const targetHelpers = target ? `
function physicalEffectiveHp(enemy) {
  return (enemy?.hp || 0) + (enemy?.block || 0);
}

function physicalTargetUid(run, card) {
  if (!card || card.effects.some(e => e.target === "allEnemies" || e.target === "self")) return null;
  const enemies = (run.combat?.enemies || []).filter(e => e.hp > 0);
  if (enemies.length === 0) return null;
  if (card.effects.some(e => e.type === "execute" || e.tmExecute)) {
    const exec = card.effects.find(e => e.type === "execute" || e.tmExecute);
    const threshold = exec?.threshold ?? 45;
    const candidates = enemies.filter(e => e.hp <= e.maxHp * (threshold / 100));
    const pool = candidates.length > 0 ? candidates : enemies;
    return [...pool].sort((a, b) => physicalEffectiveHp(a) - physicalEffectiveHp(b))[0]?.uid ?? null;
  }
  if (card.effects.some(e => e.type === "damage" && e.target !== "allEnemies")) {
    return [...enemies].sort((a, b) => physicalEffectiveHp(a) - physicalEffectiveHp(b))[0]?.uid ?? null;
  }
  return null;
}

function makePhysicalAction(run, h) {
  return { type: "playCard", cardUid: h.inst.uid, targetUid: physicalTargetUid(run, h.card) };
}
` : `
function makePhysicalAction(run, h) {
  return makeAction(h);
}
`;

  return `${targetHelpers}
function physicalAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const target = aliveEnemy(run);
  if (!target) return null;
  const hasPoJun = hasTMRelic(run, "poJunLing");
  const trueDmg = hasPoJun ? TM_POJUN_TRUE_DAMAGE : 0;
  const hpPct = run.hp / run.maxHp;
  const enemyDmg = estimateIncoming(run);
  const block = run.combat?.block ?? 0;
  const battleIntent = statusStacks({ statuses: run.statuses || [] }, "battleIntent");

  const exec = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "execute" || e.tmExecute));
  if (exec.length > 0 && target.hp <= target.maxHp * 0.35) return makePhysicalAction(run, exec[0]);

  const dmgCards = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "damage"));
  const physicalDmgCards = dmgCards.filter(h => h.card.style === "physical");
  const killingIntent = dmgCards.filter(h => h.card.id === "killingIntent" && target.hp <= target.maxHp * 0.25);
  if (killingIntent.length > 0) return makePhysicalAction(run, killingIntent[0]);

  for (const h of dmgCards) {
    const rawDmg = h.card.effects.filter(e => e.type === "damage").reduce((s, e) => s + (e.value || 0), 0);
    const bonus = (h.card.style === "physical" && hasPoJun) ? trueDmg : 0;
    if (rawDmg + bonus >= target.hp + Math.max(0, target.block - (hasPoJun && h.card.style === "physical" ? trueDmg : 0))) {
      return makePhysicalAction(run, h);
    }
  }

  if (hpPct < 0.25 && block < enemyDmg) {
    const b = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "block"));
    if (b.length > 0) return makePhysicalAction(run, b.sort((a, b) => (b.card.effects.find(e => e.type === "block")?.value || 0) - (a.card.effects.find(e => e.type === "block")?.value || 0))[0]);
  }

  const intentStarter = hand.filter(h => ok(h) && (h.card.id === "readyStance" || h.card.id === "battleCry"));
  if (intentStarter.length > 0 && battleIntent < 8 && physicalDmgCards.length >= 1) {
    return makePhysicalAction(run, intentStarter.sort((a, b) => a.card.cost - b.card.cost)[0]);
  }

  const furySlash = dmgCards.filter(h => h.card.id === "furySlash");
  if (furySlash.length > 0) return makePhysicalAction(run, furySlash[0]);

  const armorBreaker = dmgCards.filter(h => h.card.id === "armorBreaker" && target.hp <= target.maxHp * 0.5);
  if (armorBreaker.length > 0) return makePhysicalAction(run, armorBreaker[0]);

  if (dmgCards.length > 0) {
    const sorted = dmgCards.sort((a, b) => {
      const va = (a.card.effects.find(e => e.type === "damage")?.value || 0) + (a.card.style === "physical" ? battleIntent : 0) + (a.card.style === "physical" && hasPoJun ? trueDmg : 0);
      const vb = (b.card.effects.find(e => e.type === "damage")?.value || 0) + (b.card.style === "physical" ? battleIntent : 0) + (b.card.style === "physical" && hasPoJun ? trueDmg : 0);
      return vb - va;
    })[0];
    return makePhysicalAction(run, sorted);
  }

  const intent = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "status" && e.status === "battleIntent"));
  if (intent.length > 0) return makePhysicalAction(run, intent[0]);

  return null;
}`;
}

function applyAi(simAi, { target }) {
  let next = simAi;
  next = replaceFunction(next, "physicalAI", "spellAI", physicalAI({ target }));
  next = replaceOnce(
    next,
    'if (isTM && profile !== "balanced") {',
    'if (profile === "physical" || (isTM && profile !== "balanced")) {',
    "styleAware physicalAI condition"
  );
  return next;
}

function applyChange(files, change) {
  let { data, types, archetypes, simAi } = files;
  switch (change) {
    case "ai":
      simAi = applyAi(simAi, { target: false });
      break;
    case "aiTarget":
      simAi = applyAi(simAi, { target: true });
      break;
    case "access":
      types = replaceOnce(types, "physicalRewardMult: 0.90,", "physicalRewardMult: 0.96,", "beginner physicalRewardMult");
      types = replaceOnce(types, "physicalRewardMult: 1.32,", "physicalRewardMult: 1.55,", "regular physicalRewardMult");
      archetypes = replaceOnce(archetypes, 'dominant.style === "physical"\n        ? 7', 'dominant.style === "physical"\n        ? 6', "physical guarantee threshold");
      archetypes = replaceOnce(archetypes, `  if (styleId === "physical") {
    if (dominant?.style === "physical" && score >= 9) {
      return floor >= 13 ? 1.1 : floor >= 7 ? 0.9 : 0.6;
    }
    if (score >= 5) return 0.55;
    return 0.45;
  }`, `  if (styleId === "physical") {
    if (dominant?.style === "physical" && score >= 8) {
      return floor >= 13 ? 1.22 : floor >= 7 ? 1.02 : 0.70;
    }
    if (score >= 5) return 0.66;
    return 0.52;
  }`, "physical styleBaseRewardWeight");
      break;
    case "lateLight":
      data = replaceInCard(data, "traceCutter", /text: "[^"]*"/, 'text: "造成 15 点伤害。目标已有负面状态各增加 2 层。"', "traceCutter text light");
      data = replaceInCard(data, "traceCutter", /value: 13/, "value: 15", "traceCutter value light");
      data = replaceInCard(data, "xingtianCleave", /text: "[^"]*"/, 'text: "若目标生命不高于 45%，无视格挡斩杀；否则造成 40 点伤害。"', "xingtian text light");
      data = replaceInCard(data, "xingtianCleave", /fallbackDamage: 36/, "fallbackDamage: 40", "xingtian value light");
      data = replaceInCard(data, "tiangangBreak", /text: "[^"]*"/, 'text: "对所有敌人造成 40 点伤害，获得 22 点格挡。"', "tiangang text light");
      data = replaceInCard(data, "tiangangBreak", /value: 36/, "value: 40", "tiangang damage light");
      data = replaceInCard(data, "tiangangBreak", /value: 20/, "value: 22", "tiangang block light");
      break;
    case "lateMed":
      data = replaceInCard(data, "traceCutter", /text: "[^"]*"/, 'text: "造成 16 点伤害。目标已有负面状态各增加 2 层。"', "traceCutter text med");
      data = replaceInCard(data, "traceCutter", /value: 13/, "value: 16", "traceCutter value med");
      data = replaceInCard(data, "xingtianCleave", /text: "[^"]*"/, 'text: "若目标生命不高于 45%，无视格挡斩杀；否则造成 42 点伤害。"', "xingtian text med");
      data = replaceInCard(data, "xingtianCleave", /fallbackDamage: 36/, "fallbackDamage: 42", "xingtian value med");
      data = replaceInCard(data, "tiangangBreak", /text: "[^"]*"/, 'text: "对所有敌人造成 42 点伤害，获得 24 点格挡。"', "tiangang text med");
      data = replaceInCard(data, "tiangangBreak", /rarity: "legendary"/, 'rarity: "epic"', "tiangang rarity med");
      data = replaceInCard(data, "tiangangBreak", /value: 36/, "value: 42", "tiangang damage med");
      data = replaceInCard(data, "tiangangBreak", /value: 20/, "value: 24", "tiangang block med");
      break;
    default:
      throw new Error(`unknown change ${change}`);
  }
  return { data, types, archetypes, simAi };
}

function materialize(candidate) {
  let files = { ...baseline };
  for (const change of candidate.changes) files = applyChange(files, change);
  writeFileSync(paths.data, files.data, "utf8");
  writeFileSync(paths.types, files.types, "utf8");
  writeFileSync(paths.archetypes, files.archetypes, "utf8");
  writeFileSync(paths.simAi, files.simAi, "utf8");
}

function shellQuote(text) {
  const s = String(text);
  return /[\s&()<>|]/.test(s) ? `"${s.replaceAll('"', '\\"')}"` : s;
}

function runCommand(label, command, args, opts = {}) {
  const commandLine = [command, ...args].map(shellQuote).join(" ");
  const startedAt = new Date().toISOString();
  const res = spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], {
    cwd: root,
    encoding: "utf8",
    timeout: opts.timeout ?? 15 * 60 * 1000,
  });
  const finishedAt = new Date().toISOString();
  return {
    label,
    command: commandLine,
    exitCode: res.status ?? 1,
    error: res.error?.message ?? null,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    startedAt,
    finishedAt,
  };
}

function writeCommand(candidateId, suffix, result) {
  const stdout = `${candidateId}_${suffix}.stdout.txt`;
  const stderr = `${candidateId}_${suffix}.stderr.txt`;
  writeFileSync(join(labDir, stdout), result.stdout, "utf8");
  writeFileSync(join(labDir, stderr), result.stderr, "utf8");
  writeFileSync(join(labDir, `${candidateId}_${suffix}.status.json`), JSON.stringify({ ...result, stdout, stderr }, null, 2), "utf8");
}

function parseSimJson(text) {
  try {
    const arr = JSON.parse(text);
    const r = Array.isArray(arr) ? arr[0] : arr;
    return {
      winRate: Number(((r.winRate ?? 0) * 100).toFixed(1)),
      avgFloor: r.avgFloor ?? null,
      timeouts: r.timeouts ?? 0,
      raw: r,
    };
  } catch (error) {
    return { winRate: null, avgFloor: null, timeouts: null, parseError: error.message };
  }
}

function distanceToRange(value, min, max) {
  if (value == null) return 999;
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

function hardEliminationStage1(row) {
  const reasons = [];
  if (!row.validatePass || !row.smokePass) reasons.push("basic test failed");
  for (const key of ["normal80", "normal40", "regular80", "regular40"]) {
    if (row[key]?.winRate == null) reasons.push(`${key} parse failed`);
  }
  if (row.normal80?.winRate > 32) reasons.push("normal physical 80x1 > 32%");
  if (row.normal40?.winRate > 32) reasons.push("normal physical 40x2 > 32%");
  if (row.normal80?.winRate < 12 && row.normal40?.winRate < 12) reasons.push("normal physical both < 12%");
  if (row.regular80?.winRate > 12) reasons.push("regular physical 80x1 > 12%");
  if (row.regular40?.winRate > 12) reasons.push("regular physical 40x2 > 12%");
  if (row.regular80?.winRate < 3 && row.regular40?.winRate < 3) reasons.push("regular physical both < 3%");
  return reasons;
}

function entersStage2(row) {
  const r80 = row.regular80?.winRate ?? -1;
  const r40 = row.regular40?.winRate ?? -1;
  return (r80 >= 5 && r80 <= 10) || (r40 >= 5 && r40 <= 10) || (r80 >= 3 && r40 >= 3);
}

function stage1Sort(row) {
  return {
    reg: distanceToRange(row.regular80?.winRate, 5, 10) + distanceToRange(row.regular40?.winRate, 5, 10),
    normal: distanceToRange(row.normal80?.winRate, 15, 30) + distanceToRange(row.normal40?.winRate, 15, 30),
    modCount: row.modCount,
    sim: row.touchesSimAi ? 1 : 0,
  };
}

function parseBalance(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function stage2Elimination(json80, json40) {
  const reasons = [];
  if (!json80) reasons.push("missing 80x1 json");
  if (!json40) reasons.push("missing 40x2 json");
  const all = [...(json80?.results ?? []), ...(json40?.results ?? [])];
  const nonPhysical = new Set(["spell", "bleed", "shell", "poison", "control"]);
  if (all.some(r => r.mode === "trueMartial" && r.winRate > 2)) reasons.push("trueMartial > 2%");
  if (all.some(r => r.mode === "normal" && r.winRate > 32)) reasons.push("normal > 32%");
  if (all.some(r => r.mode === "regular" && r.winRate > 12)) reasons.push("regular > 12%");
  if (all.some(r => r.mode === "normal" && nonPhysical.has(r.style) && r.winRate < 10)) reasons.push("normal non-physical < 10%");
  if (all.some(r => r.mode === "regular" && nonPhysical.has(r.style) && r.winRate < 2)) reasons.push("regular non-physical < 2%");
  return [...new Set(reasons)];
}

function finalSort(stage1Row) {
  const r80 = stage1Row.regular80?.winRate ?? -999;
  const r40 = stage1Row.regular40?.winRate ?? -999;
  const n80 = stage1Row.normal80?.winRate ?? -999;
  const n40 = stage1Row.normal40?.winRate ?? -999;
  return {
    criterion1: ((r80 >= 5 && r80 <= 10) || (r40 >= 5 && r40 <= 10)) && r80 >= 3 && r40 >= 3 ? 0 : 1,
    criterion2: ((n80 >= 15 && n80 <= 30) || (n40 >= 15 && n40 <= 30)) && n80 >= 12 && n40 >= 12 ? 0 : 1,
    reg: distanceToRange(r80, 5, 10) + distanceToRange(r40, 5, 10),
    normal: distanceToRange(n80, 15, 30) + distanceToRange(n40, 15, 30),
    modCount: stage1Row.modCount,
    sim: stage1Row.touchesSimAi ? 1 : 0,
  };
}

const stage1Rows = [];
for (const candidate of candidates) {
  console.log(`\n=== Stage1 ${candidate.id} ===`);
  const row = { ...candidate, baselineSimHash };
  try {
    materialize(candidate);
    const validate = runCommand("validate:data", "npm", ["run", "validate:data"]);
    writeCommand(candidate.id, "validate", validate);
    const smoke = runCommand("smoke", "npm", ["run", "smoke"]);
    writeCommand(candidate.id, "smoke", smoke);
    row.validatePass = validate.exitCode === 0;
    row.smokePass = smoke.exitCode === 0;
    if (row.validatePass && row.smokePass) {
      const runs = [
        ["regular80", "regular", "80", "1", `${candidate.id}_regular_physical_80x1.json`],
        ["regular40", "regular", "40", "2", `${candidate.id}_regular_physical_40x2.json`],
        ["normal80", "normal", "80", "1", `${candidate.id}_normal_physical_80x1.json`],
        ["normal40", "normal", "40", "2", `${candidate.id}_normal_physical_40x2.json`],
      ];
      for (const [key, mode, runsN, seeds, fileName] of runs) {
        const result = runCommand(key, "node", ["scripts/sim-ai.mjs", `--mode=${mode}`, "--profile=physical", "--strategy=styleAware", `--runs=${runsN}`, `--seeds=${seeds}`, "--seedBase=2026052700", "--json"], { timeout: 20 * 60 * 1000 });
        writeFileSync(join(labDir, fileName), result.stdout, "utf8");
        writeFileSync(join(labDir, fileName.replace(".json", ".stderr.txt")), result.stderr, "utf8");
        writeFileSync(join(labDir, fileName.replace(".json", ".status.json")), JSON.stringify({ ...result, stdout: fileName, stderr: fileName.replace(".json", ".stderr.txt") }, null, 2), "utf8");
        row[key] = parseSimJson(result.stdout);
        row[key].exitCode = result.exitCode;
      }
    }
    row.eliminationReasons = hardEliminationStage1(row);
    row.eliminated = row.eliminationReasons.length > 0;
    row.entersStage2 = !row.eliminated && entersStage2(row);
    row.sort = stage1Sort(row);
    console.log(`${candidate.id}: n80=${row.normal80?.winRate} n40=${row.normal40?.winRate} r80=${row.regular80?.winRate} r40=${row.regular40?.winRate} stage2=${row.entersStage2} elim=${row.eliminationReasons.join(";") || "no"}`);
  } catch (error) {
    row.validatePass = false;
    row.smokePass = false;
    row.eliminated = true;
    row.entersStage2 = false;
    row.eliminationReasons = [error.message];
    console.error(`${candidate.id}: ${error.stack || error.message}`);
  }
  stage1Rows.push(row);
  writeFileSync(join(reviewDir, "CODEX_V313L_STAGE1_PHYSICAL.json"), JSON.stringify({ rows: stage1Rows }, null, 2), "utf8");
}

const stage2Candidates = stage1Rows
  .filter(r => r.entersStage2)
  .sort((a, b) => a.sort.reg - b.sort.reg || a.sort.normal - b.sort.normal || a.sort.modCount - b.sort.modCount || a.sort.sim - b.sort.sim)
  .slice(0, 4);

const stage2Rows = [];
for (const row of stage2Candidates) {
  const candidate = candidates.find(c => c.id === row.id);
  console.log(`\n=== Stage2 ${candidate.id} ===`);
  materialize(candidate);
  const report80 = join(labDir, `${candidate.id}_BALANCE_80x1.md`);
  const json80 = join(labDir, `${candidate.id}_BALANCE_80x1.json`);
  const bal80 = runCommand("balance80", "node", ["scripts/balance-check.mjs", "--runs=80", "--seeds=1", "--seedBase=2026052700", `--reportOut=${report80}`, `--jsonOut=${json80}`], { timeout: 25 * 60 * 1000 });
  writeCommand(candidate.id, "BALANCE_80x1", bal80);
  const report40 = join(labDir, `${candidate.id}_BALANCE_40x2.md`);
  const json40 = join(labDir, `${candidate.id}_BALANCE_40x2.json`);
  const bal40 = runCommand("balance40", "node", ["scripts/balance-check.mjs", "--runs=40", "--seeds=2", "--seedBase=2026052700", `--reportOut=${report40}`, `--jsonOut=${json40}`], { timeout: 25 * 60 * 1000 });
  writeCommand(candidate.id, "BALANCE_40x2", bal40);
  const parsed80 = parseBalance(json80);
  const parsed40 = parseBalance(json40);
  const reasons = stage2Elimination(parsed80, parsed40);
  const s2 = {
    id: candidate.id,
    balance80Exit: bal80.exitCode,
    balance40Exit: bal40.exitCode,
    has80Json: Boolean(parsed80),
    has40Json: Boolean(parsed40),
    has80Report: existsSync(report80),
    has40Report: existsSync(report40),
    eliminated: reasons.length > 0,
    eliminationReasons: reasons,
    results80: parsed80?.results ?? [],
    results40: parsed40?.results ?? [],
    finalSort: finalSort(row),
  };
  stage2Rows.push(s2);
  console.log(`${candidate.id}: balance80=${bal80.exitCode} balance40=${bal40.exitCode} elim=${reasons.join(";") || "no"}`);
  writeFileSync(join(reviewDir, "CODEX_V313L_STAGE2_BALANCE.json"), JSON.stringify({ selectedForStage2: stage2Candidates.map(r => r.id), rows: stage2Rows }, null, 2), "utf8");
}

const safe = stage2Rows
  .filter(r => !r.eliminated)
  .sort((a, b) => a.finalSort.criterion1 - b.finalSort.criterion1 || a.finalSort.criterion2 - b.finalSort.criterion2 || a.finalSort.reg - b.finalSort.reg || a.finalSort.normal - b.finalSort.normal || a.finalSort.modCount - b.finalSort.modCount || a.finalSort.sim - b.finalSort.sim);

const selected = safe[0]?.id ?? "L0_BASELINE";
const selectionReason = safe[0] ? "safe Stage2 candidate selected by priority" : "no safe Stage2 candidate; restored baseline";
materialize(candidates.find(c => c.id === selected) ?? candidates[0]);

writeMarkdown(stage1Rows, stage2Rows, selected, selectionReason, stage2Candidates.map(r => r.id));
writeFileSync(join(reviewDir, "CODEX_V313L_SELECTION.json"), JSON.stringify({ selected, selectionReason, stage2Candidates: stage2Candidates.map(r => r.id), baselineSimHash }, null, 2), "utf8");
console.log(`\nSelected ${selected}: ${selectionReason}`);

function fmtProfile(p) {
  if (!p || p.winRate == null) return "N/A";
  return `${p.winRate}% / floor ${p.avgFloor} / timeout ${p.timeouts}`;
}

function balanceTable(results) {
  let md = "| Mode | Style | WinRate | AvgFloor | Timeout | Status |\n|---|---|---:|---:|---:|---|\n";
  for (const mode of ["normal", "regular", "trueMartial"]) {
    for (const r of results.filter(x => x.mode === mode)) md += `| ${r.mode} | ${r.style} | ${r.winRate}% | ${r.avgFloor} | ${r.timeouts} | ${r.status} |\n`;
  }
  return md;
}

function writeMarkdown(s1, s2, selected, selectionReason, stage2Ids) {
  let md1 = "# CODEX V3.13L Stage1 Physical Matrix\n\n";
  md1 += "| Candidate | Normal 80x1 | Normal 40x2 | Regular 80x1 | Regular 40x2 | Stage2 | Eliminated |\n";
  md1 += "|---|---:|---:|---:|---:|---|---|\n";
  for (const row of s1) {
    md1 += `| ${row.id} | ${fmtProfile(row.normal80)} | ${fmtProfile(row.normal40)} | ${fmtProfile(row.regular80)} | ${fmtProfile(row.regular40)} | ${stage2Ids.includes(row.id) ? "yes" : "no"} | ${row.eliminated ? row.eliminationReasons.join("; ") : "no"} |\n`;
  }
  writeFileSync(join(reviewDir, "CODEX_V313L_STAGE1_PHYSICAL.md"), md1, "utf8");

  let md2 = "# CODEX V3.13L Stage2 Balance Matrix\n\n";
  md2 += `Selected: **${selected}** (${selectionReason})\n\n`;
  if (s2.length === 0) md2 += "No Stage2 candidates.\n";
  for (const row of s2) {
    md2 += `## ${row.id}\n\n`;
    md2 += `Eliminated: ${row.eliminated ? "yes - " + row.eliminationReasons.join("; ") : "no"}\n\n`;
    md2 += "### 80x1\n\n" + balanceTable(row.results80) + "\n";
    md2 += "### 40x2\n\n" + balanceTable(row.results40) + "\n";
  }
  writeFileSync(join(reviewDir, "CODEX_V313L_STAGE2_BALANCE.md"), md2, "utf8");
}
