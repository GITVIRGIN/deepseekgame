import { MAX_FLOOR, TARGET_MINUTES, TRUE_MARTIAL_MAX_FLOOR } from "./types.js";
import { relics } from "./data.js";
import { awardMythMasteryForRunEnd, mythAwardText } from "./myth.js";

const SPECIAL_GOAL_CHANCE = 10;

export function createRunGoal(seed = 0, isTM = false) {
  const specialActive = specialGoalRoll(seed) < SPECIAL_GOAL_CHANCE;
  const maxFloor = isTM ? TRUE_MARTIAL_MAX_FLOOR : MAX_FLOOR;

  return {
    targetMinutes: TARGET_MINUTES,
    main: {
      id: "defeatFinalBoss",
      title: "击败关底 Boss",
      text: `在 ${maxFloor} 层击败${isTM ? "虚渊主宰" : "黑山老妖"}。`,
    },
    special: {
      id: "completeXuanlu",
      title: "补全玄箓",
      text: "在异兆出现的一局内收集 2 枚玄箓残片，可提前完成特殊通关。",
      requiredFragments: 2,
      chance: SPECIAL_GOAL_CHANCE,
      active: specialActive,
      fragments: 0,
      startingRelics: [],
    },
    completedBy: null,
  };
}

export function migrateRunGoal(run) {
  // V2.5: detect TM before creating default goal
  const isTM = Boolean(run.trueMartial || run.difficulty === "trueMartial");
  run.goal = run.goal ?? createRunGoal(run.seed ?? 0, isTM);
  const template = createRunGoal(run.seed ?? 0, isTM);
  const previousSpecial = run.goal.special ?? {};
  const hasStartingRelicBaseline = Array.isArray(previousSpecial.startingRelics);
  run.goal.targetMinutes = run.goal.targetMinutes ?? template.targetMinutes;
  // V2.5: template wins over old stale values
  run.goal.main = { ...(run.goal.main ?? {}), ...template.main };
  run.goal.special = {
    ...template.special,
    ...previousSpecial,
    title: template.special.title,
    text: template.special.text,
  };

  if (typeof run.goal.special.active !== "boolean") {
    run.goal.special.active = template.special.active;
  }

  if (typeof run.goal.special.requiredFragments !== "number") {
    run.goal.special.requiredFragments = run.goal.special.requiredRelics ?? template.special.requiredFragments;
  }

  if (typeof run.goal.special.fragments !== "number") {
    run.goal.special.fragments = 0;
  }

  if (!hasStartingRelicBaseline) {
    run.goal.special.startingRelics = [...(run.relics ?? [])];
  }

  return run.goal;
}

export function markSpecialGoalBaseline(run) {
  const goal = migrateRunGoal(run);
  goal.special.startingRelics = [...(run.relics ?? [])];
  return goal;
}

export function goalProgress(run) {
  const goal = migrateRunGoal(run);
  const requiredFragments = goal.special.requiredFragments ?? 2;
  const collectedFragments = specialFragmentCount(goal);
  const maxFloor = run.trueMartial ? TRUE_MARTIAL_MAX_FLOOR : MAX_FLOOR;
  return {
    floor: `${Math.min(run.floor, maxFloor)}/${maxFloor}`,
    targetMinutes: goal.targetMinutes,
    special: `${collectedFragments}/${requiredFragments}`,
    specialActive: goal.special.active,
    specialChance: goal.special.chance ?? SPECIAL_GOAL_CHANCE,
    specialReady: goal.special.active && collectedFragments >= requiredFragments,
  };
}

export function canOfferSpecialFragment(run) {
  if (!run || run.finished) return false;
  const goal = migrateRunGoal(run);
  const requiredFragments = goal.special.requiredFragments ?? 2;
  return goal.special.active && specialFragmentCount(goal) < requiredFragments;
}

function grantTrueMartialRelic(state) {
  if (!state.run?.trueMartial) return;
  // V2.5: exclude unimplemented relics
  const allTM = Object.values(relics).filter(r =>
    (r.trueMartialOnly || r.text?.includes("真武专属")) && r.implemented !== false
  );
  const owned = state.meta.collectedRelics ?? [];
  const available = allTM.filter(r => !owned.includes(r.id));
  if (available.length === 0) return;
  const relic = available[Math.floor(Math.abs(state.run.seed * 7 + state.meta.wins * 13) % available.length)];
  state.meta.collectedRelics = [...new Set([...owned, relic.id])];
  state.message += ` 真武馈赠：获得专属遗物「${relic.name}」。`;
}

export function grantSpecialFragment(run, amount = 1) {
  const goal = migrateRunGoal(run);
  const requiredFragments = goal.special.requiredFragments ?? 2;
  const next = Math.min(requiredFragments, specialFragmentCount(goal) + amount);
  goal.special.fragments = next;
  return { fragments: next, required: requiredFragments };
}

export function completeRunVictory(state, completedBy, message) {
  const run = state.run;
  if (!run || run.finished) return state;

  const mythAward = awardMythMasteryForRunEnd(state, completedBy);
  run.finished = true;
  migrateRunGoal(run);
  run.goal.completedBy = completedBy;
  // Clean up all intermediate state
  run.combat = null;
  run.rewards = [];
  run.pendingPurge = null;
  run.pendingChoice = null;
  state.phase = "gameOver";
  state.message = mythAward ? `${message} ${mythAwardText(mythAward)}` : message;
  state.meta.wins += 1;
  state.meta.soul += completedBy === "special" ? 22 : 30;
  state.meta.lossStreak = 0;
  state.meta.collectedRelics = [...new Set([...(state.meta.collectedRelics ?? []), ...(run.relics ?? [])])];
  grantTrueMartialRelic(state);
  return state;
}

export function checkSpecialGoal(state) {
  const run = state.run;
  if (!run || run.finished) return state;

  migrateRunGoal(run);
  const progress = goalProgress(run);
  if (progress.specialReady) {
    return completeRunVictory(state, "special", "玄箓补全，山路自开。你完成了特殊通关。");
  }

  return state;
}

function specialFragmentCount(goal) {
  return Math.max(0, Number(goal.special.fragments ?? 0));
}

function specialGoalRoll(seed) {
  let value = seed >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value = (value ^ (value >>> 15)) >>> 0;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value % 100;
}
