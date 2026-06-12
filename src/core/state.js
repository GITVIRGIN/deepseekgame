import { cards, startingDeck, relics, trueMartialDecks, trueMartialRelics } from "./data.js";
import { createArchetypeAffinity } from "./archetypes.js";
import { createRunGoal, markSpecialGoalBaseline } from "./goals.js";
import { prepareRouteChoice } from "./nodes.js";
import { applyMetaProgression, migrateMeta } from "./progression.js";
import { snapshotMythMastery } from "./myth.js";
import {
  DIFFICULTY_BEGINNER,
  DIFFICULTY_REGULAR,
  DIFFICULTY_TRUE_MARTIAL,
  ROLL_MAX_BEGINNER,
  ROLL_MAX_REGULAR,
  ROLL_MAX_TRUE_MARTIAL,
} from "./types.js";

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
      mythMastery: {},
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

export function startRun(state, trueMartialStyleOrOpts = null, difficulty = null) {
  // CQA-P3-003: support object params { difficulty, trueMartialStyle }
  let tmStyle = null;
  let diff = null;
  if (trueMartialStyleOrOpts && typeof trueMartialStyleOrOpts === "object" && !Array.isArray(trueMartialStyleOrOpts)) {
    const opts = trueMartialStyleOrOpts;
    diff = opts.difficulty ?? null;
    tmStyle = opts.trueMartialStyle ?? null;
  } else {
    tmStyle = trueMartialStyleOrOpts;
    diff = difficulty;
  }

  const next = cloneState(state);
  const seed = (Date.now() >>> 0) || 1;
  next.meta = migrateMeta(next.meta);
  next.run = null;
  if (tmStyle) {
    // CQA-P3-003 safety: detect difficulty constants mis-passed as first arg
    const validStyles = Object.keys(trueMartialDecks);
    const knownDifficulties = [DIFFICULTY_BEGINNER, DIFFICULTY_REGULAR, DIFFICULTY_TRUE_MARTIAL];
    if (knownDifficulties.includes(tmStyle)) {
      // First arg is a difficulty constant, not a TM style
      if (tmStyle === DIFFICULTY_REGULAR) return startRegularRun(next, seed);
      if (tmStyle === DIFFICULTY_TRUE_MARTIAL) {
        // TRUE_MARTIAL without explicit style is invalid — no silent fallback to physical
        next.message = "真武模式需要指定流派。";
        return next;
      }
      return startBeginnerRun(next, seed);
    }
    if (!validStyles.includes(tmStyle)) {
      // Unknown string — let startTrueMartialRun reject it (run stays null, message set)
      return startTrueMartialRun(next, seed, tmStyle);
    }
    return startTrueMartialRun(next, seed, tmStyle);
  }
  if (diff === DIFFICULTY_TRUE_MARTIAL) {
    // CQA-P3-003: TM difficulty without style is invalid
    next.message = "真武模式需要指定流派。";
    return next;
  }
  if (diff === DIFFICULTY_REGULAR) {
    return startRegularRun(next, seed);
  }
  // Default: beginner (backward compatible with old "normal")
  return startBeginnerRun(next, seed);
}

function startBeginnerRun(next, seed) {
  next.run = {
    seed,
    nextUid: 0,
    floor: 1,
    goal: createRunGoal(seed),
    nodeChoices: [],
    currentNode: null,
    archetypeAffinity: createArchetypeAffinity(),
    mythMastery: snapshotMythMastery(next.meta),
    mythStats: { plays: {}, lastAward: null },
    lossStreak: next.meta.lossStreak ?? 0,
    completedSideTiers: {},
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
    difficulty: DIFFICULTY_BEGINNER,
    rollsUsed: 0,
    rollsMax: ROLL_MAX_BEGINNER,
  };

  applyMetaProgression(next.run, next.meta);
  markSpecialGoalBaseline(next.run);
  next.run.deck = startingDeck.map((cardId) => makeCard(next.run, cardId));
  next.meta.totalRuns += 1;
  next.message = "入门旅者，携一卷残箓入山。行旅符微光护身。";

  return prepareRouteChoice(next);
}

function startRegularRun(next, seed) {
  next.run = {
    seed,
    nextUid: 0,
    floor: 1,
    goal: createRunGoal(seed),
    nodeChoices: [],
    currentNode: null,
    archetypeAffinity: createArchetypeAffinity(),
    mythMastery: snapshotMythMastery(next.meta),
    mythStats: { plays: {}, lastAward: null },
    lossStreak: next.meta.lossStreak ?? 0,
    completedSideTiers: {},
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
    difficulty: DIFFICULTY_REGULAR,
    rollsUsed: 0,
    rollsMax: ROLL_MAX_REGULAR,
  };

  applyMetaProgression(next.run, next.meta);
  markSpecialGoalBaseline(next.run);
  next.run.deck = startingDeck.map((cardId) => makeCard(next.run, cardId));
  next.meta.totalRuns += 1;
  next.message = "你踏上山路，背后不再有行旅符的光，唯有手中残箓为凭。";

  return prepareRouteChoice(next);
}

function startTrueMartialRun(state, seed, style) {
  const next = state;
  // V2.6: illegal style — reject, don't fallback
  const deckList = trueMartialDecks[style];
  if (!deckList) {
    next.message = "未知真武流派。";
    return next;
  }
  const relicId = trueMartialRelics[style];

  next.run = {
    seed,
    nextUid: 0,
    floor: 1,
    goal: createRunGoal(seed, true),
    nodeChoices: [],
    currentNode: null,
    archetypeAffinity: createArchetypeAffinity(),
    completedSideTiers: {},
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
    relics: relicId ? [relicId] : [],
    statuses: [],
    combat: null,
    rewards: [],
    finished: false,
    factionAffinity: {},
    trueMartial: true,
    trueMartialStyle: style,
    difficulty: DIFFICULTY_TRUE_MARTIAL,
    rollsUsed: 0,
    rollsMax: ROLL_MAX_TRUE_MARTIAL,
    mythMastery: snapshotMythMastery(next.meta),
    mythStats: { lastAward: null },
    lossStreak: next.meta.lossStreak ?? 0,
  };

  applyMetaProgression(next.run, next.meta);
  next.run.deck = deckList.map((cardId) => makeCard(next.run, cardId));
  next.run.lossStreak = next.meta.lossStreak ?? 0;
  next.meta.totalRuns += 1;
  next.message = `真武降临——你以${style}之名入山。`;
  return prepareRouteChoice(next);
}

// V2.6: Normal relics required to unlock True Martial (exclude TM-only, unimplemented)
export function normalUnlockRelics() {
  return Object.values(relics).filter(r =>
    r.implemented !== false &&
    r.trueMartialOnly !== true &&
    !r.text?.includes("真武专属")
  );
}

export function isTrueMartialUnlocked(meta) {
  const mastery = meta?.mythMastery ?? {};
  const normalRelicIds = normalUnlockRelics().map(r => r.id);
  const allNormalRelics = normalRelicIds.every(id => (meta.collectedRelics || []).includes(id));
  const threeAtThree = Object.values(mastery).filter(v => v >= 3).length >= 3;
  return allNormalRelics && threeAtThree;
}

export function canShowTrueMartialEntry(state) {
  if (!state || !state.meta) return false;
  if (state.phase !== "home" && state.phase !== "gameOver") return false;
  return isTrueMartialUnlocked(state.meta);
}
