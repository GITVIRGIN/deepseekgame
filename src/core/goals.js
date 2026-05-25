import { MAX_FLOOR, TARGET_MINUTES } from "./types.js";
import { relics, rarityInfo } from "./data.js";
import { weightedChoice } from "./rng.js";

const SPECIAL_GOAL_CHANCE = 10;

export function createRunGoal(seed = 0) {
  const specialActive = specialGoalRoll(seed) < SPECIAL_GOAL_CHANCE;

  return {
    targetMinutes: TARGET_MINUTES,
    main: {
      id: "defeatFinalBoss",
      title: "击败关底 Boss",
      text: `在 ${MAX_FLOOR} 层击败黑山老妖。`,
    },
    special: {
      id: "completeXuanlu",
      title: "补全玄箓",
      text: "在一局内收集 2 件遗物，可提前完成特殊通关。",
      requiredRelics: 2,
      chance: SPECIAL_GOAL_CHANCE,
      active: specialActive,
      startingRelics: [],
    },
    completedBy: null,
  };
}

export function migrateRunGoal(run) {
  run.goal = run.goal ?? createRunGoal(run.seed ?? 0);
  const template = createRunGoal(run.seed ?? 0);
  const previousSpecial = run.goal.special ?? {};
  const hasStartingRelicBaseline = Array.isArray(previousSpecial.startingRelics);
  run.goal.targetMinutes = run.goal.targetMinutes ?? template.targetMinutes;
  run.goal.main = { ...template.main, ...(run.goal.main ?? {}) };
  run.goal.special = { ...template.special, ...previousSpecial };

  if (typeof run.goal.special.active !== "boolean") {
    run.goal.special.active = template.special.active;
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
  const requiredRelics = goal.special.requiredRelics ?? 2;
  const collectedRelics = specialRelicCount(run, goal);
  return {
    floor: `${Math.min(run.floor, MAX_FLOOR)}/${MAX_FLOOR}`,
    targetMinutes: goal.targetMinutes,
    special: `${collectedRelics}/${requiredRelics}`,
    specialActive: goal.special.active,
    specialChance: goal.special.chance ?? SPECIAL_GOAL_CHANCE,
    specialReady: goal.special.active && collectedRelics >= requiredRelics,
  };
}

export function completeRunVictory(state, completedBy, message) {
  const run = state.run;
  if (!run || run.finished) return state;

  run.finished = true;
  migrateRunGoal(run);
  run.goal.completedBy = completedBy;
  run.combat = null;
  state.phase = "gameOver";

  if (completedBy === "boss") {
    const relic = rollVictoryRelic(run);
    if (relic) {
      run.relics.push(relic.id);
      state.message = `${message} 黑山崩塌处，一件遗物缓缓浮现——${relic.name}。`;
    } else {
      state.message = message;
    }
  } else {
    state.message = message;
  }

  state.meta.wins += 1;
  state.meta.soul += completedBy === "special" ? 22 : 30;
  return state;
}

function rollVictoryRelic(run) {
  const available = Object.values(relics).filter((relic) => !run.relics.includes(relic.id));
  if (available.length === 0) return null;
  return weightedChoice(run, available, (relic) => rarityInfo[relic.rarity].weight);
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

function specialRelicCount(run, goal) {
  const startingRelics = new Set(goal.special.startingRelics ?? []);
  return (run.relics ?? []).filter((relicId) => !startingRelics.has(relicId)).length;
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
