import { cards, enemies, relics } from "./data.js";
import { applyCardEffects, applyIncomingDamage, tickDamageStatus } from "./effects.js";
import { generateRewards, rollRelicReward } from "./rewards.js";
import { grantGoldDrop } from "./economy.js";
import { completeRunVictory } from "./goals.js";
import { choice, randomInt, shuffle } from "./rng.js";
import { applyMythCombatStartBonuses, commitEffectiveCardCost, effectiveCardCost, recordMythCardPlay } from "./myth.js";
import {
  addStatus,
  clearStatus,
  reduceConsumableDebuff,
  reduceStatus,
  reduceNaturalConsumableDebuff,
  reduceNaturalStatus,
  statusLabel,
  statusStacks,
} from "./status.js";
import { MAX_FLOOR, TIER_SIZE } from "./types.js";
import { isBossFloor } from "./nodes.js";

const ROUND_DECAY_STATUSES = ["curse", "spirit", "battleIntent", "ward", "stasis", "brittle", "spikes", "blockShield"];
const ROUND_DECAY_CONSUMABLE_DEBUFFS = ["chaos"];

export function startCombat(state) {
  const run = state.run;
  if (!run) return state;

  const enemyStates = createEnemiesForFloor(run);
  const retainedHand = takeRetainedHand(run);
  const retainedUids = new Set(retainedHand.map((card) => card.uid));
  const nodeTitle = run.currentNode?.title ?? `第 ${run.floor} 层`;
  run.combat = {
    turn: 1,
    enemies: enemyStates,
    hand: retainedHand,
    drawPile: shuffle(run, run.deck.filter((card) => !retainedUids.has(card.uid))),
    discardPile: [],
    block: 0,
    log: [`${nodeTitle}，妖气逼近。`],
    flags: {},
  };

  state.phase = "combat";
  startPlayerTurn(state);

  if (run.relics.includes("chaosFragment")) {
    const drawn = drawCards(state, 2);
    const before = run.energy;
    run.energy += 1;
    const gained = run.energy - before;
    run.combat.log.push(`${relics.chaosFragment.name} 震动：抽 ${drawn} 张牌，获得 ${gained} 点能量。`);
  }

  return state;
}

function takeRetainedHand(run) {
  const handLimit = run.handLimit ?? 5;
  const deckUids = new Set(run.deck.map((card) => card.uid));
  const retained = (run.retainedHand ?? []).filter((card) => deckUids.has(card.uid)).slice(0, handLimit);
  run.retainedHand = [];
  return retained;
}

export function playCard(state, cardUid, targetUid) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || state.phase !== "combat") return state;
  if (run.pendingChoice) {
    combat.log.push("先完成当前选择。");
    return state;
  }

  const cardIndex = combat.hand.findIndex((card) => card.uid === cardUid);
  const cardInstance = combat.hand[cardIndex];
  if (!cardInstance) return state;

  const card = cards[cardInstance.cardId];
  const costInfo = effectiveCardCost(run, card);
  const cost = costInfo.cost;

  if (card?.id === "meditate" && run.energy >= run.maxEnergy) {
    combat.log.push("能量已满，调息未生效。");
    return state;
  }

  if (run.energy < cost) {
    combat.log.push("能量不足。");
    return state;
  }

  run.energy -= cost;
  commitEffectiveCardCost(run, costInfo);
  combat.hand.splice(cardIndex, 1);
  combat.discardPile.push(cardInstance);
  combat.log.push(`你打出 ${card.name}。`);
  if (costInfo.firstFree) {
    combat.log.push("洪荒箓印满级：本场首张洪荒牌免费。");
  } else if (costInfo.reduced > 0) {
    combat.log.push(`洪荒箓印满级：费用 -${costInfo.reduced}。`);
  }
  recordMythCardPlay(run, card);
  applyCardEffects(state, cardInstance, targetUid);

  return state;
}

export function endTurn(state) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || state.phase !== "combat") return state;
  if (run.pendingChoice) {
    combat.log.push("先完成当前选择。");
    return state;
  }

  enemyTurn(state);
  return state;
}

export function discardHandCard(state, cardUid) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || state.phase !== "combat") return state;
  if (run.pendingChoice) {
    combat.log.push("先完成当前选择。");
    return state;
  }
  if (combat.flags.discardedThisTurn) {
    combat.log.push("本回合已主动弃牌。");
    return state;
  }

  const cardIndex = combat.hand.findIndex((card) => card.uid === cardUid);
  const cardInstance = combat.hand[cardIndex];
  if (!cardInstance) return state;

  combat.hand.splice(cardIndex, 1);
  combat.discardPile.push(cardInstance);
  combat.flags.discardedThisTurn = true;
  const drawn = drawCards(state, 1);
  combat.log.push(`主动弃置 ${cards[cardInstance.cardId].name}，抽 ${drawn} 张牌。`);
  return state;
}

export function startPlayerTurn(state) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || state.phase !== "combat") return state;

  run.energy = run.maxEnergy;
  decayPlayerBlock(combat);
  combat.flags.thunderSealUsed = false;
  combat.flags.discardedThisTurn = false;

  tickDamageStatus(state, playerAsFighter(run), "bleed");
  if (state.phase !== "combat") return state;
  tickDamageStatus(state, playerAsFighter(run), "burn");
  if (state.phase !== "combat") return state;
  tickDamageStatus(state, playerAsFighter(run), "poison");
  if (state.phase !== "combat") return state;

  applySpikesReflect(state);
  if (state.phase !== "combat") return state;

  if (run.relics.includes("jadeRuyi")) {
    addStatus(playerAsFighter(run), "spirit", 1);
    combat.log.push(`${relics.jadeRuyi.name} 生辉，获得 灵气 1。`);
  }

  if (combat.turn === 1) {
    applyMythCombatStartBonuses(run);
  }

  const handLimit = run.handLimit ?? 5;
  const freeSlots = Math.max(0, handLimit - combat.hand.length);
  const guaranteedCount = drawGuaranteedCards(state, freeSlots);
  drawCards(state, Math.max(0, (run.handLimit ?? 5) - combat.hand.length));
  combat.log.push(`第 ${combat.turn} 回合开始。`);

  return state;
}

function decayPlayerBlock(combat) {
  const before = combat.block;
  combat.block = Math.max(0, combat.block - 1);
  if (before > combat.block) {
    combat.log.push("格挡自然衰减 1。");
  }
}

function drawGuaranteedCards(state, maxCount) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat) return 0;

  const queue = run.guaranteedNextHand ?? [];
  if (queue.length === 0) return 0;

  let drawn = 0;
  const remaining = [];

  for (const uid of queue) {
    if (drawn >= maxCount) {
      remaining.push(uid);
      continue;
    }

    const index = combat.drawPile.findIndex((card) => card.uid === uid);
    if (index < 0) continue;

    const [card] = combat.drawPile.splice(index, 1);
    combat.hand.push(card);
    drawn += 1;
  }

  run.guaranteedNextHand = remaining;
  if (drawn > 0) {
    combat.log.push(`奖励牌固定进入开局手牌 ${drawn} 张。`);
  }

  return drawn;
}

export function drawCards(state, count) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat) return 0;

  let drawn = 0;
  const handLimit = run.handLimit ?? 5;

  for (let index = 0; index < count; index += 1) {
    if (combat.hand.length >= handLimit) break;

    if (combat.drawPile.length === 0) {
      if (combat.discardPile.length === 0) break;
      combat.drawPile = shuffle(run, combat.discardPile);
      combat.discardPile = [];
      combat.log.push("弃牌堆洗回牌库。");
    }

    const card = combat.drawPile.pop();
    if (card) {
      combat.hand.push(card);
      drawn += 1;
    }
  }

  return drawn;
}

export function finishCombatIfWon(state) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || state.phase !== "combat") return state;

  const hasAliveEnemy = combat.enemies.some((enemy) => enemy.hp > 0);
  if (hasAliveEnemy) return state;

  if (isFinalBossCombat(run)) {
    const bossRelic = grantFinalBossRelic(run, combat);
    const relicMessage = bossRelic ? `终局遗物：${bossRelic.name}。` : "你已集齐所有遗物。";
    return completeRunVictory(state, "boss", `黑山崩裂，残箓归一。你击败了关底 Boss。${relicMessage}`);
  }

  retainCombatHand(run, combat);
  clearEndOfCombatStatuses(run);
  grantGoldDrop(state);
  run.rewards = generateRewards(state);
  run.combat = null;
  state.phase = "reward";
  state.message = "战斗胜利，择一份机缘。";
  return state;
}

function isFinalBossCombat(run) {
  return run.floor >= MAX_FLOOR && run.currentNode?.type === "main";
}

function grantFinalBossRelic(run, combat) {
  const relic = rollRelicReward(run);
  if (!relic) return null;

  run.relics.push(relic.id);
  combat.log.push(`关底 Boss 掉落遗物：${relic.name}。`);
  return relic;
}

function retainCombatHand(run, combat) {
  const handLimit = run.handLimit ?? 5;
  run.retainedHand = combat.hand.slice(0, handLimit);
}

function enemyTurn(state) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat) return state;

  combat.log.push("敌人行动。");

  for (const enemy of combat.enemies) {
    if (enemy.hp > 0) {
      tickDamageStatus(state, enemy, "bleed");
      if (enemy.hp > 0) {
        tickDamageStatus(state, enemy, "burn");
      }
    }
  }
  finishCombatIfWon(state);
  if (state.phase !== "combat") return state;

  for (const enemy of combat.enemies) {
    if (enemy.hp <= 0) continue;
    resolveEnemyIntent(state, enemy);
    if (state.phase !== "combat") return state;
  }

  for (const enemy of combat.enemies) {
    if (enemy.hp > 0) {
      tickDamageStatus(state, enemy, "poison");
    }
  }
  decayRoundStatuses(state);
  finishCombatIfWon(state);
  if (state.phase !== "combat") return state;

  for (const enemy of combat.enemies) {
    if (enemy.hp > 0) {
      enemy.intent = rollEnemyIntent(run, enemy.enemyId);
    }
  }

  combat.turn += 1;
  startPlayerTurn(state);
}

function decayRoundStatuses(state) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat) return;

  const player = playerAsFighter(run);
  let changed = decayFighterStatuses(player);
  run.statuses = player.statuses;
  for (const enemy of combat.enemies) {
    if (enemy.hp > 0) {
      changed = decayFighterStatuses(enemy) || changed;
    }
  }
  if (changed) {
    combat.log.push("临时状态随回合流逝减少。");
  }
}

function decayFighterStatuses(fighter) {
  const before = totalStatusStacks(fighter);
  for (const statusId of ROUND_DECAY_CONSUMABLE_DEBUFFS) {
    reduceNaturalConsumableDebuff(fighter, statusId, 1);
  }
  for (const statusId of ROUND_DECAY_STATUSES) {
    reduceNaturalStatus(fighter, statusId, 1);
  }
  return totalStatusStacks(fighter) !== before;
}

function totalStatusStacks(fighter) {
  return fighter.statuses.reduce((sum, status) => sum + Math.max(0, status.stacks), 0);
}

function resolveEnemyIntent(state, enemy) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat) return;

  const intent = enemy.intent;

  if (statusStacks(enemy, "stun") > 0) {
    skipEnemyByStun(combat, enemy);
    return;
  }

  if (statusStacks(enemy, "chaos") > 0) {
    if (intent.type === "attack") {
      if (tryChaosAttack(state, enemy, enemyRawAttackDamage(run, enemy, intent))) {
        return;
      }
    }

    skipEnemyByChaos(combat, enemy);
    return;
  }

  if (statusStacks(enemy, "bind") > 0) {
    if (intent.type === "attack" || intent.type === "status") {
      skipEnemyByBind(combat, enemy);
      return;
    }

    if (intent.type === "block") {
      const blockValue = (intent.value ?? 0) + enemyIntentBonus(run);
      enemy.block += blockValue;
      reduceStatus(enemy, "bind", 1);
      combat.log.push(`${enemy.name} 被禁锢压住攻势，但仍获得 ${blockValue} 点格挡。`);
      return;
    }
  }

  if (intent.type === "attack") {
    combat.log.push(`${enemy.name} 攻击。`);
    const dmg = enemyRawAttackDamage(run, enemy, intent);
    applyIncomingDamage(state, dmg);
    return;
  }

  if (intent.type === "block") {
    const blockValue = (intent.value ?? 0) + enemyIntentBonus(run);
    enemy.block += blockValue;
    combat.log.push(`${enemy.name} 获得 ${blockValue} 点格挡。`);
    return;
  }

  if (intent.type === "status" && intent.status) {
    addStatus(playerAsFighter(run), intent.status, intent.stacks ?? 0);
    combat.log.push(`${enemy.name} 施加 ${statusLabel(intent.status)} ${intent.stacks}。`);
  }
}

function tryChaosAttack(state, enemy, rawDamage) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || statusStacks(enemy, "chaos") <= 0) return false;

  const targets = combat.enemies.filter((item) => item.uid !== enemy.uid && item.hp > 0);
  if (targets.length === 0) return false;

  const target = choice(run, targets);
  const reduced = reduceConsumableDebuff(enemy, "chaos", 1);

  let damage = rawDamage + statusStacks(target, "curse");
  if (statusStacks(target, "brittle") > 0) {
    const before = damage;
    damage = Math.ceil(damage * 1.5);
    combat.log.push(`${target.name} 脆化承伤，伤害 ${before} -> ${damage}。`);
  }
  const blocked = Math.min(target.block, damage);
  target.block -= blocked;
  damage -= blocked;
  target.hp = Math.max(0, target.hp - damage);

  combat.log.push(`${enemy.name} 受离间影响，转而攻击 ${target.name}，造成 ${damage} 点伤害${reduced ? "。" : "，凝滞保留了离间。"}`);
  if (target.hp <= 0) {
    combat.log.push(`${target.name} 被同伴击败。`);
  }
  finishCombatIfWon(state);
  return true;
}

function skipEnemyByChaos(combat, enemy) {
  const reduced = reduceConsumableDebuff(enemy, "chaos", 1);
  combat.log.push(`${enemy.name} 受到离间影响，空过了这一回合${reduced ? "。" : "，凝滞保留了离间。"}`);
}

function skipEnemyByStun(combat, enemy) {
  reduceStatus(enemy, "stun", 1);
  combat.log.push(`${enemy.name} 被眩晕压制，空过了这一回合。`);
}

function skipEnemyByBind(combat, enemy) {
  reduceStatus(enemy, "bind", 1);
  combat.log.push(`${enemy.name} 被禁锢封住攻击和术法，空过了这一回合。`);
}

function bossForFloor(floor) {
  if (floor >= MAX_FLOOR) return "blackMountain";
  if (floor === 3) return "yaoJiang";
  if (floor === 6) return "shanJun";
  if (floor === 9) return "guiJiang";
  if (floor === 12) return "panGuan";
  if (floor === 15) return "moZun";
  return null;
}

function applySpikesReflect(state) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat) return;
  const spikes = statusStacks(playerAsFighter(run), "spikes");
  if (spikes <= 0) return;
  const block = combat.block ?? 0;
  const damage = Math.min(block, spikes * 3);
  if (damage <= 0) return;
  const alive = combat.enemies.filter(e => e.hp > 0);
  if (alive.length === 0) return;
  const target = alive[Math.abs((run.seed * 92821 + combat.turn * 68917) % alive.length)];
  const blocked = Math.min(target.block, damage);
  target.block -= blocked;
  target.hp = Math.max(0, target.hp - (damage - blocked));
  combat.log.push(`荆棘反震！${target.name} 受到 ${damage - blocked} 点反射伤害。`);
}

function createEnemiesForFloor(run) {
  const bossId = bossForFloor(run.floor);
  if (bossId) {
    return [makeEnemy(run, bossId)];
  }

  const pool = ["littleYao", "shanxiao", "foxYao", "waterGhost", "ironCorpse"];
  const tier = run.currentNode?.tier ?? Math.min(3, Math.ceil(run.floor / TIER_SIZE));
  const isSide = run.currentNode?.type === "side";
  // 中期(floor 7-13) 2-3只，后期(floor 14+) 3-4只，Boss保持1只
  const count = isSide
    ? randomInt(run, tier >= 2 ? 2 : 1, tier >= 3 ? 3 : 2)
    : run.floor >= 14
      ? randomInt(run, 3, 4)
      : run.floor >= 7
        ? randomInt(run, 2, 3)
        : randomInt(run, 1, 2);
  const result = [];

  for (let index = 0; index < count; index += 1) {
    result.push(makeEnemy(run, choice(run, pool)));
  }

  return result;
}

function makeEnemy(run, enemyId) {
  const tmMult = run.trueMartial ? 1.05 : 1;
  const tmAtkMult = run.trueMartial ? 1.05 : 1;
  const definition = enemies[enemyId];
  const isSide = run.currentNode?.type === "side";
  const tier = run.currentNode?.tier ?? Math.min(3, Math.ceil(run.floor / TIER_SIZE));
  const floorBonus = enemyId === "blackMountain" ? 0 : Math.max(0, run.floor - 1) * (isSide ? 5 : 4);
  const sideMultiplier = isSide ? 0.95 + tier * 0.12 : 1;
  const maxHp = Math.max(12, Math.round((definition.maxHp + floorBonus) * sideMultiplier * enemyHpMultiplier(run) * tmMult));

  return {
    uid: nextEnemyUid(run),
    enemyId,
    name: definition.name,
    hp: maxHp,
    maxHp,
    block: isSide && tier >= 2 ? tier * 3 : 0,
    statuses: [],
    intent: rollEnemyIntent(run, enemyId),
  };
}

function enemyHpMultiplier(run) {
  if (run.floor < 8) return 1;

  const lateFloor = Math.max(0, run.floor - 8);
  const pressure = runPowerPressure(run);
  return 1 + Math.min(0.85, lateFloor * 0.025 + pressure * 0.035);
}

export function previewEnemyIntent(run, enemy) {
  const intent = enemy?.intent;
  if (!run || !enemy || !intent) return null;

  if (intent.type === "attack") {
    const base = intent.value ?? 0;
    const bonus = enemyAttackBonus(run, enemy);
    const poisonWeakness = poisonAttackReduction(enemy);
    const curse = statusStacks(playerAsFighter(run), "curse");
    const rawDamage = Math.max(0, base + bonus - poisonWeakness);
    return {
      type: "attack",
      base,
      bonus,
      poisonWeakness,
      curse,
      rawDamage,
      expectedDamage: rawDamage + curse,
    };
  }

  if (intent.type === "block") {
    const base = intent.value ?? 0;
    const bonus = enemyIntentBonus(run);
    return {
      type: "block",
      base,
      bonus,
      value: base + bonus,
    };
  }

  return {
    type: intent.type,
    stacks: intent.stacks ?? 0,
  };
}

function enemyRawAttackDamage(run, enemy, intent) {
  return Math.max(0, (intent.value ?? 0) + enemyAttackBonus(run, enemy) - poisonAttackReduction(enemy));
}

function poisonAttackReduction(enemy) {
  const poison = statusStacks(enemy, "poison");
  if (poison <= 0) return 0;
  const red = Math.min(5, Math.floor(poison / 2));
  return red;
}

function enemyAttackBonus(run, enemy) {
  const bossBonus = enemy.enemyId === "blackMountain" && enemy.hp <= enemy.maxHp / 2 ? 2 * (run.combat?.turn ?? 0) : 0;
  return bossBonus + enemyIntentBonus(run);
}

function enemyIntentBonus(run) {
  if (run.floor < 10) return 0;

  return Math.min(8, Math.floor(runPowerPressure(run) * 0.35 + Math.max(0, run.floor - 10) * 0.25));
}

function runPowerPressure(run) {
  const deck = run.deck ?? [];
  const advancedCards = deck.reduce((sum, instance) => {
    const card = cards[instance.cardId];
    if (!card) return sum;
    return sum + (card.grade >= 3 ? 1.4 : 0) + (card.cost >= 3 ? 1.2 : 0) + (card.rarity === "legendary" ? 1 : 0);
  }, 0);

  return Math.max(0, advancedCards + Math.max(0, (run.maxEnergy ?? 3) - 3) * 2 + (run.relics?.length ?? 0) * 0.8 - 2);
}

function clearEndOfCombatStatuses(run) {
  clearStatus(run, "spirit");
  clearStatus(run, "spikes");
    clearStatus(run, "battleIntent");
}

function rollEnemyIntent(run, enemyId) {
  const definition = enemies[enemyId];
  return { ...choice(run, definition.intents) };
}

function nextEnemyUid(run) {
  run.nextUid += 1;
  return `enemy_${run.nextUid}`;
}

function playerAsFighter(run) {
  return {
    uid: "player",
    hp: run.hp,
    maxHp: run.maxHp,
    block: run.combat?.block ?? 0,
    statuses: run.statuses,
  };
}
