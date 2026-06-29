import { cards, rarityInfo, relics, shopItems } from "./data.js";
import { archetypeRewardWeight, recordCardArchetype, styleLabel } from "./archetypes.js";
import { prepareRouteChoice } from "./nodes.js";
import { shuffle, weightedChoice } from "./rng.js";
import { addStatus, reduceStatus } from "./status.js";
import { MIN_DECK_SIZE } from "./types.js";

export function enterShop(state) {
  const run = state.run;
  if (!run || !run.currentNode) return state;

  run.shopStock = createShopStock(run);
  run.visitedShopTiers = run.visitedShopTiers ?? [];
  if (!run.visitedShopTiers.includes(run.currentNode.tier)) {
    run.visitedShopTiers.push(run.currentNode.tier);
  }
  if (run.currentNode.id === "shop_final") {
    run.finalShopVisited = true;
  }

  state.phase = "shop";
  state.message = "路边灯火微亮，有商人低声招呼。";
  return state;
}

export function buyShopItem(state, itemId) {
  const run = state.run;
  if (!run || state.phase !== "shop") return state;

  const stockItem = (run.shopStock ?? []).find((item) => item.id === itemId);
  const item = shopItems[itemId];
  if (!stockItem || !item || stockItem.sold) return state;

  if (run.gold < stockItem.price) {
    state.message = "金钱不足。";
    return state;
  }

  // V1.3: Secondary validation for purge items before deducting
  if (item.effects?.some(e => e.type === "purgeCard")) {
    const purgeEffect = item.effects.find(e => e.type === "purgeCard");
    const filter = purgeEffect.filter || "any";
    const required = filter === "twoWithCurse" ? 2 : 1;
    const basicIds = ["strike", "guard", "yellowCharm", "meditate"];
    const purgeable = (run.deck ?? []).filter(c => {
      const def = cards[c.cardId];
      if (!def) return false;
      if (def.undeletable || def.isCurse) return false;
      if (filter === "basic" && !basicIds.includes(c.cardId)) return false;
      return true;
    });
    if (purgeable.length < required || run.deck.length <= MIN_DECK_SIZE) {
      state.message = "当前牌组无法继续剔除。";
      return state;
    }
  }

  run.gold -= stockItem.price;
  stockItem.sold = true;
  const notes = applyShopEffects(run, item);
  if (item.once) {
    run[`bought_${item.id}`] = true;
  }
  stockItem.resultText = notes.join("。");
  state.message = [`购买：${item.name}`, ...notes].join("。");
  return state;
}

export function leaveShop(state) {
  const run = state.run;
  if (!run) return state;

  // V1.3: Block leaving shop while pendingPurge active
  if (run.pendingPurge) {
    state.message = "请先完成当前剔除。";
    return state;
  }

  run.shopStock = [];
  run.currentNode = null;
  return prepareRouteChoice(state);
}

function createShopStock(run) {
  const allItems = Object.values(shopItems).filter((item) => {
    if (item.once && run[`bought_${item.id}`]) return false;
    if (item.trueMartial && !run.trueMartial) return false;
    // Exclude purge items when no valid cards to delete
    if (item.effects?.some(e => e.type === "purgeCard")) {
      const purgeEffect = item.effects.find(e => e.type === "purgeCard");
      const filter = purgeEffect.filter || "any";
      const required = filter === "twoWithCurse" ? 2 : 1;
      const purgeable = (run.deck ?? []).filter(c => {
        const def = cards[c.cardId];
        if (!def) return false;
        if (def.undeletable || def.isCurse) return false;
        if (filter === "basic") {
          const basicIds = ["strike", "guard", "yellowCharm", "meditate"];
          if (!basicIds.includes(c.cardId)) return false;
        }
        return true;
      });
      if (purgeable.length < required) return false;
      if (run.deck.length <= MIN_DECK_SIZE) return false;
    }
    return !item.effects.some((effect) => effect.type === "relic" && run.relics.includes(effect.value));
  });
  const picked = shuffle(run, allItems).slice(0, 4);
  return picked.map((item) => ({
    id: item.id,
    price: item.price + (run.currentNode?.tier ?? 1) * 4,
    sold: false,
  }));
}

function applyShopEffects(run, item) {
  const notes = [];

  for (const effect of item.effects) {
    if (effect.type === "maxHp") {
      run.maxHp += effect.value;
      run.hp += effect.value;
      notes.push(`最大生命 +${effect.value}`);
    }

    if (effect.type === "heal") {
      const before = run.hp;
      run.hp = Math.min(run.maxHp, run.hp + effect.value);
      notes.push(`回复 ${run.hp - before} 点生命`);
    }

    if (effect.type === "maxEnergy") {
      run.maxEnergy += effect.value;
      notes.push(`最大能量 +${effect.value}`);
    }

    if (effect.type === "handLimit") {
      run.handLimit = (run.handLimit ?? 5) + effect.value;
      notes.push(`手牌上限 +${effect.value}`);
    }

    if (effect.type === "deckLimit") {
      run.deckLimit = (run.deckLimit ?? 30) + effect.value;
      notes.push(`牌组上限 +${effect.value}`);
    }

    if (effect.type === "gold") {
      run.gold += effect.value;
      notes.push(`获得 ${effect.value} 金`);
    }

    if (effect.type === "relic") {
      if (run.relics.includes(effect.value)) {
        const compensation = 35;
        run.gold += compensation;
        notes.push(`已有${relics[effect.value].name}，转化为 ${compensation} 金`);
      } else {
        run.relics.push(effect.value);
        notes.push(`获得遗物：${relics[effect.value].name}`);
      }
    }

    if (effect.type === "cleanse") {
      const fighter = { statuses: run.statuses };
      reduceStatus(fighter, effect.status, 999);
      run.statuses = fighter.statuses;
      notes.push("移除自身诅咒");
    }

    if (effect.type === "rareCard") {
      for (let index = 0; index < (effect.value ?? 1); index += 1) {
        grantShopCard(run, notes);
      }
    }

    // Purge card effects: enter card selection mode (no cancel, forced completion)
    if (effect.type === "purgeCard") {
      const filter = effect.filter || "any";
      const remaining = filter === "twoWithCurse" ? 2 : 1;
      run.pendingPurge = {
        source: "shop",
        filter,
        remaining,
        addCurseOnComplete: filter === "twoWithCurse",
        removedNames: [],
        finishNodeOnComplete: false,
      };
      notes.push(filter === "twoWithCurse"
        ? "请选择要剔除的第一张牌（共需剔除2张）。"
        : "请选择要剔除的卡牌。");
    }

    // Lose HP (for true martial shop items)
    if (effect.type === "loseHpPlayer") {
      run.hp = Math.max(1, run.hp - (effect.value ?? 0));
      notes.push(`失去 ${effect.value} 点生命`);
    }
  }

  if (item.id === "calmTea") {
    addStatus({ statuses: run.statuses }, "ward", 2);
    notes.push("获得护体 2");
  }

  return notes;
}

function grantShopCard(run, notes) {
  if (run.deck.length >= (run.deckLimit ?? 30)) {
    const compensation = 25;
    run.gold += compensation;
    notes.push(`牌组已满，灵品卡转化为 ${compensation} 金`);
    return;
  }

  const pool = Object.values(cards).filter((card) => card.rarity !== "common" && !card.trueMartial);
  const card = weightedChoice(run, pool, (itemCard) => rarityInfo[itemCard.rarity].weight * archetypeRewardWeight(run, itemCard));
  const cardInstance = {
    uid: `card_shop_${run.nextUid + 1}`,
    cardId: card.id,
  };
  run.deck.push(cardInstance);
  run.nextUid += 1;
  const change = recordCardArchetype(run, card);
  const handNote = addShopCardToNextHand(run, cardInstance);
  notes.push(`获得 ${card.name}`);
  notes.push(handNote);
  if (change) {
    notes.push(`${styleLabel(change.style)}倾向 +${change.gain}`);
  }
}

function addShopCardToNextHand(run, cardInstance) {
  run.retainedHand = run.retainedHand ?? [];
  const handLimit = run.handLimit ?? 5;

  if (run.retainedHand.length < handLimit) {
    run.retainedHand.push(cardInstance);
    return "已加入下场手牌";
  }

  const compensation = 18;
  run.gold += compensation;
  return `手牌已满，无法加入下场手牌，补偿 ${compensation} 金`;
}
