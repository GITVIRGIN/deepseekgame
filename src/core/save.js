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
    return migrateGame({ ...createInitialState(), ...JSON.parse(raw) });
  } catch {
    return createInitialState();
  }
}

export function saveGame(state) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
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
  run.completedSideTiers = run.completedSideTiers ?? [];
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
