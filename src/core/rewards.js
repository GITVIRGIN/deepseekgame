import { cards, rarityInfo, relics } from "./data.js";
import {
  archetypeRewardWeight,
  dominantArchetype,
  migrateArchetypes,
  recordCardArchetype,
  shouldGuaranteeArchetype,
  styleLabel,
} from "./archetypes.js";
import { canOfferSpecialFragment, checkSpecialGoal, grantSpecialFragment } from "./goals.js";
import { finishCurrentNode, prepareRouteChoice, tierForFloor } from "./nodes.js";
import { weightedChoice } from "./rng.js";
import { MAX_FLOOR } from "./types.js";
import { makeCard } from "./state.js";

export function generateRewards(state) {
  const run = state.run;
  if (!run) return [];

  const rewards = [];
  const node = run.currentNode;
  migrateArchetypes(run);

  if (node?.rewardKind === "bossPremium") {
    // Boss: premium cards + guaranteed relic
    for (let index = 0; index < 3; index += 1) {
      const card = rollPremiumCardReward(run, index === 0);
      rewards.push({ id: `reward_card_${index}_${card.id}`, type: "card", value: card.id });
    }
    const relic = rollRelicReward(run);
    if (relic) rewards[2] = { id: `reward_relic_${relic.id}`, type: "relic", value: relic.id };
    return rewards;
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

    const fragment = rollSpecialFragmentReward(run, node);
    if (fragment) {
      rewards[2] = fragment;
    }

    return rewards;
  }

  console.log("[REWARD DEBUG]", "floor:", run.floor, "tier:", node?.tier ?? tierForFloor(run.floor), "affinity:", JSON.stringify(run.archetypeAffinity), "seed:", run.seed);
  const tier = node?.tier ?? tierForFloor(run.floor);
  for (let index = 0; index < 3; index += 1) {
    const card =
      node?.rewardKind === "tierPremium"
        ? rollPremiumCardReward(run, index === 0)
        : index === 0 && tier >= 2
          ? rollProgressCardReward(run, false)
          : rollCardReward(run);
    console.log("[REWARD CARD]", "slot:", index, "card:", card.name, card.id, "seed:", run.seed);
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

  return rewards;
}

export function chooseReward(state, rewardId) {
  const run = state.run;
  if (!run || state.phase !== "reward") return state;

  const reward = run.rewards.find((item) => item.id === rewardId);
  if (!reward) return state;

  if (reward.type === "card") {
    const deckLimit = run.deckLimit ?? 30;
    if (run.deck.length >= deckLimit) {
      run.gold += 15;
      state.message = `牌组已达上限，${cards[reward.value].name} 转化为 15 金。`;
    } else {
      const newCard = makeCard(run, reward.value);
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
    if (!run.relics.includes(reward.value)) {
      run.relics.push(reward.value);
    }
    state.message = `获得遗物：${relics[reward.value].name}`;
  }

  if (reward.type === "specialFragment") {
    const progress = grantSpecialFragment(run);
    state.message = `拾得玄箓残片（${progress.fragments}/${progress.required}）。`;
  }

  if (reward.type === "heal") {
    run.hp = Math.min(run.maxHp, run.hp + Number(reward.value));
    state.message = `回复 ${reward.value} 点生命。`;
  }

  checkSpecialGoal(state);
  if (state.phase === "gameOver") return state;

  finishCurrentNode(run);
  run.rewards = [];

  if (run.floor > MAX_FLOOR) {
    state.phase = "gameOver";
    return state;
  }

  return prepareRouteChoice(state);
}

function rollCardReward(run) {
  const tier = run.currentNode?.tier ?? tierForFloor(run.floor);
  const list = cardsForTier(tier, false);
  return weightedChoice(run, list, (card) => rewardWeight(run, card));
}

function rollPremiumCardReward(run, forceCurrentStyle = false) {
  const tier = run.currentNode?.tier ?? tierForFloor(run.floor);
  const list = focusedCardsForTier(run, tier, true, forceCurrentStyle);
  return weightedChoice(run, list, (card) => rewardWeight(run, card));
}

function rollProgressCardReward(run, preferCurrentStyle = false) {
  const tier = Math.min(3, run.currentNode?.tier ?? tierForFloor(run.floor));
  const focused = focusedCardsForTier(run, tier, false, preferCurrentStyle).filter((card) => card.style && (card.grade ?? 1) === tier);
  const fallback = Object.values(cards).filter((card) => card.style && (card.grade ?? 1) === tier);
  const list = focused.length ? focused : fallback.length ? fallback : cardsForTier(tier, false);
  return weightedChoice(run, list, (card) => rewardWeight(run, card));
}

function cardsForTier(tier, premium) {
  const maxGrade = Math.min(3, premium ? tier + 1 : tier);
  const minGrade = premium ? Math.max(1, Math.min(3, tier)) : 1;
  const list = Object.values(cards).filter((card) => {
    const grade = card.grade ?? 1;
    if (grade > maxGrade) return false;
    if (premium && grade < minGrade) return false;
    return true;
  });

  return list.length > 0 ? list : Object.values(cards);
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
  if (!card.trueMartial && run.trueMartial) return 0.6;
  if (run.trueMartial && card.style === run.trueMartialStyle && card.cost >= 2) {
    return rarityInfo[card.rarity].weight * 12;
  }
  return rarityInfo[card.rarity].weight * archetypeRewardWeight(run, card);
}

export function rollRelicReward(run) {
  const available = Object.values(relics).filter((relic) => !run.relics.includes(relic.id) && !relic.text?.includes("真武专属"));
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
