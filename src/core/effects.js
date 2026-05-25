import { cards, relics } from "./data.js";
import { drawCards, finishCombatIfWon } from "./combat.js";
import { addStatus, reduceConsumableDebuff, reduceStatus, statusLabel, statusStacks } from "./status.js";

const SPIRIT_BONUS_PER_COST = 4;

function combatLog(state, text) {
  state.run?.combat?.log.push(text);
}

function playerFighter(run) {
  return {
    uid: "player",
    hp: run.hp,
    maxHp: run.maxHp,
    block: run.combat?.block ?? 0,
    statuses: run.statuses,
  };
}

function syncPlayerFighter(run, fighter) {
  run.hp = fighter.hp;
  if (run.combat) {
    run.combat.block = fighter.block;
  }
  run.statuses = fighter.statuses;
}

export function applyEffect(state, effect, targetUid) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat) return state;

  if (effect.type === "draw") {
    const requested = effect.value ?? 0;
    const crit = Math.random() < 0.1 ? 2 : 1;
    const drawn = drawCards(state, requested * crit);
    if (crit > 1) combatLog(state, "暴击！");
    combatLog(state, `抽 ${drawn} 张牌。`);
    if (drawn > 0) addStatus(playerFighter(run), "fatigue", drawn);
    return finishCombatIfWon(state);
  }

  if (effect.type === "gainEnergy") {
    const before = run.energy;
    run.energy = Math.min(run.maxEnergy, run.energy + (effect.value ?? 0));
    combatLog(state, `获得 ${run.energy - before} 点能量。`);
    return finishCombatIfWon(state);
  }

  if (effect.type === "recoverDiscard") {
    const count = effect.value ?? 1;
    startDiscardPick(state, count, effect.sourceUid, effect.excludeStyle);
    addStatus(playerFighter(run), "fatigue", count);
    return finishCombatIfWon(state);
  }

  const targets = resolveTargets(run, effect.target, targetUid);

  if (effect.type === "leechBleed") {
    let totalBleed = 0;
    const names = [];
    for (const target of targets) {
      totalBleed += statusStacks(target, "bleed");
      names.push(target.name);
    }
    const heal = Math.floor(totalBleed * (effect.value ?? 0.3));
    if (heal > 0) {
      const player = playerFighter(run);
      player.hp = Math.min(player.maxHp, player.hp + heal);
      syncPlayerFighter(run, player);
      combatLog(state, `从 ${names.join("、")} 的流血中汲取 ${heal} 点生命。`);
    }
    return finishCombatIfWon(state);
  }

  for (const target of targets) {
    if (effect.type === "damage") {
      applyCardDamage(state, target, effect.value ?? 0, effect.cardCost ?? 1, effect.cardStyle);
    }

    if (effect.type === "execute") {
      const threshold = effect.threshold ?? 0.25;
      if (target.hp > 0 && target.hp <= target.maxHp * threshold) {
        target.block = 0;
        target.hp = 0;
        combatLog(state, `${target.name} 血线见底——斩魂索命，直接斩杀！`);
      } else {
        applyCardDamage(state, target, effect.value ?? 25, effect.cardCost ?? 1, effect.cardStyle);
        combatLog(state, `${target.name} 未入斩杀线，转为普通一击。`);
      }
    }

    if (effect.type === "block") {
      target.block += effect.value ?? 0;
      combatLog(state, `获得 ${effect.value} 点格挡。`);
    }

    if (effect.type === "heal") {
      target.hp = Math.min(target.maxHp, target.hp + (effect.value ?? 0));
      combatLog(state, `回复 ${effect.value} 点生命。`);
    }

    if (effect.type === "loseHp") {
      target.hp = Math.max(0, target.hp - (effect.value ?? 0));
      combatLog(state, `失去 ${effect.value} 点生命。`);
    }

    if (effect.type === "status" && effect.status) {
      addStatus(target, effect.status, effect.stacks ?? 0);
      combatLog(state, `${target.uid === "player" ? "你" : target.name} 获得 ${statusLabel(effect.status)} ${effect.stacks}。`);
    }

    if (effect.type === "amplifyDebuffs") {
      const added = amplifyDebuffs(target, effect.statuses, effect.value ?? 0);
      if (added > 0) {
        combatLog(state, `${target.uid === "player" ? "你" : target.name} 的负面状态增长 ${added} 层。`);
      }
    }

    if (effect.type === "spikeBurst") {
      const spikes = statusStacks(playerFighter(run), "spikes");
      const block = run.combat?.block ?? 0;
      const raw = Math.min(block, spikes * 3);
      if (raw > 0) {
        const blocked = Math.min(target.block, raw);
        target.block -= blocked;
        target.hp = Math.max(0, target.hp - (raw - blocked));
        combatLog(state, `荆棘爆发！${target.name} 受到 ${raw - blocked} 点格挡反射伤害。`);
      }
    }

    if (effect.type === "doubleBlock") {
      if (run.combat) {
        const before = run.combat.block;
        run.combat.block *= 2;
        combatLog(state, `格挡翻倍：${before} → ${run.combat.block}。`);
      }
    }

    if (target.uid === "player") {
      syncPlayerFighter(run, target);
    }
  }

  return finishCombatIfWon(state);
}

export function applyCardDamage(state, target, baseDamage, cardCost = 1, cardStyle = null) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || target.hp <= 0) return;

  const spirit = statusStacks(playerFighter(run), "spirit");
  const curse = statusStacks(target, "curse");
  const fury = cardStyle === "physical" ? statusStacks(playerFighter(run), "fury") : 0;
  const spiritBonus = Math.min(spirit, Math.max(1, cardCost) * SPIRIT_BONUS_PER_COST);
  const brittle = statusStacks(target, "brittle") > 0 ? 1.5 : 1;
  let damage = Math.floor((baseDamage + spiritBonus + curse + fury * 3) * brittle);

  if (run.relics.includes("thunderSeal") && !combat.flags.thunderSealUsed) {
    damage += 4;
    combat.flags.thunderSealUsed = true;
    combatLog(state, `${relics.thunderSeal.name} 追加 4 点雷伤。`);
  }

  damage = applyBlock(target, damage);
  target.hp = Math.max(0, target.hp - damage);
  combatLog(state, `对 ${target.name} 造成 ${damage} 点伤害。`);

  const bleed = statusStacks(target, "bleed");
  if (bleed > 0 && target.hp > 0) {
    const bleedDamage = applyBlock(target, bleed);
    target.hp = Math.max(0, target.hp - bleedDamage);
    const reduced = reduceConsumableDebuff(target, "bleed", 1);
    combatLog(state, `${target.name} 流血爆开，格挡抵消 ${bleed - bleedDamage} 点，额外受到 ${bleedDamage} 点伤害${reduced ? "。" : "，凝滞保留了流血。"}`);
  }

  if (target.hp <= 0) {
    onEnemyKilled(state, target);
  }
}

export function applyIncomingDamage(state, rawDamage) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat) return;

  const player = playerFighter(run);
  let damage = rawDamage + statusStacks(player, "curse");

  const ward = statusStacks(player, "ward");
  if (ward > 0) {
    const blockedByWard = Math.min(ward, damage);
    damage -= blockedByWard;
    reduceStatus(player, "ward", blockedByWard);
    combatLog(state, `护体抵消 ${blockedByWard} 点伤害。`);
  }

  damage = applyBlock(player, damage);
  player.hp = Math.max(0, player.hp - damage);
  syncPlayerFighter(run, player);
  combatLog(state, `你受到 ${damage} 点伤害。`);

  if (run.hp <= 0) {
    finishDefeat(state, "你倒在山道上，残箓化作微光。");
  }
}

export function tickDamageStatus(state, fighter, statusId) {
  const stacks = statusStacks(fighter, statusId);
  if (stacks <= 0) return;

  const damage = applyBlock(fighter, stacks);
  fighter.hp = Math.max(0, fighter.hp - damage);
  const blocked = stacks - damage;
  combatLog(state, `${fighter.uid === "player" ? "你" : fighter.name} 受到 ${statusLabel(statusId)} ${damage} 点伤害${blocked > 0 ? `，格挡抵消 ${blocked} 点` : ""}。`);

  if (["bleed", "poison"].includes(statusId)) {
    const reduced = reduceConsumableDebuff(fighter, statusId, 1);
    if (!reduced) {
      combatLog(state, `${fighter.uid === "player" ? "你" : fighter.name} 的${statusLabel(statusId)}被凝滞保留。`);
    }
  }

  if (statusId === "burn") {
    const burnFade = Math.max(1, Math.ceil(stacks / 2));
    reduceStatus(fighter, "burn", burnFade);
    combatLog(state, `${fighter.uid === "player" ? "你" : fighter.name} 的灼烧消退 ${burnFade} 层。`);
  }

  if (fighter.uid === "player") {
    syncPlayerFighter(state.run, fighter);
    if (state.run.hp <= 0) {
      finishDefeat(state, "毒火入骨，行旅止步。");
    }
  } else if (fighter.hp <= 0) {
    onEnemyKilled(state, fighter);
  }
}

export function applyCardEffects(state, cardInstance, targetUid) {
  const card = cards[cardInstance.cardId];
  for (const effect of card.effects) {
    applyEffect(state, { ...effect, sourceUid: cardInstance.uid, cardCost: card.cost, cardStyle: card.style }, targetUid);
    if (state.phase !== "combat") {
      break;
    }
  }
}

export function pickDiscardCard(state, cardUid) {
  const run = state.run;
  const combat = run?.combat;
  const choice = run?.pendingChoice;
  if (!run || !combat || choice?.type !== "discardPick") return state;

  const index = combat.discardPile.findIndex((card) => card.uid === cardUid && card.uid !== choice.sourceUid);
  if (index < 0) return state;

  // 二次校验：如果限制了流派，不允许回收该流派卡牌
  if (choice.excludeStyle) {
    const cardDef = cards[combat.discardPile[index].cardId];
    if (cardDef?.style === choice.excludeStyle) {
      combat.log.push("拾遗诀无法回收控制牌。");
      return state;
    }
  }

  const [card] = combat.discardPile.splice(index, 1);
  combat.hand.push(card);
  combat.log.push(`从弃牌堆取回 ${cards[card.cardId].name}。`);

  choice.count -= 1;
  if (choice.count <= 0 || recoverableDiscardCards(combat, choice).length === 0) {
    run.pendingChoice = null;
  }

  return state;
}

export function cancelDiscardPick(state) {
  const run = state.run;
  if (run?.pendingChoice?.type === "discardPick") {
    run.pendingChoice = null;
    run.combat?.log.push("放弃回收弃牌。");
  }
  return state;
}

function startDiscardPick(state, count, sourceUid, excludeStyle = null) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat) return;

  const choice = {
    type: "discardPick",
    count,
    sourceUid,
    excludeStyle,
    title: `从弃牌堆选择 ${count} 张牌加入手牌`,
  };

  if (recoverableDiscardCards(combat, choice).length === 0) {
    combat.log.push(excludeStyle ? "弃牌堆没有可回收的非控制牌。" : "弃牌堆没有可回收的牌。");
    return;
  }

  run.pendingChoice = choice;
  combat.log.push(choice.title + "。");
}

function recoverableDiscardCards(combat, choice) {
  let list = combat.discardPile.filter((ci) => ci.uid !== choice.sourceUid);
  if (choice.excludeStyle) {
    list = list.filter((ci) => {
      const def = cards[ci.cardId];
      return def?.style !== choice.excludeStyle;
    });
  }
  return list;
}

function resolveTargets(run, targetType, targetUid) {
  const combat = run.combat;
  if (!combat) return [];

  if (targetType === "self") {
    return [playerFighter(run)];
  }

  if (targetType === "allEnemies") {
    return combat.enemies.filter((enemy) => enemy.hp > 0);
  }

  const selected = combat.enemies.find((enemy) => enemy.uid === targetUid && enemy.hp > 0);
  return selected ? [selected] : combat.enemies.filter((enemy) => enemy.hp > 0).slice(0, 1);
}

function amplifyDebuffs(target, statuses, value) {
  const debuffs = statuses ?? ["burn", "bleed", "poison", "curse", "chaos", "stasis"];
  let added = 0;

  for (const statusId of debuffs) {
    const stacks = statusStacks(target, statusId);
    if (stacks > 0) {
      addStatus(target, statusId, value);
      added += value;
    }
  }

  return added;
}

function applyBlock(fighter, rawDamage) {
  const blocked = Math.min(fighter.block, rawDamage);
  fighter.block -= blocked;
  return rawDamage - blocked;
}

function onEnemyKilled(state, enemy) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || combat.flags[`killed_${enemy.uid}`]) return;

  combat.flags[`killed_${enemy.uid}`] = true;
  combatLog(state, `${enemy.name} 被击败。`);

  if (run.relics.includes("bloodGourd") && !combat.flags.bloodGourdUsed) {
    run.hp = Math.min(run.maxHp, run.hp + 5);
    combat.flags.bloodGourdUsed = true;
    combatLog(state, "血葫芦回涌，回复 5 点生命。");
  }

  if (run.relics.includes("ghostLantern")) {
    for (const other of combat.enemies) {
      if (other.hp > 0) {
        addStatus(other, "curse", 2);
      }
    }
    combatLog(state, "引魂灯摇动，余敌皆染诅咒 2。");
  }
}

function finishDefeat(state, message) {
  const run = state.run;
  if (!run || run.finished) return;

  run.finished = true;
  state.phase = "gameOver";
  state.message = message;
  state.meta.soul += Math.max(3, run.floor * 2);
  state.meta.lossStreak = (state.meta.lossStreak ?? 0) + 1;
}
