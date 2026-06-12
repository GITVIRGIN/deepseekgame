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
import { MAX_FLOOR, MIN_DECK_SIZE } from "./types.js";
import { makeCard } from "./state.js";

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

  return rewards;
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
  const list = cardsForTier(tier, false);
  return weightedChoice(run, list, (card) => rewardWeight(run, card));
}

function rollPremiumCardReward(run, forceCurrentStyle = false) {
  const tier = run.currentNode?.tier ?? tierForFloor(run);
  const list = focusedCardsForTier(run, tier, true, forceCurrentStyle);
  return weightedChoice(run, list, (card) => rewardWeight(run, card));
}

function rollProgressCardReward(run, preferCurrentStyle = false) {
  const tier = Math.min(3, run.currentNode?.tier ?? tierForFloor(run));
  const focused = focusedCardsForTier(run, tier, false, preferCurrentStyle).filter((card) => card.style && (card.grade ?? 1) === tier);
  const fallback = Object.values(cards).filter((card) => card.style && (card.grade ?? 1) === tier && !card.trueMartial && !card.isCurse);
  const list = focused.length ? focused : fallback.length ? fallback : cardsForTier(tier, false);
  return weightedChoice(run, list, (card) => rewardWeight(run, card));
}

function cardsForTier(tier, premium) {
  const maxGrade = Math.min(3, premium ? tier + 1 : tier);
  const minGrade = premium ? Math.max(1, Math.min(3, tier)) : 1;
  const list = Object.values(cards).filter((card) => {
    if (card.isCurse) return false;
    const grade = card.grade ?? 1;
    if (grade > maxGrade) return false;
    if (premium && grade < minGrade) return false;
    return true;
  });
  return list.length > 0 ? list.filter(card => !card.trueMartial) : Object.values(cards).filter(card => !card.trueMartial && !card.isCurse);
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
  if (!card.trueMartial && run.trueMartial) return 0.6;
  if (run.trueMartial && card.style === run.trueMartialStyle && card.cost >= 2) {
    return rarityInfo[card.rarity].weight * 12;
  }
  return rarityInfo[card.rarity].weight * archetypeRewardWeight(run, card);
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
