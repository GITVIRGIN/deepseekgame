import { cards, rarityInfo, relics } from "./data.js";
import {
  archetypeRewardWeight,
  dominantArchetype,
  migrateArchetypes,
  recordCardArchetype,
  shouldGuaranteeArchetype,
  styleLabel,
  deckStyleScores,
  eligibleDualFusions,
  eligibleDualRouteCards,
  eligibleTripleFusions,
  eligibleHeavenlyTriggers,
  canonicalFusionKey,
  bridgeStyles,
  DUAL_FUSION_PAIRS,
  FUSION_ROUTE_KEYS,
  fusionRouteProgress,
  masteredFusionRoutes,
  thirdStyleForTripleRoute,
  thirdStyleKeyInfo,
  tripleAdjacentRoutes,
} from "./archetypes.js";
import { canOfferSpecialFragment, checkSpecialGoal, grantSpecialFragment } from "./goals.js";
import { finishCurrentNode, prepareRouteChoice, tierForFloor } from "./nodes.js";
import { random, weightedChoice } from "./rng.js";
import { MAX_FLOOR, MIN_DECK_SIZE } from "./types.js";
import { makeCard } from "./state.js";

export const ACTIVE_DUAL_FUSION_CARD_IDS = [
  // A. physical+spell 雷霆破军路线
  "thunderBreakArmyBase", "thunderBladeAwakening", "thunderBreakArmy",
  "thunderWarGodSlash", "breakArmyThunderMomentum", "thunderLordBreakArmy",
  // B. spell+bleed 雷血天罚路线
  "thunderBloodBase", "thunderBloodPulse", "thunderBloodJudgement",
  "thunderBloodExecution", "thunderBloodChain", "thunderBloodSovereign",
  // C. bleed+poison 腐血毒潮路线
  "rottenBloodBase", "venomBloodPulse", "rottenBloodVenomTide",
  "rottenVenomSiphon", "bloodVenomBloom", "rottenBloodSovereign",
  // D. poison+control 蛊禁大阵路线
  "guForbiddenBase", "guLockPulse", "guForbiddenArray",
  "guForbiddenDetonation", "guPrisonCommand", "guForbiddenSovereign",
  // E. control+shell 镇狱玄龟路线
  "prisonTurtleBase", "turtleSealGuard", "prisonXuanTurtle",
  "prisonTurtleCounter", "prisonShellRebound", "prisonTurtleSovereign",
  // F. physical+shell 玄甲破军路线
  "xuanArmorBase", "armorBladeGuard", "xuanArmorBreakArmy",
  "xuanArmorGodBreak", "xuanArmorWarMomentum", "xuanArmorSovereign",
];

export const ACTIVE_HEAVENLY_TRIGGER_IDS = [
  "triggerThunderBloodBreakArmy",
  "triggerThreeCalamityTribulation",
  "triggerRottenGuPrison",
  "triggerXuanGuPrison",
  "triggerDemonSuppressArmor",
  "triggerXuanThunderArmy",
];

export const ACTIVE_TRIPLE_FUSION_CARD_IDS = [
  "thunderBloodBreakArmy",
  "threeCalamityBloodVenomTribulation",
  "rottenBloodGuPrison",
  "xuanGuPrisonSuppress",
  "demonSuppressXuanArmor",
  "xuanThunderBreakArmy",
];

const ACTIVE_DUAL_FUSION_SET = new Set(ACTIVE_DUAL_FUSION_CARD_IDS);
const ACTIVE_TRIPLE_FUSION_SET = new Set(ACTIVE_TRIPLE_FUSION_CARD_IDS);
const ACTIVE_HEAVENLY_TRIGGER_SET = new Set(ACTIVE_HEAVENLY_TRIGGER_IDS);

export function generateRewards(state) {
  const run = state.run;
  if (!run) return [];

  const rewards = [];
  const node = run.currentNode;
  migrateArchetypes(run);

  if (node?.rewardKind === "bossPremium") {
    for (let index = 0; index < 3; index += 1) {
      const card = rollPremiumCardReward(run, index === 0);
      rewards.push({ id: `reward_card_${index}_${card.id}`, type: "card", value: card.id });
    }
    const relic = rollRelicReward(run);
    if (relic) rewards[2] = { id: `reward_relic_${relic.id}`, type: "relic", value: relic.id };
    return injectTrueMartialFusionReward(run, rewards, true);
  }

  if (node?.rewardKind === "side") {
    rewards.push({
      id: "reward_side_gold",
      type: "gold",
      value: 30 + node.tier * 18,
    });

    rewards.push({
      id: "reward_side_heal",
      type: "heal",
      value: 10 + node.tier * 6,
    });

    const relic = rollRelicReward(run);
    if (relic) {
      rewards.push({
        id: `reward_side_relic_${relic.id}`,
        type: "relic",
        value: relic.id,
      });
    }

    // V3.1: blood sacrifice reward (True Martial side only)
    if (run.trueMartial && run.maxHp >= 45) {
      const sacrificeRelic = rollTrueMartialRelicReward(run);
      if (sacrificeRelic && Math.abs((run.seed * 37117 + run.floor * 19391) % 100) < 35) {
        rewards[1] = {
          id: `reward_tm_blood_rite_${sacrificeRelic.id}`,
          type: "relic",
          value: sacrificeRelic.id,
          bloodSacrifice: true,
          label: "血祭悟道",
          text: `最大生命降低 33%；若当前生命较高，再失去当前生命的 50%。获得真武遗物：${sacrificeRelic.name}。`,
        };
      }
    }

    // R5: Side purge reward (概率出现)
    if (canOfferSidePurge(run)) {
      const purgeChance = run.trueMartial ? 35 : 20;
      if (Math.abs((run.seed * 93179 + run.floor * 73637) % 100) < purgeChance) {
        if (rewards.length > 0 && rewards[rewards.length - 1].type === "relic") {
          rewards[rewards.length - 1] = {
            id: `reward_side_purge_${run.floor}`,
            type: "purge",
            filter: "any",
            label: "斩念机缘",
            text: "剔除一张可删除牌。",
          };
        }
      }
    }

    const fragment = rollSpecialFragmentReward(run, node);
    if (fragment) {
      rewards[2] = fragment;
    }

    return rewards;
  }

  const tier = node?.tier ?? tierForFloor(run);
  for (let index = 0; index < 3; index += 1) {
    const card =
      node?.rewardKind === "tierPremium"
        ? rollPremiumCardReward(run, index === 0)
        : index === 0 && tier >= 2
          ? rollProgressCardReward(run, false)
          : rollCardReward(run);
    rewards.push({
      id: `reward_card_${index}_${card.id}`,
      type: "card",
      value: card.id,
    });
  }

  if (node?.rewardKind === "tierPremium") {
    const relic = rollRelicReward(run);
    if (relic) {
      rewards[2] = {
        id: `reward_relic_${relic.id}`,
        type: "relic",
        value: relic.id,
      };
    }
  }

  if (run.hp <= run.maxHp * 0.45) {
    rewards[0] = {
      id: "reward_heal",
      type: "heal",
      value: 18,
    };
  }

  const fragment = rollSpecialFragmentReward(run, node);
  if (fragment) {
    rewards[2] = fragment;
  }

  return injectTrueMartialFusionReward(run, rewards, node?.rewardKind === "tierPremium" || node?.rewardKind === "bossPremium");
}

function canOfferSidePurge(run) {
  // Must have more than MIN_DECK_SIZE cards
  if (run.deck.length <= MIN_DECK_SIZE) return false;
  // Must have at least one purgable card
  return run.deck.some(c => {
    const def = cards[c.cardId];
    if (!def) return false;
    if (def.undeletable || def.isCurse) return false;
    return true;
  });
}

export function chooseReward(state, rewardId) {
  const run = state.run;
  if (!run || state.phase !== "reward") return state;

  const reward = run.rewards.find((item) => item.id === rewardId);
  if (!reward) return state;

  if (reward.type === "card") {
    const deckLimit = run.deckLimit ?? 30;
    const rewardCard = cards[reward.value];
    
    // T2-A3: heavenly trigger cards — add target triple, not trigger itself
    if (rewardCard?.heavenlyTrigger && rewardCard?.triggerTripleCardId) {
      const tripleCard = cards[rewardCard.triggerTripleCardId];
      const eligibleTrigger = eligibleHeavenlyTriggers(run, cards).some((trigger) => trigger.id === rewardCard.id);
      const masteredKeys = new Set(masteredFusionRoutes(run, cards).map((route) => route.routeKey));
      const hasMasteredTriggerRoute = Array.isArray(rewardCard.triggerRoutes)
        ? rewardCard.triggerRoutes.some((routeKey) => masteredKeys.has(routeKey))
        : false;
      if (!eligibleTrigger || !hasMasteredTriggerRoute) {
        run.rewardViolations = run.rewardViolations ?? [];
        run.rewardViolations.push({
          type: "ineligibleHeavenlyTriggerPick",
          floor: run.floor,
          cardId: rewardCard.id,
          triggerRoutes: rewardCard.triggerRoutes ?? [],
        });
        state.message = "天尊契机尚未成熟，无法进化。";
      } else if (tripleCard && run.deck.length < deckLimit) {
        const newCard = makeCard(run, rewardCard.triggerTripleCardId);
        newCard.acquiredFloor = run.floor;
        run.deck.push(newCard);
        run.guaranteedNextHand = run.guaranteedNextHand ?? [];
        run.guaranteedNextHand.push(newCard.uid);
        const change = recordCardArchetype(run, tripleCard);
        state.message = `天尊契机！获得【${tripleCard.name}】：${rewardCard.name}选择后进化为${tripleCard.fusionName || tripleCard.name}。`;
        // Record trigger diagnostics
        run.firstHeavenlyTriggerPickedFloor = run.firstHeavenlyTriggerPickedFloor ?? run.floor;
        run.firstHeavenlyTriggerCardId = run.firstHeavenlyTriggerCardId ?? reward.value;
        run.firstTripleFusionFloor = run.firstTripleFusionFloor ?? run.floor;
        run.firstTripleFusionCardId = run.firstTripleFusionCardId ?? rewardCard.triggerTripleCardId;
        run.heavenlyTriggerPickCount = (run.heavenlyTriggerPickCount ?? 0) + 1;
      } else {
        state.message = `牌组已满，无法获得${tripleCard?.name || "三合流牌"}。`;
      }
    } else if (run.deck.length >= deckLimit) {
      run.gold += 15;
      state.message = `牌组已达上限，${cards[reward.value].name} 转化为 15 金。`;
    } else {
      const newCard = makeCard(run, reward.value);
      if (cards[reward.value]?.fusionTier) newCard.acquiredFloor = run.floor;
      run.deck.push(newCard);
      run.guaranteedNextHand = run.guaranteedNextHand ?? [];
      run.guaranteedNextHand.push(newCard.uid);
      const change = recordCardArchetype(run, cards[reward.value]);
      state.message = change
        ? `获得卡牌：${cards[reward.value].name}。${styleLabel(change.style)}倾向 +${change.gain}`
        : `获得卡牌：${cards[reward.value].name}`;
    }
  }

  if (reward.type === "gold") {
    run.gold += Number(reward.value);
    state.message = `获得 ${reward.value} 金。`;
  }

  if (reward.type === "relic") {
    // V3.1.1: relicMessage scoped at block level to survive bloodContract path
    let relicMessage = null;
    if (!run.relics.includes(reward.value)) {
      // V3.1: blood sacrifice cost
      if (reward.bloodSacrifice) {
        const oldMax = run.maxHp;
        const maxLoss = Math.max(1, Math.ceil(oldMax * 0.33));
        run.maxHp = Math.max(1, oldMax - maxLoss);
        run.hp = Math.min(run.hp, run.maxHp);
        let hpLoss = 0;
        if (run.hp > Math.floor(run.maxHp * 0.5)) {
          hpLoss = Math.max(1, Math.floor(run.hp * 0.5));
          run.hp = Math.max(1, run.hp - hpLoss);
        }
        relicMessage = `血祭悟道：最大生命降低 ${maxLoss} 点${hpLoss ? `，当前生命再失去 ${hpLoss} 点` : ""}。获得遗物：${relics[reward.value].name}。`;
      }
      run.relics.push(reward.value);
      // R6: bloodContract on-acquire effect
      if (reward.value === "bloodContract") {
        const reduction = Math.floor(run.maxHp * 0.2);
        run.maxHp = Math.max(1, run.maxHp - reduction);
        run.hp = Math.min(run.hp, run.maxHp);
        state.message = relicMessage
          ? `${relicMessage}血契继续生效，最大生命再降低 ${reduction} 点。`
          : `获得遗物：${relics[reward.value].name}。最大生命降低 ${reduction} 点。`;
        checkSpecialGoal(state);
        if (state.phase === "gameOver") return state;
        finishCurrentNode(run);
        run.rewards = [];
        const maxFloor = run.trueMartial ? 25 : MAX_FLOOR;
        if (run.floor > maxFloor) {
          return completeRunVictory(state, "boss",
            run.trueMartial ? "虚渊归寂，真武问道功成。你击败了虚渊主宰。" : "黑山崩裂，残箓归一。你击败了关底 Boss。");
        }
        // V3.2.1: save message before prepareRouteChoice overwrites it
        const finalMessage = state.message;
        return preserveBloodMessage(finalMessage, prepareRouteChoice(state));
      }
    }
    // V3.1.1: use relicMessage if set (blood sacrifice), else generic
    state.message = relicMessage || `获得遗物：${relics[reward.value].name}`;
  }

  if (reward.type === "specialFragment") {
    const progress = grantSpecialFragment(run);
    state.message = `拾得玄箓残片（${progress.fragments}/${progress.required}）。`;
  }

  if (reward.type === "heal") {
    run.hp = Math.min(run.maxHp, run.hp + Number(reward.value));
    state.message = `回复 ${reward.value} 点生命。`;
  }

  // R5: Purge reward from side
  if (reward.type === "purge") {
    run.pendingPurge = {
      source: "side",
      filter: reward.filter || "any",
      remaining: 1,
      addCurseOnComplete: false,
      removedNames: [],
      finishNodeOnComplete: true,
    };
    state.message = `获得一次【${reward.label || "斩念机缘"}】——请选择要剔除的卡牌。`;
    return state;
  }

  checkSpecialGoal(state);
  if (state.phase === "gameOver") return state;

  finishCurrentNode(run);
  run.rewards = [];

  const maxFloor = run.trueMartial ? 25 : MAX_FLOOR;
  if (run.floor > maxFloor) {
    // Fallback: floor exceeded max, treat as boss victory
    return completeRunVictory(state, "boss",
      run.trueMartial ? "虚渊归寂，真武问道功成。你击败了虚渊主宰。" : "黑山崩裂，残箓归一。你击败了关底 Boss。");
  }

  const finalMessage = state.message;
  return preserveBloodMessage(finalMessage, prepareRouteChoice(state));
}

// V3.1.2: preserve blood sacrifice message after route choice
function preserveBloodMessage(finalMessage, routed) {
  if (finalMessage?.includes("血祭悟道")) {
    routed.message = finalMessage;
  }
  return routed;
}

// Skip reward
export function skipReward(state) {
  const run = state.run;
  if (!run || state.phase !== "reward") return state;

  state.message = "你放弃了这份机缘，继续前行。";
  finishCurrentNode(run);
  run.rewards = [];

  const maxFloor = run.trueMartial ? 25 : MAX_FLOOR;
  if (run.floor > maxFloor) {
    return completeRunVictory(state, "boss",
      run.trueMartial ? "虚渊归寂，真武问道功成。你击败了虚渊主宰。" : "黑山崩裂，残箓归一。你击败了关底 Boss。");
  }

  return prepareRouteChoice(state);
}

// R2: Roll reward cards - only replace card-type rewards
export function rollRewards(state) {
  const run = state.run;
  if (!run || state.phase !== "reward") return state;

  const rollsUsed = run.rollsUsed ?? 0;
  const rollsMax = run.rollsMax ?? 3;
  if (rollsUsed >= rollsMax) {
    state.message = `刷新次数已用完（${rollsUsed}/${rollsMax}）。`;
    return state;
  }

  const hasCards = run.rewards.some(r => r.type === "card");
  if (!hasCards) {
    state.message = "当前没有可刷新的卡牌奖励。";
    return state;
  }

  run.rollsUsed = rollsUsed + 1;

  // Generate fresh rewards to draw new cards from
  const freshRewards = generateRewards(state);

  // Only replace card-type rewards; keep non-card rewards intact
  let freshCardIdx = 0;
  for (let i = 0; i < run.rewards.length; i++) {
    if (run.rewards[i].type === "card") {
      while (freshCardIdx < freshRewards.length && freshRewards[freshCardIdx].type !== "card") {
        freshCardIdx++;
      }
      if (freshCardIdx < freshRewards.length) {
        run.rewards[i] = freshRewards[freshCardIdx];
        freshCardIdx++;
      }
    }
  }

  state.message = `机缘轮转（${run.rollsUsed}/${rollsMax}）。`;
  return state;
}

function rollCardReward(run) {
  const tier = run.currentNode?.tier ?? tierForFloor(run);
  const list = run.trueMartial ? trueMartialBaseCardsForTier(run, tier, false) : cardsForTier(tier, false);
  return weightedChoice(run, list, (card) => rewardWeight(run, card));
}

function rollPremiumCardReward(run, forceCurrentStyle = false) {
  const tier = run.currentNode?.tier ?? tierForFloor(run);
  const list = run.trueMartial ? trueMartialBaseCardsForTier(run, tier, true) : focusedCardsForTier(run, tier, true, forceCurrentStyle);
  return weightedChoice(run, list, (card) => rewardWeight(run, card));
}

function rollProgressCardReward(run, preferCurrentStyle = false) {
  const tier = Math.min(3, run.currentNode?.tier ?? tierForFloor(run));
  const focused = focusedCardsForTier(run, tier, false, preferCurrentStyle).filter((card) => card.style && (card.grade ?? 1) === tier);
  const fallback = Object.values(cards).filter((card) => card.style && (card.grade ?? 1) === tier && !card.trueMartial && !card.isCurse);
  const list = focused.length ? focused : fallback.length ? fallback : cardsForTier(tier, false);
  return weightedChoice(run, list, (card) => rewardWeight(run, card));
}

export function cardsForTier(tier, premium) {
  const maxGrade = Math.min(3, premium ? tier + 1 : tier);
  const minGrade = premium ? Math.max(1, Math.min(3, tier)) : 1;
  const list = Object.values(cards).filter((card) => {
    if (card.isCurse) return false;
    if (card.trueMartial) return false;
    if (isFusionCard(card)) return false;
    const grade = card.grade ?? 1;
    if (grade > maxGrade) return false;
    if (premium && grade < minGrade) return false;
    return true;
  });
  return list.length > 0
    ? list
    : Object.values(cards).filter(card => !card.trueMartial && !card.isCurse && !isFusionCard(card));
}

// T2-A: trueMartial card pool — includes TM singles + fusion cards
export function trueMartialBaseCardsForTier(run, tier, premium) {
  const maxGrade = Math.min(3, premium ? tier + 1 : tier);
  const minGrade = premium ? Math.max(1, Math.min(3, tier)) : 1;
  const list = Object.values(cards).filter((card) => {
    if (card.isCurse) return false;
    if (isFusionCard(card)) return false;
    const grade = card.grade ?? 1;
    if (grade > maxGrade) return false;
    if (premium && grade < minGrade) return false;
    return !card.trueMartial || isTrueMartialSingleCard(card);
  });
  return list.length > 0
    ? list
    : Object.values(cards).filter(card => !card.isCurse && !isFusionCard(card));
}

export function isFusionCard(card) {
  return Boolean(card?.fusionTier === 2 || (card?.fusionTier === 3 && !card?.heavenlyTrigger) || (Array.isArray(card?.fusionStyles) && !card?.heavenlyTrigger));
}

export function isTrueMartialSingleCard(card) {
  return Boolean(card?.trueMartial && !isFusionCard(card) && !card?.heavenlyTrigger);
}

function isActiveFusionCard(card) {
  if (card.heavenlyTrigger) return ACTIVE_HEAVENLY_TRIGGER_SET.has(card.id);
  if (!isFusionCard(card)) return false;
  if (card.fusionTier === 2) return ACTIVE_DUAL_FUSION_SET.has(card.id);
  if (card.fusionTier === 3) return ACTIVE_TRIPLE_FUSION_SET.has(card.id);
  return false;
}

export function fusionCandidateCards(run, fusionTier) {
  if (!run?.trueMartial) return [];
  if (fusionTier === 2) {
    const eligibleIds = new Set(eligibleDualRouteCards(run, cards).map((card) => card.id));
    return Object.values(cards).filter((card) => (
      isActiveFusionCard(card) &&
      card.fusionTier === 2 &&
      eligibleIds.has(card.id)
    ));
  }

  // T2-A3: triple fusion (fusionTier 3, !heavenlyTrigger) never directly in reward pool
  return [];
}

export function heavenlyTriggerCandidateCards(run) {
  if (!run?.trueMartial) return [];
  const eligible = eligibleHeavenlyTriggers(run, cards);
  return eligible.filter((card) => isActiveFusionCard(card));
}

// T2-A5: fixed injection rates
const T2A5_ROUTE_INJECTION_RATE = {
  normal: { f5_6: 0.10, f7_9: 0.26, f10_14: 0.36, f15_18: 0.50, f19_plus: 0.62 },
  premium: { f5_6: 0.18, f7_9: 0.44, f10_14: 0.60, f15_18: 0.78, f19_plus: 0.88 },
};

const T2A5_HEAVENLY_TRIGGER_RATE = {
  normal: { f15_18: 0.12, f19_21: 0.26, f22_plus: 0.42 },
  premium: { f15_18: 0.24, f19_21: 0.46, f22_plus: 0.66 },
};

function isPremiumReward(run) {
  const rk = run?.currentNode?.rewardKind;
  return rk === "elite" || rk === "boss" || rk === "tierPremium" || rk === "premium" || rk === "bossPremium";
}

function getT2A5RouteInjectionRate(run) {
  const floor = run.floor ?? 1;
  if (floor <= 4) return 0;
  const rates = isPremiumReward(run) ? T2A5_ROUTE_INJECTION_RATE.premium : T2A5_ROUTE_INJECTION_RATE.normal;
  if (floor <= 6) return rates.f5_6;
  if (floor <= 9) return rates.f7_9;
  if (floor <= 14) return rates.f10_14;
  if (floor <= 18) return rates.f15_18;
  return rates.f19_plus;
}

function getT2A5HeavenlyTriggerRate(run) {
  const floor = run.floor ?? 1;
  if (floor < 15) return 0;
  const rates = isPremiumReward(run) ? T2A5_HEAVENLY_TRIGGER_RATE.premium : T2A5_HEAVENLY_TRIGGER_RATE.normal;
  if (floor <= 18) return rates.f15_18;
  if (floor <= 21) return rates.f19_21;
  return rates.f22_plus;
}

// T2-A5: weighted route candidate selection
function routeCandidateWeight(run, card) {
  const progress = fusionRouteProgress(run, cards);
  const route = progress[card.fusionRoute];
  const stage = card.fusionStage;
  const rc = route?.routeCardCount ?? 0;
  let weight = 1;

  if (stage === "base") {
    weight = rc === 0 ? 100 : (route?.hasBase ? 20 : 0);
  } else if (stage === "commit") {
    if (!route?.hasBase) return 0;
    weight = rc === 1 ? 240 : 120;
  } else if (stage === "formed") {
    if (!route?.hasBase) return 0;
    weight = rc === 2 ? 320 : (rc > 2 ? 160 : 0);
  } else if (stage === "highrollA" || stage === "highrollB") {
    if (!route?.hasBase || !route?.hasFormed) return 0;
    weight = rc === 3 ? 360 : (rc === 4 ? 300 : (rc >= 5 ? 160 : 0));
  } else if (stage === "mastery") {
    if (!route?.hasBase || !route?.hasFormed) return 0;
    weight = rc === 4 ? 520 : (rc === 5 ? 720 : (rc >= 6 && !route.hasMastery ? 360 : 0));
  }

  // Extra boosts
  if (route?.hasMastery && rc < 6 && card.fusionRoute === route.routeKey) weight += 500;
  if (rc >= 5 && !route?.hasMastery && stage === "mastery") weight += 300;
  if ((card.fusionStyles || []).includes("control")) weight -= 30;

  return Math.max(0, weight);
}

function injectTrueMartialFusionReward(run, rewards, premium) {
  if (!run?.trueMartial) return rewards;
  if (rewards.some((reward) => reward.type === "card" && (isFusionCard(cards[reward.value]) || cards[reward.value]?.heavenlyTrigger))) return rewards;
  if ((run.floor ?? 1) <= 4) return rewards;

  // Heavenly trigger injection (priority)
  const triggerRate = getT2A5HeavenlyTriggerRate(run);
  if (triggerRate > 0 && random(run) < triggerRate) {
    const triggers = heavenlyTriggerCandidateCards(run);
    if (replaceWithFusionCandidate(run, rewards, triggers, "trigger")) return rewards;
  }

  // Route card injection
  const routeRate = getT2A5RouteInjectionRate(run);
  if (routeRate > 0 && random(run) < routeRate) {
    const candidates = fusionCandidateCards(run, 2);
    if (candidates.length > 0) {
      replaceWithFusionCandidate(run, rewards, candidates, "route");
    }
  }

  return rewards;
}

function replaceWithFusionCandidate(run, rewards, candidates, tierLabel) {
  const existingCardIds = new Set(rewards.filter((reward) => reward.type === "card").map((reward) => reward.value));
  const available = candidates.filter((card) => !existingCardIds.has(card.id));
  if (available.length === 0) return false;

  const replaceIndex = fusionReplacementIndex(run, rewards);
  if (replaceIndex < 0) return false;

  const fusion = weightedChoice(run, available, (card) =>
    tierLabel === "trigger" ? (rarityInfo[card.rarity]?.weight || 8) : routeCandidateWeight(run, card)
  );
  rewards[replaceIndex] = {
    id: `reward_fusion_${tierLabel}_${run.floor}_${fusion.id}`,
    type: "card",
    value: fusion.id,
  };
  return true;
}

function fusionReplacementIndex(run, rewards) {
  const replaceable = rewards
    .map((reward, index) => ({ reward, index }))
    .filter(({ reward }) => reward.type === "card")
    .filter(({ reward }) => !isFusionCard(cards[reward.value]))
    .filter(({ reward }) => !isHealOrSurvivalReward(reward));

  if (replaceable.length === 0) return -1;
  replaceable.sort((left, right) => rewardReplacementScore(run, left.reward) - rewardReplacementScore(run, right.reward));
  return replaceable[0].index;
}

function rewardReplacementScore(run, reward) {
  if (reward.type !== "card") return 999;
  const card = cards[reward.value];
  if (!card) return 999;
  return rewardWeight(run, card);
}

function isHealOrSurvivalReward(reward) {
  if (reward.type === "heal") return true;
  if (reward.type !== "card") return false;
  return isHealOrSurvivalCard(cards[reward.value]);
}

function isHealOrSurvivalCard(card) {
  return Boolean(card?.effects?.some((effect) => (
    effect.type === "heal" ||
    effect.type === "block" ||
    effect.type === "cleanse" ||
    effect.type === "doubleBlock" ||
    effect.type === "shellReflect"
  )));
}

function fusionCandidateWeight(run, card) {
  if (card?.heavenlyTrigger) return 100;
  if (!card?.fusionStyles) return 1;
  const floor = run.floor ?? 1;
  const cKey = canonicalFusionKey(card.fusionStyles);
  let boost = rarityInfo[card.rarity].weight;
  if (run.trueMartialStyle && card.fusionStyles.includes(run.trueMartialStyle)) boost *= 1.35;
  if (card.fusionTier === 2) {
    const route = fusionRouteProgress(run, cards)[card.fusionRoute];
    if (route?.routeStyles?.every((style) => (deckStyleScores(run, cards)[style] ?? 0) >= 7)) boost *= 1.25;
    if (card.fusionStage === "base" && route?.routeCardCount === 0) boost *= 1.5;
    if (card.fusionStage === "commit" && route?.hasBase && !route?.hasCommit) boost *= 2.0;
    if (card.fusionStage === "formed" && route?.hasBase && route.routeCardCount >= 2 && !route?.hasFormed) boost *= 2.4;
    if ((card.fusionStage === "highrollA" && !route?.hasHighrollA) || (card.fusionStage === "highrollB" && !route?.hasHighrollB)) boost *= 2.6;
    if (card.fusionStage === "mastery" && route?.hasBase && route?.hasFormed && route.routeCardCount >= 4) boost *= route.routeCardCount >= 5 ? 4.0 : 3.2;
    if (route?.hasMastery && route.routeCardCount < 6) boost *= 2.8;
    if (floor >= 15 && route?.routeCardCount >= 3) boost *= 1.2;
  } else if (card.fusionTier === 3) {
    const eligible = eligibleTripleFusions(run, cards);
    if (eligible.some(t => canonicalFusionKey(t) === cKey)) boost *= 1.6;
  }
  return boost;
}

// T2-A1: fusion card weight boost
function fusionCardWeight(run, card) {
  if (!card.fusionStyles || !run.trueMartial) return 1;
  const floor = run.floor ?? 1;
  const cKey = canonicalFusionKey(card.fusionStyles);
  let boost = 2.0;
  if (run.trueMartialStyle && card.fusionStyles.includes(run.trueMartialStyle)) boost += 1.5;
  if (card.fusionTier === 2) {
    const eligible = eligibleDualFusions(run, cards);
    if (eligible.some(p => canonicalFusionKey(p) === cKey)) {
      if (floor >= 15) boost += 4.0;
      else if (floor >= 7) boost += 2.5;
      else boost += 1.0;
    }
  } else if (card.fusionTier === 3) {
    boost += 3.0;
    const eligible = eligibleTripleFusions(run, cards);
    if (eligible.some(t => canonicalFusionKey(t) === cKey)) boost += 5.0;
  }
  return boost;
}

function focusedCardsForTier(run, tier, premium, forceCurrentStyle) {
  const list = cardsForTier(tier, premium);
  const dominant = dominantArchetype(run);
  if (!forceCurrentStyle || !dominant || !shouldGuaranteeArchetype(run, tier)) return list;

  const focused = list.filter((card) => card.style === dominant.style);
  return focused.length > 0 ? focused : list;
}

function rewardWeight(run, card) {
  if (card.trueMartial && !run.trueMartial) return 0;
  if (card.isCurse && !run.trueMartial) return 0;
  if (isFusionCard(card)) return run.trueMartial ? rarityInfo[card.rarity].weight : 0;
  if (!card.trueMartial && run.trueMartial) return 0.6;
  if (run.trueMartial && isTrueMartialSingleCard(card)) {
    return trueMartialSingleRewardWeight(run, card);
  }
  return rarityInfo[card.rarity].weight * archetypeRewardWeight(run, card);
}

function trueMartialSingleRewardWeight(run, card) {
  const floor = run.floor ?? 1;
  const scores = deckStyleScores(run, cards);
  const [topStyle, topScore] = Object.entries(scores).sort((left, right) => right[1] - left[1])[0] ?? [null, 0];
  let weight = rarityInfo[card.rarity].weight * (card.style === run.trueMartialStyle && card.cost >= 2 ? 12 : 6);

  if (topStyle && topScore >= 12) {
    const bridges = bridgeStyles(topStyle);
    if (card.style === topStyle) {
      weight *= 2.2;
    } else if (bridges.includes(card.style)) {
      weight *= 1.8;
      if (floor >= 7) weight *= 1.25;
    }
  }

  if (masteredThirdStyleTargets(run).has(card.style)) {
    weight *= 2.0;
  }

  if (run.trueMartialStyle === "poison" && floor <= 12 && card.style === "poison") {
    weight *= 1.25;
  }

  return weight;
}

function masteredThirdStyleTargets(run) {
  const targets = new Set();
  for (const route of masteredFusionRoutes(run, cards)) {
    for (const triple of [
      ["physical", "spell", "bleed"],
      ["spell", "bleed", "poison"],
      ["bleed", "poison", "control"],
      ["poison", "control", "shell"],
      ["physical", "control", "shell"],
      ["physical", "spell", "shell"],
    ]) {
      if (!tripleAdjacentRoutes(triple).includes(route.routeKey)) continue;
      const thirdStyle = thirdStyleForTripleRoute(triple, route.routeKey);
      if (thirdStyle) targets.add(thirdStyle);
    }
  }
  return targets;
}

// V3.1: True Martial relic reward — only trueMartialOnly, implemented, not owned
export function rollTrueMartialRelicReward(run) {
  if (!run?.trueMartial) return null;
  const available = Object.values(relics).filter((relic) => {
    if (!relic.trueMartialOnly) return false;
    if (relic.implemented === false) return false;
    if (run.relics.includes(relic.id)) return false;
    return true;
  });
  if (available.length === 0) return null;
  return weightedChoice(run, available, (relic) => rarityInfo[relic.rarity].weight);
}

export function rollRelicReward(run) {
  const available = Object.values(relics).filter((relic) => {
    if (run.relics.includes(relic.id)) return false;
    // Exclude unimplemented relics
    if (relic.implemented === false) return false;
    // trueMartialOnly relics only appear in true martial mode
    if (relic.trueMartialOnly && !run.trueMartial) return false;
    return true;
  });
  if (available.length === 0) return null;
  return weightedChoice(run, available, (relic) => rarityInfo[relic.rarity].weight);
}

function rollSpecialFragmentReward(run, node) {
  if (!canOfferSpecialFragment(run)) return null;
  if (node?.rewardKind !== "tierPremium") return null;

  return {
    id: `reward_special_fragment_${run.floor}`,
    type: "specialFragment",
    value: 1,
  };
}
