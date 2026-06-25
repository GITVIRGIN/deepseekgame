export const MYTH_FACTIONS = ["人间", "昆仑", "妖", "幽冥", "山海", "龙宫", "天庭", "洪荒"];
export const MYTH_MASTERY_MAX = 5;
export const MYTH_MASTERY_TOTAL = MYTH_FACTIONS.length * MYTH_MASTERY_MAX;
export const MYTH_MASTERY_PERKS = {
  天庭: { tag: "天庭", text: "满级：每场战斗开局获得 3 层灵气。" },
  人间: { tag: "人间", text: "满级：开局最大生命 +12。" },
  昆仑: { tag: "昆仑", text: "满级：手牌上限 +2。" },
  幽冥: { tag: "幽冥", text: "满级：敌方流血和毒瘴伤害 +3。" },
  山海: { tag: "山海", text: "满级：每场战斗开局获得 5 点格挡。" },
  洪荒: { tag: "洪荒", text: "满级：洪荒牌费用 -1，每场战斗首张洪荒牌免费。" },
  龙宫: { tag: "龙宫", text: "满级：开局金币 +45。" },
  妖: { tag: "妖", text: "满级：每场战斗首次卡牌伤害 +12。" },
};

const MIN_DOMINANT_SCORE = 3;
const BOOSTED_EFFECT_TYPES = new Set(["damage", "execute", "block", "heal", "status", "amplifyDebuffs", "thunderMark", "bleedSiphon", "shellReflect"]);
const STARTER_IMPRINT_CARD_IDS = new Set(["strike", "guard", "meditate"]);
const RARITY_IMPRINT_WEIGHT = {
  common: 0.35,
  rare: 1.1,
  epic: 1.6,
  legendary: 2.3,
};

export function createMythMastery() {
  return Object.fromEntries(MYTH_FACTIONS.map((tag) => [tag, 0]));
}

export function migrateMythMastery(meta = {}) {
  meta.mythMastery = { ...createMythMastery(), ...(meta.mythMastery ?? {}) };

  for (const tag of Object.keys(meta.mythMastery)) {
    meta.mythMastery[tag] = clampLevel(meta.mythMastery[tag]);
  }

  return meta.mythMastery;
}

export function snapshotMythMastery(meta = {}) {
  return { ...migrateMythMastery(meta) };
}

export function ensureMythStats(run) {
  run.mythStats = run.mythStats ?? {};
  run.mythStats.plays = run.mythStats.plays ?? {};
  run.mythStats.lastAward = run.mythStats.lastAward ?? null;
  return run.mythStats;
}

export function recordMythCardPlay(run, card) {
  if (!run || !card?.mythTags?.length) return;

  const stats = ensureMythStats(run);
  const weight = mythPlayWeight(card);
  if (weight <= 0) return;

  for (const tag of card.mythTags) {
    stats.plays[tag] = round((stats.plays[tag] ?? 0) + weight);
  }
}

export function dominantMythFaction(run) {
  const plays = ensureMythStats(run).plays;
  const ranked = Object.entries(plays)
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-Hans"));

  if (ranked.length === 0 || ranked[0][1] < MIN_DOMINANT_SCORE) return null;
  return { tag: ranked[0][0], score: round(ranked[0][1]) };
}

export function awardMythMasteryForVictory(state) {
  return awardMythMasteryForRunEnd(state, "boss");
}

export function awardMythMasteryForRunEnd(state, result) {
  const run = state.run;
  if (!run) return null;

  const dominant = dominantMythFaction(run);
  const points = mythMasteryPoints(run, result);
  if (points <= 0) return null;

  const mastery = migrateMythMastery(state.meta);
  const allocations = [];

  for (let index = 0; index < points; index += 1) {
    const preferred = index === 0 ? dominant?.tag : null;
    const tag = chooseAwardTarget(mastery, preferred, (run.seed ?? 0) + (run.floor ?? 0) + index);
    if (!tag) break;

    const before = clampLevel(mastery[tag] ?? 0);
    const after = Math.min(MYTH_MASTERY_MAX, before + 1);
    mastery[tag] = after;
    allocations.push({ tag, before, after });
  }

  if (allocations.length === 0) return null;

  const award = {
    result,
    points,
    dominant,
    allocations,
    tag: allocations[0].tag,
    score: dominant?.score ?? 0,
  };
  ensureMythStats(run).lastAward = award;
  run.mythMastery = { ...mastery };
  return award;
}

export function cardMythBoost(runOrMeta, card, fallbackMeta = null) {
  const mastery = runOrMeta?.mythMastery ?? fallbackMeta?.mythMastery ?? {};
  const tags = card?.mythTags ?? [];
  let tag = null;
  let level = 0;

  for (const item of tags) {
    const itemLevel = clampLevel(mastery[item] ?? 0);
    if (itemLevel > level) {
      tag = item;
      level = itemLevel;
    }
  }

  return {
    tag,
    level,
    numericBonus: level,
    statusBonus: Math.floor(level / 2),
    active: level > 0 && cardReceivesMythBoost(card),
  };
}

export function mythMasteryLevel(runOrMeta, tag, fallbackMeta = null) {
  const mastery = runOrMeta?.mythMastery ?? fallbackMeta?.mythMastery ?? {};
  return clampLevel(mastery[tag] ?? 0);
}

export function hasMythMasteryPerk(runOrMeta, tag, fallbackMeta = null) {
  return mythMasteryLevel(runOrMeta, tag, fallbackMeta) >= MYTH_MASTERY_MAX;
}

export function activeMythMasteryPerkTexts(runOrMeta, fallbackMeta = null) {
  return MYTH_FACTIONS.filter((tag) => hasMythMasteryPerk(runOrMeta, tag, fallbackMeta)).map((tag) => MYTH_MASTERY_PERKS[tag].text);
}

export function applyMythRunStartBonuses(run) {
  if (hasMythMasteryPerk(run, "人间")) {
    run.maxHp += 12;
    run.hp += 12;
  }

  if (hasMythMasteryPerk(run, "昆仑")) {
    run.handLimit += 2;
  }

  if (hasMythMasteryPerk(run, "龙宫")) {
    run.gold += 45;
  }
}

export function applyMythCombatStartBonuses(run) {
  const combat = run?.combat;
  if (!run || !combat || combat.flags.mythStartPerksApplied) return;

  combat.flags.mythStartPerksApplied = true;

  if (hasMythMasteryPerk(run, "天庭")) {
    addCombatStatus(run, "spirit", 3);
    combat.log.push("天庭箓印满级：开局灵气 +3。");
  }

  if (hasMythMasteryPerk(run, "山海")) {
    combat.block += 5;
    combat.log.push("山海箓印满级：开局格挡 +5。");
  }
}

export function effectiveCardCost(run, card) {
  // UI2: trueMartial mode-specific card cost override
  if (run?.trueMartial && card?.trueMartial?.cost !== undefined) {
    return { cost: card.trueMartial.cost, baseCost: card.trueMartial.cost, reduced: 0, firstFree: false };
  }
  const baseCost = card?.cost ?? 0;
  const isHonghuangCard = card?.mythTags?.includes("洪荒");
  const combat = run?.combat;

  if (!isHonghuangCard || !hasMythMasteryPerk(run, "洪荒")) {
    return { cost: baseCost, baseCost, reduced: 0, firstFree: false };
  }

  if (combat && !combat.flags.honghuangFirstFreeUsed && baseCost > 0) {
    return { cost: 0, baseCost, reduced: baseCost, firstFree: true };
  }

  const cost = Math.max(0, baseCost - 1);
  return { cost, baseCost, reduced: baseCost - cost, firstFree: false };
}

export function commitEffectiveCardCost(run, costInfo) {
  if (costInfo?.firstFree && run?.combat) {
    run.combat.flags.honghuangFirstFreeUsed = true;
  }
}

export function mythStatusDamageBonus(run, fighter, statusId) {
  if (fighter?.uid === "player") return 0;
  if (!["bleed", "poison"].includes(statusId)) return 0;
  return hasMythMasteryPerk(run, "幽冥") ? 3 : 0;
}

export function mythFirstStrikeDamageBonus(run, target) {
  const combat = run?.combat;
  if (!combat || target?.uid === "player" || combat.flags.demonFirstStrikeUsed) return 0;
  return hasMythMasteryPerk(run, "妖") ? 12 : 0;
}

export function consumeMythFirstStrike(run, bonus) {
  if (bonus > 0 && run?.combat) {
    run.combat.flags.demonFirstStrikeUsed = true;
  }
}

export function cardReceivesMythBoost(card) {
  return (card?.effects ?? []).some((effect) => BOOSTED_EFFECT_TYPES.has(effect.type));
}

export function mythAwardText(award) {
  if (!award) return "";
  if (!award.allocations?.length) {
    return "派系箓印已全满。";
  }

  const changes = award.allocations
    .map((item) => `${item.tag} +1（${item.after}/${MYTH_MASTERY_MAX}）`)
    .join("，");
  return `派系箓印：${changes}。`;
}

function mythPlayWeight(card) {
  if (STARTER_IMPRINT_CARD_IDS.has(card.id)) return 0;

  const rarityWeight = RARITY_IMPRINT_WEIGHT[card.rarity] ?? 0.3;
  const styleWeight = card.style ? 0.45 : 0;
  const gradeWeight = Math.max(0, (card.grade ?? 1) - 1) * 0.55;
  const costWeight = Math.max(0, card.cost ?? 0) * 0.2;
  return round(rarityWeight + styleWeight + gradeWeight + costWeight);
}

function mythMasteryPoints(run, result) {
  if (result === "boss" || result === "special") return 2;
  if (result === "defeat" && (run.floor ?? 0) >= 6) return 1;
  if (result === "abandon" && (run.floor ?? 0) >= 10) return 1;
  return 0;
}

function chooseAwardTarget(mastery, preferred, salt = 0) {
  if (preferred && clampLevel(mastery[preferred] ?? 0) < MYTH_MASTERY_MAX) {
    return preferred;
  }

  const candidates = MYTH_FACTIONS.filter((tag) => clampLevel(mastery[tag] ?? 0) < MYTH_MASTERY_MAX);
  if (candidates.length === 0) return null;

  const minLevel = Math.min(...candidates.map((tag) => clampLevel(mastery[tag] ?? 0)));
  const lowest = candidates.filter((tag) => clampLevel(mastery[tag] ?? 0) === minLevel);
  return lowest[Math.abs(salt) % lowest.length];
}

function addCombatStatus(run, statusId, stacks) {
  const cap = { spirit: 12 }[statusId] ?? Infinity;
  const existing = run.statuses.find((status) => status.id === statusId);
  if (existing) {
    existing.stacks = Math.min(cap, existing.stacks + stacks);
    existing.fresh = Math.min(existing.stacks, (existing.fresh ?? 0) + stacks);
  } else {
    const value = Math.min(cap, stacks);
    run.statuses.push({ id: statusId, stacks: value, fresh: value });
  }
}

function clampLevel(value) {
  return Math.max(0, Math.min(MYTH_MASTERY_MAX, Math.floor(Number(value) || 0)));
}

function round(value) {
  return Math.round(value * 10) / 10;
}
