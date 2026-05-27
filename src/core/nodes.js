import { MAX_FLOOR, TIER_SIZE } from "./types.js";

const tierNames = ["山门外", "妖雾岭", "黑山道"];

export function tierForFloor(floor) {
  return Math.min(3, Math.max(1, Math.ceil(floor / TIER_SIZE)));
}

export function isTierGateFloor(floor) {
  return floor > 0 && floor % TIER_SIZE === 0 && floor < MAX_FLOOR;
}

export function prepareRouteChoice(state) {
  const run = state.run;
  if (!run || run.finished) return state;

  ensureShopTiers(run);
  run.nodeChoices = buildNodeChoices(run);
  run.currentNode = null;
  state.phase = "route";
  state.message = "选择下一步行程。";
  return state;
}

export function selectNode(state, nodeId) {
  const run = state.run;
  if (!run) return state;

  const node = (run.nodeChoices ?? []).find((item) => item.id === nodeId);
  if (!node) return state;

  run.currentNode = node;
  run.nodeChoices = [];
  if (node.type === "shop" || node.type === "side") run.routeCooldown = true;
  return state;
}

export function finishCurrentNode(run) {
  const node = run.currentNode;
  if (!node) {
    run.floor += 1;
    return;
  }

  if (node.type === "main") {
    run.floor += 1;
  }

  if (node.type === "side") {
    run.completedSideTiers = run.completedSideTiers ?? {};
    run.completedSideTiers[node.tier] = (run.completedSideTiers[node.tier] ?? 0) + 1;
    if (node.id === "side_final") {
      run.finalSideCompleted = true;
    }
  }

  run.currentNode = null;
}

function buildNodeChoices(run) {
  const tier = tierForFloor(run.floor);
  const tierName = tierNames[tier - 1];
  const visitedShopTiers = run.visitedShopTiers ?? [];
  const finalFloor = run.floor >= MAX_FLOOR;
  const choices = [
    {
      id: `main_${run.floor}`,
      type: "main",
      tier,
      title: run.floor >= MAX_FLOOR ? "关底 Boss" : `主线 ${run.floor}/${MAX_FLOOR}`,
      text: run.floor >= MAX_FLOOR ? "黑山老妖守在山路尽头。" : `${tierName} 的主线战斗，推进通关进度。`,
      rewardText: isTierGateFloor(run.floor) ? "精品奖励" : "卡牌奖励",
      rewardKind: isTierGateFloor(run.floor) ? "tierPremium" : "normal",
    },
  ];

  if (finalFloor) {
    const finalChoices = [];

    if (!run.finalSideCompleted) {
      finalChoices.push({
        id: "side_final",
        type: "side",
        tier,
        title: "终局支线",
        text: "黑山脚下最后一处岔路，敌人更硬，但能把临门一脚的资源补足。",
        rewardText: "高额金币 / 遗物 / 回复",
        rewardKind: "side",
      });
    }

    if (!run.finalShopVisited) {
      finalChoices.push({
        id: "shop_final",
        type: "shop",
        tier,
        title: "终局商店",
        text: "最终 Boss 前的补给点，把本局攒下的金币转化成战力。",
        rewardText: "终局补给",
        rewardKind: "shop",
      });
    }

    return [...finalChoices, ...choices];
  }

  const completedSideTiers = run.completedSideTiers ?? {};
  const branch = run.routeCooldown ? null : branchForFloor(run, tier, completedSideTiers, visitedShopTiers);
  run.routeCooldown = false;

  if (branch === "side") {
    choices.push({
      id: `side_${tier}`,
      type: "side",
      tier,
      title: `${tierName} 支线`,
      text: "绕路探索，不推进主线层数，中后期敌人更硬，奖励偏资源。",
      rewardText: "高额金币 / 遗物 / 回复",
      rewardKind: "side",
    });
  }

  if (branch === "shop") {
    choices.push({
      id: `shop_${tier}`,
      type: "shop",
      tier,
      title: `${tierName} 商店`,
      text: "使用关卡掉落的金钱，购买本局内的属性和道具提升。",
      rewardText: "局内道具",
      rewardKind: "shop",
    });
  }

  return choices;
}

export function ensureShopTiers(run) {
  if (Array.isArray(run.shopTiers) && run.shopTiers.length > 0) return;

  run.shopTiers = [1, 2, 3].filter((tier) => routeRoll(run.seed, tier, 0) < 65);
}

function branchForFloor(run, tier, completedSideTiers, visitedShopTiers) {
  if (run.floor <= 1 || run.floor >= MAX_FLOOR) return null;

  const roll = routeRoll(run.seed, tier, run.floor);
  const canShop = (run.shopTiers ?? []).includes(tier) && !visitedShopTiers.includes(tier);
  const sideMax = tier >= 2 ? 2 : 1;
  const canSide = (completedSideTiers[tier] ?? 0) < sideMax;

  if (canShop && roll < 24) return "shop";
  if (canSide && roll >= 24 && roll < 62) return "side";

  return null;
}

function routeRoll(seed, tier, floor) {
  return Math.abs((seed + tier * 92821 + floor * 68917) % 100);
}
