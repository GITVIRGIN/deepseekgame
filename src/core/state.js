import { cards, startingDeck } from "./data.js";
import { createArchetypeAffinity } from "./archetypes.js";
import { createRunGoal, markSpecialGoalBaseline } from "./goals.js";
import { prepareRouteChoice } from "./nodes.js";
import { applyMetaProgression, migrateMeta } from "./progression.js";

export function createInitialState() {
  return {
    phase: "home",
    run: null,
    meta: {
      soul: 0,
      totalRuns: 0,
      wins: 0,
      lossStreak: 0,
      talents: {},
    },
    message: "山门未启。",
  };
}

export function cloneState(state) {
  return structuredClone(state);
}

export function nextUid(run, prefix) {
  run.nextUid += 1;
  return `${prefix}_${run.nextUid}`;
}

export function makeCard(run, cardId) {
  if (!cards[cardId]) {
    throw new Error(`未知卡牌：${cardId}`);
  }

  return {
    uid: nextUid(run, "card"),
    cardId,
  };
}

export function startRun(state) {
  const next = cloneState(state);
  const seed = (Date.now() >>> 0) || 1;
  next.meta = migrateMeta(next.meta);

  next.run = {
    seed,
    nextUid: 0,
    floor: 1,
    goal: createRunGoal(seed),
    nodeChoices: [],
    currentNode: null,
    archetypeAffinity: createArchetypeAffinity(),
    completedSideTiers: [],
    finalSideCompleted: false,
    shopTiers: [],
    visitedShopTiers: [],
    finalShopVisited: false,
    shopStock: [],
    pendingChoice: null,
    guaranteedNextHand: [],
    retainedHand: [],
    lastGoldDrop: 0,
    hp: 72,
    maxHp: 72,
    gold: 0,
    energy: 3,
    maxEnergy: 3,
    handLimit: 5,
    deckLimit: 30,
    deck: [],
    relics: [],
    statuses: [],
    combat: null,
    rewards: [],
    finished: false,
  };

  applyMetaProgression(next.run, next.meta);
  markSpecialGoalBaseline(next.run);
  next.run.deck = startingDeck.map((cardId) => makeCard(next.run, cardId));
  next.run.lossStreak = next.meta.lossStreak ?? 0;
  next.meta.totalRuns += 1;
  next.message = "你携一卷残箓入山。";

  return prepareRouteChoice(next);
}
