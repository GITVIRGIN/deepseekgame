import { discardHandCard, endTurn, playCard } from "./combat.js";
import { startCombat } from "./combat.js";
import { selectNode } from "./nodes.js";
import { buyShopItem, enterShop, leaveShop } from "./shop.js";
import { chooseReward } from "./rewards.js";
import { cancelDiscardPick, pickDiscardCard } from "./effects.js";
import { purchaseTalent } from "./progression.js";
import { cloneState, createInitialState, startRun } from "./state.js";

export function reduceGame(state, action) {
  const next = cloneState(state);

  if (action.type === "startRun") {
    return startRun(next);
  }

  if (action.type === "abandonRun") {
    next.message = "你折断残箓，重新入山。";
    return startRun(next);
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
