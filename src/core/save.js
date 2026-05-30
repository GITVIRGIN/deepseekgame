import { createInitialState } from "./state.js";
import { migrateArchetypes } from "./archetypes.js";
import { createRunGoal, migrateRunGoal } from "./goals.js";
import { ensureShopTiers, prepareRouteChoice } from "./nodes.js";
import { migrateMeta } from "./progression.js";
import { ensureMythStats, snapshotMythMastery } from "./myth.js";

const SAVE_KEY = "xuanlu-ds-game-state";

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createInitialState();
    return migrateGameState(JSON.parse(raw));
  } catch {
    return createInitialState();
  }
}

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("存档写入失败:", e.message);
  }
  return state;
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

function migrateSideTiers(value) {
  if (Array.isArray(value)) {
    const obj = {};
    for (const t of value) obj[t] = 1;
    return obj;
  }
  return value ?? {};
}

export function migrateGameState(state) {
  if (!state) return createInitialState();
  let next = structuredClone(state);
  next.meta = next.meta ?? {};
  next.meta.mythMastery = next.meta.mythMastery ?? {};
  if (next.meta.factionMastery) {
    next.meta.mythMastery = { ...next.meta.mythMastery, ...next.meta.factionMastery };
    delete next.meta.factionMastery;
  }
  next.meta.collectedRelics = next.meta.collectedRelics ?? [];
  next.meta.soul = next.meta.soul ?? 0;
  next.meta.totalRuns = next.meta.totalRuns ?? 0;
  next.meta.wins = next.meta.wins ?? 0;
  next.meta.lossStreak = next.meta.lossStreak ?? 0;
  next.meta.talents = next.meta.talents ?? {};
  return next;
}

function migrateGame(state) {
  state.meta = migrateMeta(state.meta);

  const run = state.run;
  if (!run) return state;

  run.goal = run.goal ?? createRunGoal(run.seed ?? 0);
  migrateRunGoal(run);
  run.handLimit = run.handLimit ?? 5;
  run.deckLimit = run.deckLimit ?? 30;
  run.maxEnergy = run.maxEnergy ?? 3;
  run.energy = run.energy ?? run.maxEnergy;
  run.nodeChoices = run.nodeChoices ?? [];
  run.currentNode = run.currentNode ?? null;
  run.lossStreak = run.lossStreak ?? state.meta.lossStreak ?? 0;
  run.completedSideTiers = migrateSideTiers(run.completedSideTiers);
  run.finalSideCompleted = Boolean(run.finalSideCompleted);
  run.visitedShopTiers = run.visitedShopTiers ?? [];
  run.finalShopVisited = Boolean(run.finalShopVisited);
  run.shopStock = run.shopStock ?? [];
  run.pendingChoice = run.pendingChoice ?? null;
  run.guaranteedNextHand = run.guaranteedNextHand ?? [];
  run.retainedHand = run.retainedHand ?? [];
  run.lastGoldDrop = run.lastGoldDrop ?? 0;
  run.mythMastery = run.mythMastery ?? snapshotMythMastery(state.meta);
  ensureMythStats(run);
  migrateArchetypes(run);
  ensureShopTiers(run);

  if (state.phase === "route") {
    prepareRouteChoice(state);
  }

  return state;
}
