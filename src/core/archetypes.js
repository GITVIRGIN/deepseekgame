import { cards as allCards, styleInfo } from "./data.js";
import { difficultyTuning } from "./types.js";

export const STYLE_IDS = ["physical", "spell", "bleed", "shell", "poison", "control"];
const STYLE_SET = new Set(STYLE_IDS);

export const FUSION_ORDER = ["physical", "spell", "bleed", "poison", "control", "shell"];

export const DUAL_FUSION_PAIRS = [
  ["physical", "spell"],
  ["spell", "bleed"],
  ["bleed", "poison"],
  ["poison", "control"],
  ["control", "shell"],
  ["physical", "shell"],
];

export const FUSION_ROUTE_KEYS = DUAL_FUSION_PAIRS.map((pair) => canonicalFusionKey(pair));

export const TRIPLE_FUSION_TRIPLES = [
  ["physical", "spell", "bleed"],
  ["spell", "bleed", "poison"],
  ["bleed", "poison", "control"],
  ["poison", "control", "shell"],
  ["physical", "control", "shell"],
  ["physical", "spell", "shell"],
];

export const FORMATION_BUCKETS = [
  "noFusion",
  "dualEntry",
  "dualCommit",
  "dualFormed",
  "dualHighroll",
  "dualMastered",
  "tripleFormed",
];

export function canonicalFusionKey(styles) {
  const sorted = [...new Set(styles)]
    .filter((style) => STYLE_SET.has(style))
    .sort((a, b) => FUSION_ORDER.indexOf(a) - FUSION_ORDER.indexOf(b));
  return sorted.join("+");
}

export function createArchetypeAffinity() {
  return Object.fromEntries(STYLE_IDS.map((styleId) => [styleId, 0]));
}

export function migrateArchetypes(run) {
  run.archetypeAffinity = run.archetypeAffinity ?? {};
  for (const styleId of STYLE_IDS) {
    run.archetypeAffinity[styleId] = run.archetypeAffinity[styleId] ?? 0;
  }
  return run;
}

export function recordCardArchetype(run, card) {
  if (!card?.style || !STYLE_SET.has(card.style)) return null;
  migrateArchetypes(run);
  const gain = 2 + (card.grade ?? 1);
  run.archetypeAffinity[card.style] += gain;
  if (card.fusionStyles) {
    for (const fs of card.fusionStyles) {
      if (STYLE_SET.has(fs)) run.archetypeAffinity[fs] += gain;
    }
  }
  return { style: card.style, gain, total: run.archetypeAffinity[card.style] };
}

export function dominantArchetype(run) {
  migrateArchetypes(run);
  const ranked = archetypeRanking(run);
  const best = ranked[0];
  if (!best || best.score <= 0) return null;
  return best;
}

export function archetypeRanking(run) {
  migrateArchetypes(run);
  return STYLE_IDS.map((style) => ({ style, score: run.archetypeAffinity[style] ?? 0 }))
    .sort((left, right) => right.score - left.score);
}

export function archetypeRewardWeight(run, card) {
  if (!card?.style) return 0.45;
  migrateArchetypes(run);
  const score = run.archetypeAffinity[card.style] ?? 0;
  const dominant = dominantArchetype(run);
  const floor = run.floor ?? 1;
  const pressure = floor >= 13 ? 0.18 : floor >= 7 ? 0.1 : 0.035;
  const dominantBonus = dominant?.style === card.style ? (floor >= 13 ? 1.32 : floor >= 7 ? 1.16 : 1.04) : 1;
  const baseWeight = styleBaseRewardWeight(run, card.style, dominant, score, floor);
  const tune = difficultyTuning[run.difficulty] || difficultyTuning.beginner;
  const styleMultKey = card.style + "RewardMult";
  const styleMult = tune[styleMultKey] ?? 1;
  const focusMult = tune.rewardFocusMult ?? 1;
  return Math.min(4.2, baseWeight * (1 + score * pressure) * dominantBonus * focusMult * styleMult);
}

export function shouldGuaranteeArchetype(run, tier) {
  const dominant = dominantArchetype(run);
  if (!dominant) return false;
  const threshold = { bleed: 8, physical: 7, shell: 10, poison: 8, spell: 8, control: 10 }[dominant.style] ?? 9;
  return tier >= 2 && dominant.score >= threshold;
}

export function deckStyleScores(run, cardDefs = allCards) {
  const scores = Object.fromEntries(STYLE_IDS.map(s => [s, 0]));
  if (!run?.deck) return scores;

  for (const inst of run.deck) {
    const card = cardDefs[inst.cardId];
    if (!card) continue;
    const base = 2 + (card.grade ?? 1);
    if (STYLE_SET.has(card.style)) scores[card.style] += base;
    if (card.fusionStyles) {
      for (const fs of card.fusionStyles) {
        if (STYLE_SET.has(fs)) scores[fs] += base;
      }
    }
  }
  migrateArchetypes(run);
  for (const sid of STYLE_IDS) {
    scores[sid] = (scores[sid] ?? 0) + Math.max(0, run.archetypeAffinity?.[sid] ?? 0);
    if (!Number.isFinite(scores[sid])) scores[sid] = 0;
  }
  if (STYLE_SET.has(run.trueMartialStyle)) {
    scores[run.trueMartialStyle] += 3;
  }
  return scores;
}

// Bridge styles: the two adjacent styles in the fusion ring for the given top style
export function bridgeStyles(topStyle) {
  const idx = FUSION_ORDER.indexOf(topStyle);
  if (idx < 0) return [];
  const prev = FUSION_ORDER[(idx + 5) % 6];
  const next = FUSION_ORDER[(idx + 1) % 6];
  return [prev, next];
}

export const FUSION_STAGES = ["base", "commit", "formed", "highrollA", "highrollB", "mastery"];

export function fusionRouteProgress(run, cardDefs = allCards) {
  const progress = Object.fromEntries(FUSION_ROUTE_KEYS.map((routeKey) => {
    const routeStyles = routeKey.split("+");
    return [routeKey, {
      routeKey,
      routeCardCount: 0,
      baseCount: 0,
      commitCount: 0,
      formedCount: 0,
      highrollACount: 0,
      highrollBCount: 0,
      masteryCount: 0,
      hasBase: false,
      hasCommit: false,
      hasFormed: false,
      hasHighrollA: false,
      hasHighrollB: false,
      hasMastery: false,
      firstRouteCardFloor: null,
      stageCounts: { base: 0, commit: 0, formed: 0, highrollA: 0, highrollB: 0, mastery: 0 },
      routeStyles,
    }];
  }));

  for (const inst of run?.deck || []) {
    const card = cardDefs[inst.cardId];
    if (card?.fusionTier !== 2) continue;
    const routeKey = card.fusionRoute || canonicalFusionKey(card.fusionStyles || []);
    if (!progress[routeKey]) continue;
    const route = progress[routeKey];
    const stage = card.fusionStage;
    route.routeCardCount += 1;
    if (FUSION_STAGES.includes(stage)) {
      route.stageCounts[stage] += 1;
    }
    route.baseCount = route.stageCounts.base;
    route.commitCount = route.stageCounts.commit;
    route.formedCount = route.stageCounts.formed;
    route.highrollACount = route.stageCounts.highrollA;
    route.highrollBCount = route.stageCounts.highrollB;
    route.masteryCount = route.stageCounts.mastery;
    route.hasBase = route.baseCount > 0;
    route.hasCommit = route.commitCount > 0;
    route.hasFormed = route.formedCount > 0;
    route.hasHighrollA = route.highrollACount > 0;
    route.hasHighrollB = route.highrollBCount > 0;
    route.hasMastery = route.masteryCount > 0;
    if (Number.isFinite(inst.acquiredFloor)) {
      route.firstRouteCardFloor = route.firstRouteCardFloor === null
        ? inst.acquiredFloor
        : Math.min(route.firstRouteCardFloor, inst.acquiredFloor);
    }
  }

  return progress;
}

export function bestFusionRoute(progress) {
  return Object.values(progress || {}).sort((left, right) => {
    if (right.routeCardCount !== left.routeCardCount) return right.routeCardCount - left.routeCardCount;
    if (Number(right.hasBase) !== Number(left.hasBase)) return Number(right.hasBase) - Number(left.hasBase);
    return left.routeKey.localeCompare(right.routeKey);
  })[0] ?? null;
}

export function fusionStateBucket(run, cardDefs = allCards) {
  // tripleFormed: has any fusionTier 3 card in deck (obtained via heavenly trigger)
  if ((run?.deck || []).some((inst) => cardDefs[inst.cardId]?.fusionTier === 3 && !cardDefs[inst.cardId]?.heavenlyTrigger)) return "tripleFormed";
  const progress = fusionRouteProgress(run, cardDefs);
  const routes = Object.values(progress);
  // dualMastered: routeCardCount >= 6, hasBase, hasFormed, hasMastery
  if (routes.some((route) => route.hasBase && route.hasFormed && route.hasMastery && route.routeCardCount >= 6)) return "dualMastered";
  // dualHighroll: routeCardCount 4-5, hasBase, hasFormed
  if (routes.some((route) => route.hasBase && route.hasFormed && route.routeCardCount >= 4 && route.routeCardCount <= 5)) return "dualHighroll";
  // dualFormed: routeCardCount >= 3, hasBase, hasFormed
  if (routes.some((route) => route.hasBase && route.hasFormed && route.routeCardCount >= 3)) return "dualFormed";
  // dualCommit: routeCardCount >= 2
  if (routes.some((route) => route.routeCardCount >= 2)) return "dualCommit";
  // dualEntry: routeCardCount >= 1
  if (routes.some((route) => route.routeCardCount >= 1)) return "dualEntry";
  return "noFusion";
}

export function masteredFusionRoutes(run, cardDefs = allCards) {
  return Object.values(fusionRouteProgress(run, cardDefs))
    .filter((route) => route.hasBase && route.hasFormed && route.hasMastery && route.routeCardCount >= 6);
}

export function tripleAdjacentRoutes(tripleStyles) {
  return DUAL_FUSION_PAIRS
    .map((pair) => canonicalFusionKey(pair))
    .filter((routeKey) => routeKey.split("+").every((style) => tripleStyles.includes(style)));
}

export function thirdStyleForTripleRoute(tripleStyles, routeKey) {
  const routeStyles = new Set(routeKey.split("+"));
  return tripleStyles.find((style) => !routeStyles.has(style)) ?? null;
}

export function thirdStyleKeyInfo(run, tripleStyles, masteredRouteKey, cardDefs = allCards) {
  const thirdStyle = thirdStyleForTripleRoute(tripleStyles, masteredRouteKey);
  if (!thirdStyle || !STYLE_SET.has(thirdStyle)) {
    return { achieved: false, strong: false, weak: false, thirdStyle: null, masteredRouteKey };
  }

  const deck = run?.deck || [];
  const thirdStyleCards = deck
    .map((inst) => cardDefs[inst.cardId])
    .filter((card) => card && !card.fusionStyles && card.style === thirdStyle);
  const strongCard = thirdStyleCards.some((card) => card.trueMartial && (card.grade ?? 1) >= 2);
  const scoreKey = (deckStyleScores(run, cardDefs)[thirdStyle] ?? 0) >= 8;
  const weakKey = (run?.floor ?? 1) >= 19 && thirdStyleCards.length > 0;
  const strong = strongCard || scoreKey;

  return {
    achieved: strong || weakKey,
    strong,
    weak: weakKey && !strong,
    thirdStyle,
    masteredRouteKey,
  };
}

// T2-A5: stage gating helper used by eligibleDualRouteCards
export function routeStageAllowed(run, card, cardDefs = allCards) {
  if (!run) return false;
  const floor = run.floor ?? 1;
  if (floor <= 4) return false;
  if (card.fusionTier !== 2) return false;
  const progress = fusionRouteProgress(run, cardDefs);
  const route = progress[card.fusionRoute];
  if (!route) return card.fusionStage === "base";
  const stage = card.fusionStage;

  if (floor <= 6) return stage === "base";
  if (floor <= 9) return stage === "base" || (stage === "commit" && route.hasBase);
  if (floor <= 14) {
    if (stage === "base") return true;
    if (stage === "commit") return route.hasBase;
    if (stage === "formed") return route.hasBase && route.routeCardCount >= 2;
    return false;
  }
  // floor 15+: mastery allowed from routeCardCount>=4 with hasHighroll or rc>=5
  if (stage === "mastery") {
    return route.hasBase && route.hasFormed && route.routeCardCount >= 4 &&
      (route.hasHighrollA || route.hasHighrollB || route.routeCardCount >= 5);
  }
  if (stage === "highrollA" || stage === "highrollB") {
    return route.hasBase && route.hasFormed && route.routeCardCount >= 3;
  }
  if (stage === "formed") return route.hasBase && route.routeCardCount >= 2;
  if (stage === "commit") return route.hasBase;
  return stage === "base";
}

export function eligibleDualRouteCards(run, cardDefs = allCards) {
  const floor = run?.floor ?? 1;
  if (floor <= 4) return [];
  const eligibleRouteKeys = new Set(eligibleDualFusions(run, cardDefs).map((pair) => canonicalFusionKey(pair)));
  const progress = fusionRouteProgress(run, cardDefs);

  return Object.values(cardDefs).filter((card) => {
    if (card.fusionTier !== 2 || !card.fusionRoute || !FUSION_ROUTE_KEYS.includes(card.fusionRoute)) return false;
    const route = progress[card.fusionRoute];
    const stage = card.fusionStage;

    // base needs initial dual-style gate
    if (stage === "base" && !eligibleRouteKeys.has(card.fusionRoute)) return false;
    // non-base needs continuation (hasBase)
    if (stage !== "base" && !route?.hasBase) return false;

    return routeStageAllowed(run, card, cardDefs);
  });
}

// T2-A3: eligible heavenly trigger cards based on mastered routes
export function eligibleHeavenlyTriggers(run, cardDefs = allCards) {
  const floor = run?.floor ?? 1;
  if (floor < 15) return [];

  const mastered = masteredFusionRoutes(run, cardDefs);
  if (mastered.length === 0) return [];

  const masteredKeys = new Set(mastered.map((r) => r.routeKey));
  const alreadyHaveTriple = new Set(
    (run?.deck || [])
      .filter((inst) => cardDefs[inst.cardId]?.fusionTier === 3 && !cardDefs[inst.cardId]?.heavenlyTrigger)
      .map((inst) => inst.cardId)
  );

  return Object.values(cardDefs).filter((card) => {
    if (!card.heavenlyTrigger || !card.triggerTripleCardId) return false;
    if (!Array.isArray(card.triggerRoutes) || card.triggerRoutes.length < 2) return false;
    // Check if any mastered route matches this trigger's routes
    if (!card.triggerRoutes.some((routeKey) => masteredKeys.has(routeKey))) return false;
    // If player already has the target triple, heavily deprioritize
    if (alreadyHaveTriple.has(card.triggerTripleCardId)) return false;
    return true;
  });
}

// T2-A1: eligible dual fusion pairs based on deck scores and floor
export function eligibleDualFusions(run, cards) {
  const floor = run.floor ?? 1;
  if (floor <= 4) return [];

  const scores = deckStyleScores(run, cards);
  return DUAL_FUSION_PAIRS.filter(([a, b]) => {
    const sa = scores[a] ?? 0;
    const sb = scores[b] ?? 0;
    const high = Math.max(sa, sb);
    const low = Math.min(sa, sb);

    if (floor <= 6) {
      return (high >= 14 && low >= 5) || (sa >= 7 && sb >= 7);
    }
    if (floor <= 14) {
      return (high >= 12 && low >= 4) || (sa >= 7 && sb >= 7);
    }
    return (high >= 10 && low >= 4) || (sa >= 6 && sb >= 6);
  });
}

export function eligibleTripleFusions(run, cards) {
  return [];
}

export function styleLabel(styleId) {
  return styleInfo[styleId]?.label ?? styleId;
}

function styleBaseRewardWeight(run, styleId, dominant, score, floor) {
  if (styleId === "physical") {
    if (dominant?.style === "physical" && score >= 9) return floor >= 13 ? 1.1 : floor >= 7 ? 0.9 : 0.6;
    if (score >= 5) return 0.55;
    return 0.45;
  }
  if (styleId === "shell") {
    const lossStreak = run.lossStreak ?? 0;
    if (lossStreak >= 3) return floor >= 7 ? 0.94 : 0.72;
    if (dominant?.style === "shell" && score >= 10) return floor >= 13 ? 0.92 : floor >= 7 ? 0.78 : 0.5;
    if (score >= 6) return floor >= 7 ? 0.55 : 0.42;
    return 0.28;
  }
  if (styleId === "poison") {
    if (dominant?.style === "poison" && score >= 8) return floor >= 13 ? 1.16 : floor >= 7 ? 1.06 : 0.68;
    if (score >= 5) return floor >= 7 ? 0.8 : 0.6;
    return 0.54;
  }
  if (styleId === "spell") {
    if (dominant?.style === "spell" && score >= 8) return floor >= 13 ? 1.18 : floor >= 7 ? 1.08 : 0.74;
    if (score >= 5) return floor >= 7 ? 0.84 : 0.64;
    return 0.70;
  }
  if (styleId === "control") {
    if (dominant?.style === "control" && score >= 10) return floor >= 13 ? 1.02 : floor >= 7 ? 0.88 : 0.48;
    if (score >= 5) return floor >= 7 ? 0.66 : 0.42;
    return 0.40;
  }
  if (styleId !== "bleed") return 1;
  if (dominant?.style === "bleed" && score >= 8) return floor >= 13 ? 1.18 : floor >= 7 ? 1.08 : 0.7;
  if (score >= 5) return floor >= 7 ? 0.82 : 0.62;
  return 0.52;
}
