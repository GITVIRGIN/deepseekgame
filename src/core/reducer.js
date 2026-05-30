import { discardHandCard, endTurn, playCard } from "./combat.js";
import { startCombat } from "./combat.js";
import { selectNode } from "./nodes.js";
import { buyShopItem, enterShop, leaveShop } from "./shop.js";
import { chooseReward } from "./rewards.js";
import { cancelDiscardPick, pickDiscardCard } from "./effects.js";
import { awardMythMasteryForRunEnd, mythAwardText } from "./myth.js";
import { purchaseTalent } from "./progression.js";
import { cloneState, createInitialState, startRun } from "./state.js";
import { relics } from "./data.js";

export function reduceGame(state, action) {
  const next = cloneState(state);

  if (action.type === "startRun") {
    return startRun(next);
  }

  if (action.type === "martialSelect") {
    next.phase = "martialSelect";
    // 首次进入真武选择页赠送一个真武专属遗物收藏记录（仅 meta.collectedRelics）。
    // 不影响真武开局按流派获得专属遗物（startRun 在 startTrueMartial 中按 style 写入 run.relics）。
    // 条件保证玩家已拥有任一真武遗物后不会再触发，不会重复刷奖励。
    const owned = (next.meta.collectedRelics ?? []);
    const tmRelicIds = ["poJunLing","nineSkyTribulation","asuraHeart","venomScripture","chaosTreasure","turtleShell"];
    if (!tmRelicIds.some(id => owned.includes(id))) {
      const avail = tmRelicIds.filter(id => !owned.includes(id));
      if (avail.length > 0) {
        const pick = avail[Math.floor(Math.abs((next.run?.seed ?? 1) * 7 + (next.meta.wins ?? 0) * 13) % avail.length)];
        next.meta.collectedRelics = [...owned, pick];
        next.message = `真武初现！获得专属遗物「${pick}」。`;
      }
    }
    return next;
  }

  if (action.type === "cancelMartial") {
    next.phase = "home";
    return next;
  }

  if (action.type === "startTrueMartial") {
    return startRun(next, action.style);
  }

  if (action.type === "abandonRun") {
    if (!next.run || next.run.finished) return next;

    const soulGain = Math.max(3, next.run.floor * 2);
    const mythAward = awardMythMasteryForRunEnd(next, "abandon");
    next.run.finished = true;
    next.run.combat = null;
    next.run.rewards = [];
    next.run.pendingChoice = null;
    next.phase = "gameOver";
    next.meta.soul += soulGain;
    next.meta.lossStreak = (next.meta.lossStreak ?? 0) + 1;
    next.meta.collectedRelics = [...new Set([...(next.meta.collectedRelics ?? []), ...(next.run.relics ?? [])])];
    next.message = `你主动放弃本局，收拢残魂 +${soulGain}。${mythAward ? ` ${mythAwardText(mythAward)}` : ""}`;
    return next;
  }

  if (action.type === "playCard") {
    return playCard(next, action.cardUid, action.targetUid);
  }

  if (action.type === "chooseNode") {
    const routed = selectNode(next, action.nodeId);
    if (routed.run?.currentNode?.type === "shop") {
      return enterShop(routed);
    }
    return startCombat(routed);
  }

  if (action.type === "buyShopItem") {
    return buyShopItem(next, action.itemId);
  }

  if (action.type === "leaveShop") {
    return leaveShop(next);
  }

  if (action.type === "buyTalent") {
    return purchaseTalent(next, action.talentId);
  }

  if (action.type === "endTurn") {
    return endTurn(next);
  }

  if (action.type === "discardHandCard") {
    return discardHandCard(next, action.cardUid);
  }

  if (action.type === "pickDiscardCard") {
    return pickDiscardCard(next, action.cardUid);
  }

  if (action.type === "cancelDiscardPick") {
    return cancelDiscardPick(next);
  }

  if (action.type === "chooseReward") {
    return chooseReward(next, action.rewardId);
  }

  if (action.type === "reset") {
    return createInitialState();
  }

  return next;
}
