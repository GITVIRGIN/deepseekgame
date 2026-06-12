import { discardHandCard, endTurn, playCard } from "./combat.js";
import { startCombat } from "./combat.js";
import { selectNode } from "./nodes.js";
import { buyShopItem, enterShop, leaveShop } from "./shop.js";
import { chooseReward, rollRewards, skipReward } from "./rewards.js";
import { cancelDiscardPick, pickDiscardCard } from "./effects.js";
import { awardMythMasteryForRunEnd, mythAwardText } from "./myth.js";
import { purchaseTalent } from "./progression.js";
import { cloneState, createInitialState, startRun, makeCard, isTrueMartialUnlocked } from "./state.js";
import { relics, cards, trueMartialDecks } from "./data.js";
import { DIFFICULTY_BEGINNER, DIFFICULTY_REGULAR, DIFFICULTY_TRUE_MARTIAL, MIN_DECK_SIZE, UNDELETABLE_CARD_IDS } from "./types.js";
import { finishCurrentNode, prepareRouteChoice } from "./nodes.js";

// ---- Safe purge helpers ----

function normalizeFilter(filter) {
  if (filter === "any" || filter === "basic" || filter === "twoWithCurse") return filter;
  // Backward compat: old string pendingPurge
  if (typeof filter === "string") {
    if (filter === "any" || filter === "basic") return filter;
    if (filter === "twoWithCurse") return "twoWithCurse";
    return "any";
  }
  return "any";
}

function canPurgeCard(run, cardInstance, filter) {
  const def = cards[cardInstance.cardId];
  if (!def) return false;
  // Never delete undeletable cards
  if (def.undeletable) return false;
  // UNDELETABLE_CARD_IDS check
  if (UNDELETABLE_CARD_IDS.has(cardInstance.cardId)) return false;
  // Never delete curse/业障 cards — applies to ALL filters including twoWithCurse
  if (def.isCurse) return false;
  // "basic" filter: only basic cards
  if (filter === "basic") {
    const basicIds = ["strike", "guard", "yellowCharm", "meditate"];
    return basicIds.includes(cardInstance.cardId);
  }
  // "any" and "twoWithCurse": any non-curse non-undeletable card
  return true;
}

function purgeCardByUid(run, cardUid) {
  const idx = run.deck.findIndex(c => c.uid === cardUid);
  if (idx < 0) return null;
  const cardInstance = run.deck[idx];
  run.deck.splice(idx, 1);
  return cardInstance;
}

// ---- Main reducer ----

export function reduceGame(state, action) {
  const next = cloneState(state);

  if (action.type === "startRun") {
    return startRun(next, { difficulty: DIFFICULTY_BEGINNER });
  }

  if (action.type === "startRegular") {
    return startRun(next, { difficulty: DIFFICULTY_REGULAR });
  }

  if (action.type === "martialSelect") {
    // V2.5: guard — must be unlocked, must be home or gameOver
    if (!isTrueMartialUnlocked(next.meta)) {
      next.message = "真武模式尚未解锁。";
      return next;
    }
    if (next.phase !== "home" && next.phase !== "gameOver") {
      return next;
    }
    next.phase = "martialSelect";
    return next;
  }

  if (action.type === "cancelMartial") {
    // V2.5: return to gameOver if run was finished, else home
    next.phase = (next.run?.finished) ? "gameOver" : "home";
    return next;
  }

  if (action.type === "startTrueMartial") {
    // V2.5: guard — must be unlocked, must be in martialSelect, style must be valid
    if (!isTrueMartialUnlocked(next.meta)) {
      next.message = "真武模式尚未解锁。";
      return next;
    }
    if (next.phase !== "martialSelect") {
      return next;
    }
    const validStyles = Object.keys(trueMartialDecks);
    if (!validStyles.includes(action.style)) {
      next.message = "未知真武流派。";
      return next;
    }
    return startRun(next, { difficulty: DIFFICULTY_TRUE_MARTIAL, trueMartialStyle: action.style });
  }

  if (action.type === "abandonRun") {
    if (!next.run || next.run.finished || next.run.endHandled) return next;

    next.run.endHandled = true;
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

  if (action.type === "rollRewards") {
    return rollRewards(next);
  }

  if (action.type === "skipReward") {
    return skipReward(next);
  }

  // ---- Purge system: confirmPurge (unified, no cancel) ----
  if (action.type === "confirmPurge") {
    const run = next.run;
    if (!run || !run.pendingPurge) return next;
    // V1.5: reject purge if run already finished or game over
    if (run.finished || next.phase === "gameOver") {
      run.pendingPurge = null;
      return next;
    }

    // Normalize pendingPurge: string (old) or object (new)
    let purge = run.pendingPurge;
    if (typeof purge === "string") {
      purge = {
        source: "shop",
        filter: purge,
        remaining: purge === "twoWithCurse" ? 2 : 1,
        addCurseOnComplete: purge === "twoWithCurse",
        removedNames: [],
      };
      run.pendingPurge = purge;
    }

    const filter = normalizeFilter(purge.filter);
    const cardUid = action.cardUid;

    // CQA-P2-001: null/undefined cardUid = AI has no purgeable card → safe exit
    if (!cardUid) {
      run.pendingPurge = null;
      if (purge.finishNodeOnComplete) {
        finishCurrentNode(run);
        return prepareRouteChoice(next);
      }
      return next;
    }

    // Check min deck size
    if (run.deck.length <= MIN_DECK_SIZE) {
      next.message = `牌组已精炼至最低数量 ${MIN_DECK_SIZE}，无法继续剔除。`;
      // Still need to finish: if side purge, move on. If shop, clear and allow continue.
      run.pendingPurge = null;
      if (purge.finishNodeOnComplete) {
        finishCurrentNode(run);
        return prepareRouteChoice(next);
      }
      return next;
    }

    const cardInstance = run.deck.find(c => c.uid === cardUid);
    if (!cardInstance) {
      next.message = "找不到该卡牌。";
      return next;
    }

    if (!canPurgeCard(run, cardInstance, filter)) {
      const def = cards[cardInstance.cardId];
      const name = def ? def.name : "未知牌";
      if (filter === "basic") {
        next.message = `散功符只能剔除基础牌（斩妖式/护身咒/黄符/调息），【${name}】不在可删除范围。`;
      } else if (def?.isCurse) {
        next.message = `普通删牌无法剔除【${name}】（业障/诅咒牌需要特殊机制）。`;
      } else {
        next.message = `【${name}】不可删除。`;
      }
      return next;
    }

    // Perform deletion
    const removed = purgeCardByUid(run, cardUid);
    if (!removed) return next;
    const removedDef = cards[removed.cardId];
    const removedName = removedDef ? removedDef.name : "未知牌";
    purge.removedNames.push(removedName);

    purge.remaining -= 1;

    if (purge.remaining <= 0) {
      // All deletions complete
      const names = purge.removedNames.join("】和【");

      // Add karmaCurse on complete if needed
      if (purge.addCurseOnComplete) {
        const curseCard = makeCard(run, "karmaCurse");
        run.deck.push(curseCard);
        next.message = `已剔除【${names}】，但业障入牌组。`;
      } else {
        next.message = `已剔除【${names}】，卡组更加精简。`;
      }

      run.pendingPurge = null;

      // If this was a side purge reward, finish node and continue
      if (purge.finishNodeOnComplete) {
        finishCurrentNode(run);
        return prepareRouteChoice(next);
      }

      return next;
    }

    // More cards to remove
    next.message = `已剔除【${removedName}】，还需剔除 ${purge.remaining} 张。`;
    return next;
  }

  if (action.type === "reset") {
    return createInitialState();
  }

  return next;
}
