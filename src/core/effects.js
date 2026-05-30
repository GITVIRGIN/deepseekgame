import { cards, relics } from "./data.js";
import { drawCards, finishCombatIfWon } from "./combat.js";
import { onEnemyKilled } from "./combat-events.js";
import { awardMythMasteryForRunEnd, cardMythBoost, consumeMythFirstStrike, mythAwardText, mythFirstStrikeDamageBonus, mythStatusDamageBonus } from "./myth.js";
import { addStatus, reduceConsumableDebuff, reduceStatus, statusLabel, statusStacks } from "./status.js";

const SPIRIT_BONUS_PER_COST = 4;
const PHYSICAL_INTENT_GAIN = 7;
const THUNDER_TRIBULATION_THRESHOLD = 8;
const THUNDER_TRIBULATION_DAMAGE = 32;
const CONTROL_BREAK_THRESHOLD = 6;
const BRITTLE_STACKS = 2;
const BRITTLE_MULTIPLIER = 1.5;

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
    const drawn = drawCards(state, effect.value ?? 0);
    combatLog(state, `抽 ${drawn} 张牌。`);
    return finishCombatIfWon(state);
  }

  if (effect.type === "gainEnergy") {
    const before = run.energy;
    run.energy = Math.min(run.maxEnergy, run.energy + (effect.value ?? 0));
    combatLog(state, `获得 ${run.energy - before} 点能量。`);
    return finishCombatIfWon(state);
  }

  if (effect.type === "recoverDiscard") {
    startDiscardPick(state, effect.value ?? 1, effect.sourceUid, effect);
    return finishCombatIfWon(state);
  }

  const targets = resolveTargets(run, effect.target, targetUid);

  if (effect.type === "bleedSiphon") {
    applyBleedSiphon(state, targets, effect);
    return finishCombatIfWon(state);
  }

  if (effect.type === "shellReflect") {
    applyShellReflect(state, targets, effect);
    return finishCombatIfWon(state);
  }

  if (effect.type === "spikeBurst") {
    applySpikeBurst(state, targets);
    return finishCombatIfWon(state);
  }

  for (const target of targets) {
    if (effect.type === "damage") {
      if (effect.tmExecute) {
        const mult = target.hp <= target.maxHp * 0.5 ? 2 : 1;
        applyCardDamage(state, target, (effect.value ?? 8) * mult, effect.cardCost ?? 1, effect.cardStyle);
      } else {
        applyCardDamage(state, target, boostedValue(effect), effect.cardCost ?? 1, effect.cardStyle);
      }
    }

    if (effect.type === "execute") {
      applyExecute(state, target, effect);
    }

    if (effect.type === "block") {
      const amount = boostedValue(effect);
      target.block += amount;
      combatLog(state, `获得 ${amount} 点格挡。`);
    }

    if (effect.type === "doubleBlock") {
      if (run.combat) {
        const before = run.combat.block;
        run.combat.block *= 2;
        combatLog(state, `格挡翻倍：${before} → ${run.combat.block}。`);
      }
    }

    if (effect.type === "heal") {
      const amount = boostedValue(effect);
      target.hp = Math.min(target.maxHp, target.hp + amount);
      combatLog(state, `回复 ${amount} 点生命。`);
    }

    if (effect.type === "loseHp") {
      target.hp = Math.max(0, target.hp - (effect.value ?? 0));
      combatLog(state, `失去 ${effect.value} 点生命。`);
      if (target.uid === "player" && target.hp <= 0) {
        syncPlayerFighter(run, target);
        finishDefeat(state, "血誓反噬，残箓染赤。");
        return state;
      }
    }

    if (effect.type === "status" && effect.status) {
      const stacks = boostedStacks(effect);
      addStatus(target, effect.status, stacks);
      combatLog(state, `${target.uid === "player" ? "你" : target.name} 获得 ${statusLabel(effect.status)} ${stacks}。`);
      triggerControlBreak(state, target);
    }

    if (effect.type === "amplifyDebuffs") {
      const added = amplifyDebuffs(target, effect.statuses, (effect.value ?? 0) + (effect.cardMythStatusBonus ?? 0));
      if (added > 0) {
        combatLog(state, `${target.uid === "player" ? "你" : target.name} 的负面状态增长 ${added} 层。`);
      }
      triggerThunderTribulations(state, target, effect);
      triggerControlBreak(state, target);
    }

    if (effect.type === "thunderMark") {
      applyThunderMark(state, target, effect);
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

  const player = playerFighter(run);
  const spirit = statusStacks(player, "spirit");
  const battleIntent = cardStyle === "physical" ? statusStacks(player, "battleIntent") : 0;
  const curse = statusStacks(target, "curse");
  const spiritBonus = Math.min(spirit, Math.max(1, cardCost) * SPIRIT_BONUS_PER_COST);
  const firstStrikeBonus = mythFirstStrikeDamageBonus(run, target);
  let damage = baseDamage + spiritBonus + battleIntent + curse + firstStrikeBonus;

  if (battleIntent > 0) {
    combatLog(state, `战意追加 ${battleIntent} 点物理伤害。`);
  }
  if (firstStrikeBonus > 0) {
    consumeMythFirstStrike(run, firstStrikeBonus);
    combatLog(state, `妖箓印满级：首击追加 ${firstStrikeBonus} 点伤害。`);
  }

  if (run.relics.includes("thunderSeal") && !combat.flags.thunderSealUsed) {
    damage += 4;
    combat.flags.thunderSealUsed = true;
    combatLog(state, `${relics.thunderSeal.name} 追加 4 点雷伤。`);
  }

  damage = applyBrittleDamage(state, target, damage);
  damage = applyBlock(target, damage);
  target.hp = Math.max(0, target.hp - damage);
  combatLog(state, `对 ${target.name} 造成 ${damage} 点伤害。`);

  const bleed = statusStacks(target, "bleed");
  if (bleed > 0 && target.hp > 0) {
    const bleedBonus = mythStatusDamageBonus(run, target, "bleed");
    const rawBleedDamage = applyBrittleDamage(state, target, bleed + bleedBonus);
    const bleedDamage = applyBlock(target, rawBleedDamage);
    target.hp = Math.max(0, target.hp - bleedDamage);
    const reduced = reduceConsumableDebuff(target, "bleed", 1);
    combatLog(state, `${target.name} 流血爆开，格挡抵消 ${rawBleedDamage - bleedDamage} 点，额外受到 ${bleedDamage} 点伤害${reduced ? "。" : "，凝滞保留了流血。"}`);
  }

  if (run.relics.includes("poJunLing") && cardStyle === "physical") {
    target.hp = Math.max(0, target.hp - 3);
    combatLog(state, "破军令追加 3 点真伤。");
    if (target.hp <= 0) onEnemyKilled(state, target);
  }

  if (target.hp <= 0) {
    onEnemyKilled(state, target);
  }
}

function applyExecute(state, target, effect) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || target.hp <= 0) return;

  const threshold = effect.threshold ?? 35;
  const hpPercent = (target.hp / target.maxHp) * 100;
  if (hpPercent <= threshold) {
    target.hp = 0;
    combatLog(state, `${target.name} 血线低于 ${threshold}%，被无视格挡斩杀。`);
    onEnemyKilled(state, target);
    return;
  }

  applyCardDamage(state, target, (effect.fallbackDamage ?? 0) + (effect.cardMythBonus ?? 0), effect.cardCost ?? 1, effect.cardStyle);
}

export 
function applySpikeBurst(state, targets) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || targets.length === 0) return;
  const spikes = statusStacks(playerFighter(run), "spikes");
  const block = combat.block ?? 0;
  const turtleMult = run.relics.includes("turtleShell") ? 2 : 1;
  const raw = Math.min(block, spikes * 3) * turtleMult;
  if (raw <= 0) { combatLog(state, "棘刺无力。"); return; }
  for (const target of targets) {
    if (target.hp <= 0) continue;
    const blocked = Math.min(target.block, raw);
    target.block -= blocked;
    target.hp = Math.max(0, target.hp - (raw - blocked));
    combatLog(state, `荆棘爆发！${target.name} 受到 ${raw - blocked} 点反射伤害。`);
    if (target.hp <= 0) onEnemyKilled(state, target);
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

  const hasBlockShield = player.statuses?.some(s => s.id === "blockShield" && s.stacks > 0);
  if (hasBlockShield) {
    const absorbed = Math.min(player.block, damage);
    damage -= absorbed;
  } else {
    damage = applyBlock(player, damage);
  }
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

  const bonus = mythStatusDamageBonus(state.run, fighter, statusId);
  const rawDamage = applyBrittleDamage(state, fighter, stacks + bonus);
  const damage = applyBlock(fighter, rawDamage);
  fighter.hp = Math.max(0, fighter.hp - damage);
  const blocked = rawDamage - damage;
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
  const mythBoost = cardMythBoost(state.run, card);
  const growsBattleIntent = card.style === "physical" && card.effects.some((effect) => ["damage", "execute"].includes(effect.type));
  if (mythBoost.active) {
    combatLog(state, `${mythBoost.tag}箓印 ${mythBoost.level} 生效。`);
  }
  for (const effect of card.effects) {
    applyEffect(
      state,
      {
        ...effect,
        sourceUid: cardInstance.uid,
        cardCost: card.cost,
        cardStyle: card.style,
        cardMythBonus: mythBoost.numericBonus,
        cardMythStatusBonus: mythBoost.statusBonus,
      },
      targetUid,
    );
    if (state.phase !== "combat") {
      break;
    }
  }

  if (state.phase === "combat" && growsBattleIntent && statusStacks(playerFighter(state.run), "battleIntent") > 0) {
    addStatus({ statuses: state.run.statuses }, "battleIntent", PHYSICAL_INTENT_GAIN);
    combatLog(state, `物理攻势推进，战意 +${PHYSICAL_INTENT_GAIN}。`);
  }
}

export function pickDiscardCard(state, cardUid) {
  const run = state.run;
  const combat = run?.combat;
  const choice = run?.pendingChoice;
  if (!run || !combat || choice?.type !== "discardPick") return state;

  const availableCards = recoverableDiscardCards(combat, choice);
  const allowed = availableCards.some((card) => card.uid === cardUid);
  if (!allowed) return state;

  const index = combat.discardPile.findIndex((card) => card.uid === cardUid);
  if (index < 0) return state;

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

function startDiscardPick(state, count, sourceUid, effect = {}) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat) return;

  const choice = {
    type: "discardPick",
    count,
    sourceUid,
    excludeStyles: effect.excludeStyles ?? [],
    title: effect.excludeStyles?.includes("control") ? `从弃牌堆选择 ${count} 张非控制牌加入手牌` : `从弃牌堆选择 ${count} 张牌加入手牌`,
  };

  if (recoverableDiscardCards(combat, choice).length === 0) {
    combat.log.push("弃牌堆没有可回收的牌。");
    return;
  }

  run.pendingChoice = choice;
  combat.log.push(choice.title + "。");
}

function recoverableDiscardCards(combat, choice) {
  const excluded = new Set(choice.excludeStyles ?? []);
  return combat.discardPile.filter((card) => {
    if (card.uid === choice.sourceUid) return false;
    const style = cards[card.cardId]?.style;
    return !style || !excluded.has(style);
  });
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
  const debuffs = statuses ?? ["burn", "bleed", "poison", "curse", "chaos", "bind", "stun", "stasis", "thunderMark", "brittle"];
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

function applyThunderMark(state, target, effect) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || target.hp <= 0) return;

  const stacks = (effect.stacks ?? effect.value ?? 0) + (effect.cardMythStatusBonus ?? 0);
  if (stacks <= 0) return;

  addStatus(target, "thunderMark", stacks);
  combatLog(state, `${target.name} 雷痕 +${stacks}。`);
  triggerThunderTribulations(state, target, effect);
}

function triggerThunderTribulations(state, target, effect = {}) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || target.hp <= 0) return;

  const threshold = effect.threshold ?? THUNDER_TRIBULATION_THRESHOLD;
  const baseDamage = effect.damage ?? THUNDER_TRIBULATION_DAMAGE;
  const nineSky = run.relics.includes("nineSkyTribulation");
  const damage = nineSky ? baseDamage + 20 : baseDamage;
  const stun = nineSky ? 2 : 1;
  if (nineSky) combatLog(state, "九天雷劫强化天劫，雷伤+20，眩晕+1。");

  while (target.hp > 0 && statusStacks(target, "thunderMark") >= threshold) {
    reduceStatus(target, "thunderMark", threshold);
    const finalDamage = damage + statusStacks(target, "curse");
    target.hp = Math.max(0, target.hp - finalDamage);
    addStatus(target, "stun", stun);
    triggerControlBreak(state, target);
    combatLog(state, `天劫降下，${target.name} 无视格挡受到 ${finalDamage} 点雷伤，并眩晕 ${stun} 次。`);
    if (target.hp <= 0) {
      onEnemyKilled(state, target);
    }
  }
}

function applyBleedSiphon(state, targets, effect) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || targets.length === 0) return;

  const totalBleed = targets.reduce((sum, target) => sum + statusStacks(target, "bleed"), 0);
  if (totalBleed <= 0) {
    combatLog(state, "没有可汲取的流血。");
    return;
  }

  const ratio = Math.max(1, effect.ratio ?? 3);
  const heal = Math.floor(totalBleed / ratio) + (effect.value ?? 0) + (effect.cardMythBonus ?? 0);
  if (heal <= 0) {
    combatLog(state, `流血不足 ${ratio} 层，未能回血。`);
    return;
  }

  const before = run.hp;
  run.hp = Math.min(run.maxHp, run.hp + heal);
  const actual = run.hp - before;
  const source = targets.length > 1 ? `敌方流血合计 ${totalBleed} 层` : `${targets[0].name} 流血 ${totalBleed} 层`;
  combatLog(state, `血魔汲血：${source}，回复 ${actual} 点生命。`);
}

function applyShellReflect(state, targets, effect) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || targets.length === 0) return;

  const block = combat.block ?? 0;
  if (block <= 0) {
    combatLog(state, "没有格挡可用于反震。");
    return;
  }

  const ratio = Math.max(0, effect.ratio ?? 0.5);
  const turtleMult = state.run.relics.includes("turtleShell") ? 2 : 1;
  const rawDamage = Math.max(1, (Math.floor(block * ratio) + (effect.value ?? 0) + (effect.cardMythBonus ?? 0)) * turtleMult);
  // Always apply block shield when consumeRatio is 0
  if (effect.consumeRatio === 0 && block > 0) {
    const pf = playerFighter(run);
    addStatus(pf, "blockShield", 1);
    syncPlayerFighter(run, pf);
    combatLog(state, "格挡锁定，本回合不消耗。");
  }
  if (rawDamage <= 0) {
    combatLog(state, "反震力道不足。");
    return;
  }

  for (const target of targets) {
    if (target.hp <= 0) continue;
    const finalRawDamage = applyBrittleDamage(state, target, rawDamage);
    const damage = applyBlock(target, finalRawDamage);
    target.hp = Math.max(0, target.hp - damage);
    combatLog(state, `以 ${block} 点格挡反震 ${target.name}，造成 ${damage} 点伤害。`);
    if (target.hp <= 0) {
      onEnemyKilled(state, target);
    }
  }

  const consumeRatio = Math.max(0, effect.consumeRatio ?? 0);
  const consumed = Math.min(combat.block, Math.ceil(block * consumeRatio));
  if (consumed > 0) {
    combat.block -= consumed;
    combatLog(state, `反震消耗 ${consumed} 点格挡。`);
  }
  
}

function applyBlock(fighter, rawDamage) {
  const blocked = Math.min(fighter.block, rawDamage);
  fighter.block -= blocked;
  return rawDamage - blocked;
}

function boostedValue(effect) {
  return (effect.value ?? 0) + (effect.cardMythBonus ?? 0);
}

function boostedStacks(effect) {
  return (effect.stacks ?? 0) + (effect.cardMythStatusBonus ?? 0);
}

function applyBrittleDamage(state, target, rawDamage) {
  if (rawDamage <= 0 || target.uid === "player" || statusStacks(target, "brittle") <= 0) {
    return rawDamage;
  }

  const amplified = Math.ceil(rawDamage * BRITTLE_MULTIPLIER);
  combatLog(state, `${target.name} 脆化承伤，伤害 ${rawDamage} -> ${amplified}。`);
  return amplified;
}

function triggerControlBreak(state, target) {
  const combat = state.run?.combat;
  if (!combat || target.uid === "player" || target.hp <= 0) return;

  while (controlPressure(target) >= CONTROL_BREAK_THRESHOLD) {
    consumeControlPressure(target, CONTROL_BREAK_THRESHOLD);
    const clearedBlock = target.block ?? 0;
    target.block = 0;
    addStatus(target, "brittle", BRITTLE_STACKS);
    combatLog(state, `${target.name} 心防崩裂，清空 ${clearedBlock} 点格挡，获得脆化 ${BRITTLE_STACKS}。`);
  }
}

function controlPressure(target) {
  return statusStacks(target, "chaos") + statusStacks(target, "bind") + statusStacks(target, "stun");
}

function consumeControlPressure(target, amount) {
  let remaining = amount;
  for (const statusId of ["chaos", "bind", "stun"]) {
    if (remaining <= 0) return;
    const stacks = statusStacks(target, statusId);
    const spent = Math.min(stacks, remaining);
    if (spent > 0) {
      reduceStatus(target, statusId, spent);
      remaining -= spent;
    }
  }
}



function finishDefeat(state, message) {
  const run = state.run;
  if (!run || run.finished) return;

  const mythAward = awardMythMasteryForRunEnd(state, "defeat");
  run.finished = true;
  state.phase = "gameOver";
  state.message = mythAward ? `${message} ${mythAwardText(mythAward)}` : message;
  state.meta.soul += Math.max(3, run.floor * 2);
  state.meta.lossStreak = (state.meta.lossStreak ?? 0) + 1;
}
