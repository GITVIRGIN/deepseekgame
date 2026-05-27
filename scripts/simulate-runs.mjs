import { cards, shopItems } from "../src/core/data.js";
import { createRunGoal, markSpecialGoalBaseline } from "../src/core/goals.js";
import { prepareRouteChoice } from "../src/core/nodes.js";
import { reduceGame } from "../src/core/reducer.js";
import { createInitialState, startRun } from "../src/core/state.js";
import { effectiveCardCost, MYTH_FACTIONS, MYTH_MASTERY_MAX, MYTH_MASTERY_TOTAL } from "../src/core/myth.js";

const STYLE_IDS = ["physical", "spell", "bleed", "shell", "poison", "control"];
const args = parseArgs(process.argv.slice(2));
const runCount = Number(args.runs ?? args.n ?? 100);
const baseSeed = Number(args.seed ?? 2026052500);
const profile = String(args.profile ?? "balanced");
const lossStreak = Number(args.lossStreak ?? 0);
const mythMode = String(args.myth ?? "none");

if (!Number.isFinite(runCount) || runCount <= 0) {
  throw new Error("runs must be a positive number");
}

const results = Array.from({ length: runCount }, (_, index) => runOne((baseSeed + index * 7919) >>> 0));
const summary = summarize(results);

if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printSummary(summary);
}

function runOne(seed) {
  let state = seededRun(seed);
  let steps = 0;
  const metrics = {
    cardPlays: emptyStyleMap(),
    rewardPicks: emptyStyleMap(),
    maxStatuses: { bleed: 0, poison: 0, burn: 0, chaos: 0, bind: 0, brittle: 0, thunderMark: 0, stun: 0, battleIntent: 0, spirit: 0 },
    finalRoute: { shopSeen: false, sideSeen: false, shopVisited: false, sideVisited: false },
    maxBlock: 0,
    minHp: Infinity,
    maxEnergy: state.run.maxEnergy,
    combats: 0,
    turns: 0,
  };

  while (state.phase !== "gameOver" && steps < 2500) {
    steps += 1;
    collectMetrics(state, metrics);

    if (state.phase === "route") {
      recordFinalRouteSeen(state.run, metrics);
      const node = chooseRouteNode(state.run);
      recordFinalRouteVisit(node, metrics);
      state = reduceGame(state, { type: "chooseNode", nodeId: node.id });
      if (state.phase === "combat") metrics.combats += 1;
      continue;
    }

    if (state.phase === "shop") {
      const item = chooseShopItem(state.run);
      state = item ? reduceGame(state, { type: "buyShopItem", itemId: item.id }) : reduceGame(state, { type: "leaveShop" });
      continue;
    }

    if (state.phase === "reward") {
      const reward = chooseRewardOption(state.run);
      recordReward(metrics, reward);
      state = reduceGame(state, { type: "chooseReward", rewardId: reward.id });
      continue;
    }

    if (state.phase === "combat") {
      const action = chooseCombatAction(state.run);
      if (action.type === "playCard") {
        const instance = state.run.combat.hand.find((card) => card.uid === action.cardUid);
        recordCardPlay(metrics, cards[instance?.cardId]);
      }
      if (action.type === "endTurn") metrics.turns += 1;
      state = reduceGame(state, action);
    }
  }

  collectMetrics(state, metrics);

  return {
    seed,
    phase: state.phase,
    floor: state.run?.floor ?? 0,
    won: Boolean(state.run?.goal?.completedBy),
    completedBy: state.run?.goal?.completedBy ?? "loss",
    mythAwardTags: state.run?.mythStats?.lastAward?.allocations?.map((item) => item.tag) ?? [],
    mythAwardPoints: state.run?.mythStats?.lastAward?.allocations?.length ?? 0,
    deckSize: state.run?.deck.length ?? 0,
    relics: state.run?.relics.length ?? 0,
    maxEnergy: metrics.maxEnergy,
    steps,
    ...metrics,
  };
}

function seededRun(seed) {
  const initial = createInitialState();
  if (mythMode === "max") {
    initial.meta.mythMastery = Object.fromEntries(MYTH_FACTIONS.map((tag) => [tag, MYTH_MASTERY_MAX]));
  }
  const state = startRun(initial);
  state.meta.lossStreak = Number.isFinite(lossStreak) ? Math.max(0, lossStreak) : 0;
  state.run.seed = seed;
  state.run.lossStreak = state.meta.lossStreak;
  state.run.goal = createRunGoal(seed);
  markSpecialGoalBaseline(state.run);
  return prepareRouteChoice(state);
}

function chooseRouteNode(run) {
  const choices = run.nodeChoices ?? [];
  const finalShop = choices.find((node) => node.id === "shop_final");
  const finalSide = choices.find((node) => node.id === "side_final");
  const shop = choices.find((node) => node.type === "shop");
  const side = choices.find((node) => node.type === "side");
  const main = choices.find((node) => node.type === "main") ?? choices[0];

  if (finalShop && run.gold >= 25) return finalShop;
  if (finalSide && run.hp >= run.maxHp * 0.35) return finalSide;
  if (shop && run.gold >= 35) return shop;
  if (side && run.hp >= run.maxHp * 0.55) return side;
  return main;
}

function chooseShopItem(run) {
  const affordable = (run.shopStock ?? [])
    .filter((item) => !item.sold && run.gold >= item.price)
    .map((item) => ({ ...item, score: shopScore(shopItems[item.id]) }))
    .sort((left, right) => right.score - left.score);
  return affordable[0] ?? null;
}

function chooseRewardOption(run) {
  return [...run.rewards].sort((left, right) => rewardScore(run, right) - rewardScore(run, left))[0];
}

function chooseCombatAction(run) {
  if (run.pendingChoice?.type === "discardPick") {
    const pick = run.combat.discardPile.find((card) => card.uid !== run.pendingChoice.sourceUid);
    return pick ? { type: "pickDiscardCard", cardUid: pick.uid } : { type: "cancelDiscardPick" };
  }

  const playable = run.combat.hand
    .map((instance) => ({ instance, card: cards[instance.cardId] }))
    .filter(({ card }) => run.energy >= effectiveCardCost(run, card).cost && !(card.id === "meditate" && run.energy >= run.maxEnergy));

  if (playable.length === 0) return { type: "endTurn" };

  playable.sort((left, right) => combatScore(run, right.card) - combatScore(run, left.card));
  const best = playable[0];
  if (combatScore(run, best.card) < -50) return { type: "endTurn" };

  return {
    type: "playCard",
    cardUid: best.instance.uid,
    targetUid: preferredTarget(run)?.uid ?? null,
  };
}

function combatScore(run, card) {
  const target = preferredTarget(run);
  const targetBleed = statusValue(target, "bleed");
  const targetThunder = statusValue(target, "thunderMark");
  const targetControl = controlPressure(target);
  const targetBrittle = statusValue(target, "brittle");
  const lowHp = run.hp <= run.maxHp * 0.35;
  const block = run.combat?.block ?? 0;
  let score = profileScore(card, 18);

  if (effectType(card, "damage") || effectType(card, "execute")) score += 20;
  if (effectType(card, "status")) score += 16;
  if (targetBrittle > 0 && (effectType(card, "damage") || effectType(card, "shellReflect"))) score += 32;
  if (effectType(card, "thunderMark")) score += targetThunder >= 6 ? 46 : targetThunder >= 3 ? 30 : 20;
  if (profile === "control" && card.effects.some((effect) => ["chaos", "bind", "stun"].includes(effect.status))) score += targetControl >= 4 ? 48 : 34;
  if (effectType(card, "amplifyDebuffs")) score += targetHasDebuff(target) ? 36 : -12;
  if (effectType(card, "block")) score += lowHp ? 42 : 8;
  if (profile === "shell" && effectType(card, "block")) score += 42;
  if (effectType(card, "heal")) score += lowHp ? 55 : 8;
  if (effectType(card, "draw")) score += 10;
  if (effectType(card, "gainEnergy")) score += run.energy < run.maxEnergy ? 22 : -20;
  if (effectType(card, "recoverDiscard")) score += recoverScore(run, card);
  if (effectType(card, "loseHp")) score += lowHp ? -70 : -10;
  if (effectType(card, "bleedSiphon")) score += targetBleed >= 5 ? 70 : targetBleed >= 3 ? 25 : -25;
  if (effectType(card, "shellReflect")) score += block >= 18 ? 72 : block >= 8 ? 38 : profile === "shell" ? 12 : -8;
  if (profile === "poison" && card.effects.some((effect) => effect.status === "poison")) score += 34;
  if (profile === "spell" && effectType(card, "thunderMark")) score += 48;
  if (profile === "spell" && effectType(card, "gainEnergy")) score += 12;
  if (card.id === "meditate" && run.energy >= run.maxEnergy) score -= 999;
  return score - effectiveCardCost(run, card).cost * 3;
}

function rewardScore(run, reward) {
  if (reward.type === "heal") return run.hp <= run.maxHp * 0.45 ? 95 : 12;
  if (reward.type === "specialFragment") return 88;
  if (reward.type === "relic") return 74;
  if (reward.type === "gold") return 28;

  const card = cards[reward.value];
  let score = profileScore(card, 36) + rarityScore(card.rarity) + (card.grade ?? 1) * 10;
  if (effectType(card, "draw") || effectType(card, "gainEnergy")) score += 8;
  if (profile === "bleed" && effectType(card, "bleedSiphon")) score += 45;
  if (profile === "shell" && effectType(card, "shellReflect")) score += 55;
  if (profile === "poison" && card.effects.some((effect) => effect.status === "poison")) score += 42;
  if (profile === "spell" && effectType(card, "thunderMark")) score += 55;
  if (profile === "control" && card.effects.some((effect) => ["chaos", "bind", "stun"].includes(effect.status))) score += 52;
  if (profile === "control" && effectType(card, "recoverDiscard")) score += card.effects.some((effect) => effect.excludeStyles?.includes("control")) ? 8 : 36;
  return score;
}

function shopScore(item) {
  if (!item) return 0;
  let score = 0;
  for (const effect of item.effects) {
    if (effect.type === "maxEnergy") score += 80 + effect.value * 30;
    if (effect.type === "rareCard") score += 62;
    if (effect.type === "relic") score += 58;
    if (effect.type === "handLimit") score += 48;
    if (effect.type === "maxHp") score += 40;
    if (effect.type === "deckLimit") score += 20;
    if (effect.type === "heal") score += 18;
  }
  return score;
}

function preferredTarget(run) {
  const enemies = run.combat?.enemies.filter((enemy) => enemy.hp > 0) ?? [];
  if (profile === "bleed" || profile === "poison") {
    const statusId = profile === "bleed" ? "bleed" : "poison";
    return enemies.sort((left, right) => statusValue(right, statusId) - statusValue(left, statusId) || left.hp - right.hp)[0];
  }
  if (profile === "spell") {
    return enemies.sort((left, right) => statusValue(right, "thunderMark") - statusValue(left, "thunderMark") || left.hp - right.hp)[0];
  }
  if (profile === "control") {
    return enemies.sort((left, right) => statusValue(right, "brittle") - statusValue(left, "brittle") || controlPressure(right) - controlPressure(left) || left.hp - right.hp)[0];
  }
  return enemies.sort((left, right) => left.hp - right.hp)[0];
}

function profileScore(card, weight) {
  if (!card?.style) return 0;
  if (profile === "balanced") return ["physical", "spell", "bleed", "poison"].includes(card.style) ? weight * 0.23 : weight * 0.13;
  return card.style === profile ? weight : 0;
}

function collectMetrics(state, metrics) {
  const run = state.run;
  if (!run) return;

  metrics.minHp = Math.min(metrics.minHp, run.hp);
  metrics.maxEnergy = Math.max(metrics.maxEnergy, run.maxEnergy);
  metrics.maxBlock = Math.max(metrics.maxBlock, run.combat?.block ?? 0);
  metrics.maxStatuses.battleIntent = Math.max(metrics.maxStatuses.battleIntent, statusValue({ statuses: run.statuses }, "battleIntent"));
  metrics.maxStatuses.spirit = Math.max(metrics.maxStatuses.spirit, statusValue({ statuses: run.statuses }, "spirit"));

  for (const enemy of run.combat?.enemies ?? []) {
    metrics.maxStatuses.bleed = Math.max(metrics.maxStatuses.bleed, statusValue(enemy, "bleed"));
    metrics.maxStatuses.poison = Math.max(metrics.maxStatuses.poison, statusValue(enemy, "poison"));
    metrics.maxStatuses.burn = Math.max(metrics.maxStatuses.burn, statusValue(enemy, "burn"));
    metrics.maxStatuses.chaos = Math.max(metrics.maxStatuses.chaos, statusValue(enemy, "chaos"));
    metrics.maxStatuses.bind = Math.max(metrics.maxStatuses.bind, statusValue(enemy, "bind"));
    metrics.maxStatuses.brittle = Math.max(metrics.maxStatuses.brittle, statusValue(enemy, "brittle"));
    metrics.maxStatuses.thunderMark = Math.max(metrics.maxStatuses.thunderMark, statusValue(enemy, "thunderMark"));
    metrics.maxStatuses.stun = Math.max(metrics.maxStatuses.stun, statusValue(enemy, "stun"));
  }
}

function recordFinalRouteSeen(run, metrics) {
  const choices = run.nodeChoices ?? [];
  if (choices.some((node) => node.id === "shop_final")) metrics.finalRoute.shopSeen = true;
  if (choices.some((node) => node.id === "side_final")) metrics.finalRoute.sideSeen = true;
}

function recordFinalRouteVisit(node, metrics) {
  if (node?.id === "shop_final") metrics.finalRoute.shopVisited = true;
  if (node?.id === "side_final") metrics.finalRoute.sideVisited = true;
}

function recordCardPlay(metrics, card) {
  const style = card?.style ?? "neutral";
  metrics.cardPlays[style] = (metrics.cardPlays[style] ?? 0) + 1;
}

function recordReward(metrics, reward) {
  if (reward.type !== "card") return;
  const style = cards[reward.value]?.style ?? "neutral";
  metrics.rewardPicks[style] = (metrics.rewardPicks[style] ?? 0) + 1;
}

function summarize(items) {
  const count = (predicate) => items.filter(predicate).length;
  const avg = (values) => round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return {
    runs: items.length,
    profile,
    mythMode,
    seed: baseSeed,
    winRate: ratio(count((item) => item.won), items.length),
    bossWinRate: ratio(count((item) => item.completedBy === "boss"), items.length),
    specialWinRate: ratio(count((item) => item.completedBy === "special"), items.length),
    lossRate: ratio(count((item) => !item.won), items.length),
    avgFinalFloor: avg(items.map((item) => item.floor)),
    avgDeckSize: avg(items.map((item) => item.deckSize)),
    avgRelics: avg(items.map((item) => item.relics)),
    avgMaxEnergy: avg(items.map((item) => item.maxEnergy)),
    avgCombats: avg(items.map((item) => item.combats)),
    avgTurnsEnded: avg(items.map((item) => item.turns)),
    avgMinHp: avg(items.map((item) => Number.isFinite(item.minHp) ? item.minHp : 0)),
    avgMaxBlock: avg(items.map((item) => item.maxBlock)),
    maxStatuses: {
      bleed: avg(items.map((item) => item.maxStatuses.bleed)),
      poison: avg(items.map((item) => item.maxStatuses.poison)),
      burn: avg(items.map((item) => item.maxStatuses.burn)),
      chaos: avg(items.map((item) => item.maxStatuses.chaos)),
      bind: avg(items.map((item) => item.maxStatuses.bind)),
      brittle: avg(items.map((item) => item.maxStatuses.brittle)),
      thunderMark: avg(items.map((item) => item.maxStatuses.thunderMark)),
      stun: avg(items.map((item) => item.maxStatuses.stun)),
      battleIntent: avg(items.map((item) => item.maxStatuses.battleIntent)),
      spirit: avg(items.map((item) => item.maxStatuses.spirit)),
    },
    finalRoute: {
      shopSeen: count((item) => item.finalRoute.shopSeen),
      sideSeen: count((item) => item.finalRoute.sideSeen),
      shopVisited: count((item) => item.finalRoute.shopVisited),
      sideVisited: count((item) => item.finalRoute.sideVisited),
    },
    cardPlays: mergeStyleMaps(items.map((item) => item.cardPlays)),
    rewardPicks: mergeStyleMaps(items.map((item) => item.rewardPicks)),
    mythAwards: mergeMythAwards(items.map((item) => item.mythAwardTags)),
    avgMythPoints: avg(items.map((item) => item.mythAwardPoints)),
    estimatedRunsToMaxMyth: round(MYTH_MASTERY_TOTAL / Math.max(0.001, avg(items.map((item) => item.mythAwardPoints)))),
  };
}

function printSummary(summary) {
  console.log(`玄箓行发布前模拟：${summary.runs} 局 / profile=${summary.profile} / myth=${summary.mythMode} / seed=${summary.seed}`);
  console.log(`胜率 ${pct(summary.winRate)}，Boss 通关 ${pct(summary.bossWinRate)}，特殊通关 ${pct(summary.specialWinRate)}，失败 ${pct(summary.lossRate)}`);
  console.log(`平均层数 ${summary.avgFinalFloor}，平均牌组 ${summary.avgDeckSize}，平均遗物 ${summary.avgRelics}，平均能量上限 ${summary.avgMaxEnergy}`);
  console.log(`平均最大格挡 ${summary.avgMaxBlock}，平均最低生命 ${summary.avgMinHp}`);
  console.log(`状态峰值均值：流血 ${summary.maxStatuses.bleed}，毒瘴 ${summary.maxStatuses.poison}，灼烧 ${summary.maxStatuses.burn}，离间 ${summary.maxStatuses.chaos}，禁锢 ${summary.maxStatuses.bind}，脆化 ${summary.maxStatuses.brittle}，雷痕 ${summary.maxStatuses.thunderMark}，眩晕 ${summary.maxStatuses.stun}，战意 ${summary.maxStatuses.battleIntent}，灵气 ${summary.maxStatuses.spirit}`);
  console.log(`终局路线检查：商店出现 ${summary.finalRoute.shopSeen}/${summary.runs}，支线出现 ${summary.finalRoute.sideSeen}/${summary.runs}，商店进入 ${summary.finalRoute.shopVisited}/${summary.runs}，支线进入 ${summary.finalRoute.sideVisited}/${summary.runs}`);
  console.log(`出牌分布：${styleLine(summary.cardPlays)}`);
  console.log(`奖励选择：${styleLine(summary.rewardPicks)}`);
  console.log(`派系箓印结算：${mythLine(summary.mythAwards)}`);
  console.log(`平均箓印点 ${summary.avgMythPoints}，全派系满级估算 ${summary.estimatedRunsToMaxMyth} 局`);
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      parsed[key] = value ?? true;
    }
  }
  return parsed;
}

function emptyStyleMap() {
  return Object.fromEntries([...STYLE_IDS, "neutral"].map((style) => [style, 0]));
}

function mergeStyleMaps(maps) {
  const result = emptyStyleMap();
  for (const map of maps) {
    for (const [style, value] of Object.entries(map)) {
      result[style] = (result[style] ?? 0) + value;
    }
  }
  return result;
}

function mergeMythAwards(tagGroups) {
  const result = Object.fromEntries([...MYTH_FACTIONS, "none"].map((tag) => [tag, 0]));
  for (const tags of tagGroups) {
    if (tags.length === 0) {
      result.none += 1;
      continue;
    }
    for (const tag of tags) {
      result[tag] = (result[tag] ?? 0) + 1;
    }
  }
  return result;
}

function statusValue(fighter, statusId) {
  return fighter?.statuses?.find((status) => status.id === statusId)?.stacks ?? 0;
}

function targetHasDebuff(target) {
  return ["burn", "bleed", "poison", "curse", "chaos", "bind", "brittle", "stasis", "thunderMark", "stun"].some((status) => statusValue(target, status) > 0);
}

function controlPressure(target) {
  return statusValue(target, "chaos") + statusValue(target, "bind") + statusValue(target, "stun");
}

function recoverScore(run, card) {
  const effects = card.effects.filter((effect) => effect.type === "recoverDiscard");
  if (run.combat.discardPile.length === 0) return -8;

  let score = 18;
  if (profile !== "control") return score;

  const canRecoverControl = effects.some((effect) => !effect.excludeStyles?.includes("control"));
  const hasControlInDiscard = run.combat.discardPile.some((item) => cards[item.cardId]?.style === "control");
  if (canRecoverControl && hasControlInDiscard) score += 38;
  if (!canRecoverControl) score -= 6;
  return score;
}

function effectType(card, type) {
  return card.effects.some((effect) => effect.type === type);
}

function rarityScore(rarity) {
  return { common: 4, rare: 12, epic: 22, legendary: 34 }[rarity] ?? 0;
}

function ratio(value, total) {
  return round(value / total);
}

function round(value) {
  return Number(value.toFixed(3));
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function styleLine(map) {
  return [...STYLE_IDS, "neutral"].map((style) => `${style} ${map[style] ?? 0}`).join(" / ");
}

function mythLine(map) {
  return [...MYTH_FACTIONS, "none"].map((tag) => `${tag} ${map[tag] ?? 0}`).join(" / ");
}
