import { discardHandCard, endTurn, playCard } from "./combat.js";
import { startCombat } from "./combat.js";
import { selectNode } from "./nodes.js";
import { buyShopItem, enterShop, leaveShop } from "./shop.js";
import { chooseReward } from "./rewards.js";
import { cancelDiscardPick, pickDiscardCard } from "./effects.js";
import { awardMythMasteryForRunEnd, mythAwardText } from "./myth.js";
import { purchaseTalent } from "./progression.js";
import { cloneState, createInitialState, startRun } from "./state.js";

export function reduceGame(state, action) {
  const next = cloneState(state);

  if (action.type === "startRun") {
    return startRun(next);
  }

  if (action.type === "martialSelect") {
    next.phase = "martialSelect";
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
