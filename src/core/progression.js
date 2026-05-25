export const talentDefinitions = {
  body: {
    id: "body",
    name: "固本",
    text: "每级开局最大生命 +5。",
    maxLevel: 5,
    baseCost: 8,
    costStep: 6,
  },
  purse: {
    id: "purse",
    name: "盘缠",
    text: "每级开局金币 +10。",
    maxLevel: 5,
    baseCost: 10,
    costStep: 6,
  },
  hand: {
    id: "hand",
    name: "袖里乾坤",
    text: "每级手牌上限 +1。",
    maxLevel: 3,
    baseCost: 14,
    costStep: 8,
  },
  bloodGourd: {
    id: "bloodGourd",
    name: "血葫芦契",
    text: "开局自带血葫芦。",
    maxLevel: 1,
    baseCost: 28,
    costStep: 0,
  },
};

export function migrateMeta(meta = {}) {
  const next = meta;
  next.soul = next.soul ?? 0;
  next.totalRuns = next.totalRuns ?? 0;
  next.wins = next.wins ?? 0;
  next.talents = next.talents ?? {};

  for (const id of Object.keys(talentDefinitions)) {
    next.talents[id] = next.talents[id] ?? 0;
  }

  return next;
}

export function talentLevel(meta, talentId) {
  return migrateMeta(meta).talents[talentId] ?? 0;
}

export function talentCost(definition, level) {
  if (level >= definition.maxLevel) return null;
  return definition.baseCost + level * definition.costStep;
}

export function purchaseTalent(state, talentId) {
  if (!["home", "gameOver"].includes(state.phase)) return state;

  state.meta = migrateMeta(state.meta);
  const definition = talentDefinitions[talentId];
  if (!definition) return state;

  const level = talentLevel(state.meta, talentId);
  const cost = talentCost(definition, level);
  if (cost === null) {
    state.message = `${definition.name} 已经点满。`;
    return state;
  }

  if (state.meta.soul < cost) {
    state.message = "残魂不足。";
    return state;
  }

  state.meta.soul -= cost;
  state.meta.talents[talentId] = level + 1;
  state.message = `点亮 ${definition.name} ${level + 1}/${definition.maxLevel}。`;
  return state;
}

export function applyMetaProgression(run, meta) {
  const talents = migrateMeta(meta).talents;

  const extraHp = talents.body * 5;
  run.maxHp += extraHp;
  run.hp += extraHp;

  run.gold += talents.purse * 10;
  run.handLimit += talents.hand;

  if (talents.bloodGourd > 0 && !run.relics.includes("bloodGourd")) {
    run.relics.push("bloodGourd");
  }
}
