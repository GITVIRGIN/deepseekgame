import { cards, startingDeck, factionMasteryInfo, MAX_FACTION_MASTERY } from "./data.js";
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
      factionMastery: {},
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
      factionAffinity: {},
    };

  applyMetaProgression(next.run, next.meta);
  markSpecialGoalBaseline(next.run);
  next.run.deck = startingDeck.map((cardId) => makeCard(next.run, cardId));
  next.run.lossStreak = next.meta.lossStreak ?? 0;
    applyFactionBonuses(next.run, next.meta);
    next.meta.totalRuns += 1;
  next.message = "你携一卷残箓入山。";

  return prepareRouteChoice(next);
}

function applyFactionBonuses(run, meta) {
  const mastery = meta.factionMastery ?? {};
  const factions = Object.keys(factionMasteryInfo);
  for (const faction of factions) {
    const level = mastery[faction] ?? 0;
    if (level <= 0) continue;
    if (faction === "天庭") {
      // spirit at combat start - applied in combat.js
    } else if (faction === "人间") {
      run.maxHp += level * 3;
      run.hp += level * 3;
    } else if (faction === "昆仑") {
      run.handLimit = (run.handLimit ?? 5) + level;
    } else if (faction === "龙宫") {
      run.gold += level * 10;
    }
    // 幽冥, 山海, 洪荒, 妖 bonuses applied dynamically in combat
  }
}
