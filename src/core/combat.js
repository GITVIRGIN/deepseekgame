import { cards, enemies, relics, trueMartialEnemies } from "./data.js";
import { dominantArchetype } from "./archetypes.js";
import { applyCardEffects, applyIncomingDamage, finishDefeat, gainControlResist, tickDamageStatus } from "./effects.js";
import { onEnemyKilled } from "./combat-events.js";
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
import { MAX_FLOOR, TIER_SIZE, TRUE_MARTIAL_MAX_FLOOR, TRUE_MARTIAL_TIER_SIZE, DIFFICULTY_BEGINNER, DIFFICULTY_REGULAR, difficultyTuning } from "./types.js";
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

  // V3.0: initialize True Martial formation
  initializeTrueMartialFormation(state);

  state.phase = "combat";
  startPlayerTurn(state);

  // T0B guard: startPlayerTurn may cause death via DOT (poison/bleed/burn),
  // which calls finishDefeat → sets run.combat = null. Guard against null access.
  if (state.phase !== "combat" || !run.combat) {
    return state;
  }

  const combat = run.combat;

  // V3.13M: regular-only physical momentum relief.
  // Visible support for regular physical runs after floor 10.
  // It does not affect beginner or trueMartial, and does not affect non-physical archetypes.
  if (run.difficulty === DIFFICULTY_REGULAR && !combat.flags.regularPhysicalMomentumApplied) {
    const dom = dominantArchetype(run)?.style ?? null;
    if (dom === "physical" && run.floor >= 10) {
      combat.flags.regularPhysicalMomentumApplied = true;
      const intent = 2;
      const blockGain = run.floor >= 13 ? 3 : 2;
      addStatus(run, "battleIntent", intent);
      combat.block = (combat.block ?? 0) + blockGain;
      combat.log.push(`武道回响稳住攻势，获得 ${intent} 层战意与 ${blockGain} 点格挡。`);
    }
  }

  // V1.3: 行旅符 — beginner mode travel blessing (tuned via difficultyTuning)
  if (run.difficulty === DIFFICULTY_BEGINNER && !combat.flags.travelBlessingApplied) {
    const tune = difficultyTuning.beginner;
    combat.flags.travelBlessingApplied = true;
    combat.block = (combat.block ?? 0) + tune.travelBlock;
    const msgs = [`行旅符微光护身，获得 ${tune.travelBlock} 点格挡`];

    // Archetype bonus (based on deck composition) — reduced from v1.2
    const dom = dominantArchetype(run)?.style ?? null;
    if (dom === "physical") {
      addStatus(run, "battleIntent", 2);  // was 3
      combat.block = (combat.block ?? 0) + 2;  // was 4
      msgs.push("行旅符感应武道，战意初燃");
    } else if (dom === "bleed") {
      for (const enemy of (combat.enemies ?? [])) {
        if (enemy.hp > 0) addStatus(enemy, "bleed", 2);  // was 3
      }
      msgs.push("行旅符感应血路，敌方气血翻涌");
    } else if (dom === "shell") {
      combat.block = (combat.block ?? 0) + 8;  // was 14
      addStatus(run, "spikes", 2);  // was 3
      msgs.push("行旅符感应守御，格挡之势更稳");
    } else if (dom === "spell") {
      combat.flags.travelSpellCharge = 2;  // was 3
      msgs.push("行旅符感应雷法，两缕雷火引随身流转");
    } else if (dom === "poison") {
      for (const enemy of (combat.enemies ?? [])) {
        if (enemy.hp > 0) addStatus(enemy, "poison", 1);  // was 2
      }
      msgs.push("行旅符感应毒瘴，敌方沾染毒息");
    } else if (dom === "control") {
      // No extra draw — beginner control already strong
      msgs.push("行旅符感应心机，心神更稳");
    }
    combat.log.push(msgs.join("，") + "。");
  }

  if (hasTrueMartialRelic(run, "chaosTreasure") && !combat.flags.chaosTreasureApplied) {
    combat.flags.chaosTreasureApplied = true;
    for (const enemy of (combat.enemies ?? [])) {
      if (enemy.hp > 0) {
        addStatus(enemy, "controlResist", 1);
      }
    }
    combat.log.push("混沌灵宝震动，敌方心神自守，获得定力。");
  }
  if (hasTrueMartialRelic(run, "asuraHeart") && !combat.flags.asuraBleedApplied) {
    combat.flags.asuraBleedApplied = true;
    for (const enemy of (combat.enemies ?? [])) {
      if (enemy.hp > 0) addStatus(enemy, "bleed", 4);
    }
    combat.log.push("修罗心鼓动，敌方气血翻涌。");
  }
  if (hasTrueMartialRelic(run, "turtleShell")) {
    combat.block = (combat.block ?? 0) + 30;
    combat.log.push("玄龟甲护身，开局格挡 +30。");
  }
  if (hasTrueMartialRelic(run, "poJunLing")) {
    combat.block = (combat.block ?? 0) + 22;
    combat.log.push("破军令护体，开局格挡 +22。");
  }
  if (hasTrueMartialRelic(run, "nineSkyTribulation")) {
    for (const enemy of (combat.enemies ?? [])) {
      if (enemy.hp > 0) addStatus(enemy, "thunderMark", 3);
    }
    combat.log.push("九天雷劫引动雷云，敌方获得 3 层雷印。天劫总伤 120。");
  }
  if (hasTrueMartialRelic(run, "venomScripture")) {
    for (const enemy of (combat.enemies ?? [])) {
      if (enemy.hp > 0) addStatus(enemy, "poison", 8);
    }
    combat.log.push("万毒真经散发，敌人初始中毒。");
  }

  if (run.relics.includes("chaosFragment")) {
    const drawn = drawCards(state, 2);
    const before = run.energy;
    run.energy += 1;
    const gained = run.energy - before;
    run.combat.log.push(`${relics.chaosFragment.name} 震动：抽 ${drawn} 张牌，获得 ${gained} 点能量。`);
  }

  // R6: soulFurnace - +1 energy this combat, lose 8 HP
  if (run.relics.includes("soulFurnace")) {
    combat.flags.soulFurnaceBonus = 1;
    run.hp = Math.max(1, run.hp - 8);
    combat.log.push("魂炉点燃，本场能量上限 +1，但炽焰灼身，失去 8 点生命。");
  }

  // V3.1: infernoLotus — self-inflict burn at combat start
  if (run.relics.includes("infernoLotus") && !combat.flags.infernoLotusApplied) {
    combat.flags.infernoLotusApplied = true;
    addStatus(run, "burn", 3);
    combat.log.push("业火莲反燃自身，获得 3 层灼烧。");
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

  if (card?.id === "meditate" && run.energy >= effectiveMaxEnergy(run)) {
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
  // CQA-P3-001-FIX-B: terminal guard — defeat before enemy turn processing
  if (!run) return state;
  if (run.finished) return state;
  if (state.phase === "gameOver") return state;
  if (run.hp <= 0) {
    finishDefeat(state, "残箓碎裂，山路断绝。");
    return state;
  }
  const combat = run?.combat;
  if (!combat || state.phase !== "combat") return state;
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

  run.energy = effectiveMaxEnergy(run);
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

  // R6: cursedMirror extra draw each turn
  if (run.relics.includes("cursedMirror")) {
    drawCards(state, 1);
    combat.log.push("咒镜映照，额外抽取 1 张牌。");
  }

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
    const victoryMsg = run.trueMartial
      ? `虚渊归寂，真武问道功成。你击败了虚渊主宰。${relicMessage}`
      : `黑山崩裂，残箓归一。你击败了关底 Boss。${relicMessage}`;
    return completeRunVictory(state, "boss", victoryMsg);
  }

  retainCombatHand(run, combat);
  clearEndOfCombatStatuses(run);
  grantGoldDrop(state);

  // R6: bloodContract heal on victory
  if (run.relics.includes("bloodContract")) {
    run.hp = Math.min(run.maxHp, run.hp + 15);
    combat.log.push("血契生效，回复 15 点生命。");
  }

  run.rewards = generateRewards(state);
  run.pendingChoice = null;  // UI2: clear discard pick when combat ends
  run.combat = null;
  state.phase = "reward";
  state.message = "战斗胜利，择一份机缘。";
  return state;
}

function isFinalBossCombat(run) {
  const maxFloor = run.trueMartial ? TRUE_MARTIAL_MAX_FLOOR : MAX_FLOOR;
  return run.floor >= maxFloor && run.currentNode?.type === "main";
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

  // V3.0: apply True Martial formation effects
  applyTrueMartialFormation(state);

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

  // R6: cursedMirror curse at end of turn
  if (run.relics.includes("cursedMirror")) {
    addStatus(run, "curse", 2);
    combat.log.push("咒镜反噬，获得 2 层诅咒。");
  }

  // V3.1: inverseScaleArmor — lose HP if block remains at turn end
  if (run.relics.includes("inverseScaleArmor") && (combat.block ?? 0) > 0) {
    run.hp = Math.max(1, run.hp - 3);
    combat.log.push("逆鳞甲反噬，回合结束仍有格挡，失去 3 点生命。");
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

  // v0.7.6: controlResist-based anti-control instead of clearMind
  let wasControlled = false;

  if (statusStacks(enemy, "stun") > 0) {
    skipEnemyByStun(combat, enemy);
    gainControlResist(enemy);
    wasControlled = true;
    return;
  }

  if (statusStacks(enemy, "chaos") > 0) {
    if (intent.type === "attack") {
      if (tryChaosAttack(state, enemy, enemyRawAttackDamage(run, enemy, intent))) {
        gainControlResist(enemy);
        wasControlled = true;
        return;
      }
    }

    skipEnemyByChaos(combat, enemy);
    gainControlResist(enemy);
    wasControlled = true;
    return;
  }

  if (statusStacks(enemy, "bind") > 0) {
    if (intent.type === "attack" || intent.type === "status") {
      skipEnemyByBind(combat, enemy);
      gainControlResist(enemy);
      wasControlled = true;
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

  // Normal action: reduce controlResist by 1
  if (!wasControlled && statusStacks(enemy, "controlResist") > 0) {
    reduceStatus(enemy, "controlResist", 1);
    combat.log.push(`${enemy.name} 定力松动。`);
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

function bossForFloor(run) {
  const floor = run.floor;
  if (run.trueMartial) {
    if (floor >= TRUE_MARTIAL_MAX_FLOOR) return "voidSovereign";
    if (floor === 5) return "deathSentry";
    if (floor === 10) return "mindEater";
    if (floor === 15) return "doomPriest";
    if (floor === 20) return "trueDemon";
    return null;
  }
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
  const turtleMult = hasTrueMartialRelic(run, "turtleShell") ? 1.25 : 1;
  const damage = Math.floor(Math.min(block, spikes * 3) * turtleMult);
  if (damage <= 0) return;
  const alive = combat.enemies.filter(e => e.hp > 0);
  if (alive.length === 0) return;
  const target = alive[Math.abs((run.seed * 92821 + combat.turn * 68917) % alive.length)];
  const blocked = Math.min(target.block, damage);
  target.block -= blocked;
  target.hp = Math.max(0, target.hp - (damage - blocked));
  combat.log.push(`荆棘反震！${target.name} 受到 ${damage - blocked} 点反射伤害。`);
  if (target.hp <= 0) onEnemyKilled(state, target);
  finishCombatIfWon(state);
}

function createEnemiesForFloor(run) {
  const bossId = bossForFloor(run);
  if (bossId) {
    return [makeEnemy(run, bossId)];
  }

  // True martial uses independent enemy pool
  if (run.trueMartial) {
    const floor = run.floor;
    let pool;
    if (floor <= 5) {
      pool = ["bloodShade", "thunderWisp"];
    } else if (floor <= 10) {
      pool = ["bloodShade", "thunderWisp", "deathSentry", "lavaWorm", "venomSerpent"];
    } else if (floor <= 15) {
      pool = ["deathSentry", "lavaWorm", "venomSerpent", "mindEater", "bloodGolem", "thunderDragon"];
    } else if (floor <= 20) {
      pool = ["mindEater", "bloodGolem", "thunderDragon", "doomPriest", "asuraShade"];
    } else {
      pool = ["doomPriest", "asuraShade", "trueDemon"];
    }

    const isSide = run.currentNode?.type === "side";
    const tier = run.currentNode?.tier ?? Math.min(5, Math.ceil(floor / TRUE_MARTIAL_TIER_SIZE));
    const count = isSide
      ? randomInt(run, tier >= 2 ? 2 : 1, tier >= 4 ? 4 : 3)
      : floor >= 20
        ? randomInt(run, 3, 4)
        : floor >= 16
          ? randomInt(run, 2, 3)
          : floor >= 10
            ? randomInt(run, 2, 3) // TM-T2A6-P1: 10-15 2-3 enemies
            : floor >= 6
              ? 2 // TM-T2A6-P1: 6-9 fixed 2 enemies
              : randomInt(run, 1, 2);
    const result = [];
    for (let index = 0; index < count; index += 1) {
      result.push(makeEnemy(run, choice(run, pool)));
    }
    return result;
  }

  const pool = ["littleYao", "shanxiao", "foxYao", "waterGhost", "ironCorpse"];
  const tier = run.currentNode?.tier ?? Math.min(3, Math.ceil(run.floor / TIER_SIZE));
  const isSide = run.currentNode?.type === "side";
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
  const tune = difficultyTuning[run.difficulty] || difficultyTuning.beginner;
  const tmMult = run.trueMartial ? tune.enemyHpMult : tune.enemyHpMult;
  const definition = enemies[enemyId] || trueMartialEnemies[enemyId];
  if (!definition) {
    // Fallback to basic enemy
    const fallback = enemies["littleYao"];
    return {
      uid: nextEnemyUid(run),
      enemyId: "littleYao",
      name: fallback.name,
      hp: fallback.maxHp,
      maxHp: fallback.maxHp,
      block: 0,
      statuses: [],
      intent: rollEnemyIntent(run, "littleYao"),
    };
  }
  const isSide = run.currentNode?.type === "side";
  const isTrueMartial = run.trueMartial;
  const tierSize = isTrueMartial ? TRUE_MARTIAL_TIER_SIZE : TIER_SIZE;
  const tier = run.currentNode?.tier ?? Math.min(isTrueMartial ? 5 : 3, Math.ceil(run.floor / tierSize));
  const floorBonus = (enemyId === "blackMountain" || enemyId === "voidSovereign") ? 0 : Math.max(0, run.floor - 1) * (isSide ? 5 : 4);
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
  if (run.floor < 8 && !run.trueMartial) return 1;
  if (run.trueMartial && run.floor < 6) return 1;

  const tune = difficultyTuning[run.difficulty] || difficultyTuning.beginner;
  const pressure = runPowerPressure(run);

  // TM-T2A6-P1: trueMartial early-mid HP scaling from floor 6
  if (run.trueMartial && run.floor <= 14) {
    const tmFloor = run.floor - 6;
    return (1 + Math.min(0.85, 0.08 + tmFloor * 0.015 + pressure * 0.035)) * tune.lateEnemyPressure;
  }

  const lateFloor = Math.max(0, run.floor - 8);
  return (1 + Math.min(0.85, lateFloor * 0.025 + pressure * 0.035)) * tune.lateEnemyPressure;
}

export function previewEnemyIntent(run, enemy) {
  const intent = enemy?.intent;
  if (!run || !enemy || !intent) return null;

  if (intent.type === "attack") {
    const base = intent.value ?? 0;
    const bonus = enemyAttackBonus(run, enemy, { preview: true });
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
  const iv = intent?.value ?? 0;
  const bonus = enemyAttackBonus(run, enemy);
  const poison = statusStacks(enemy, "poison");
  const red = Math.min(5, Math.floor(poison / 2));
  const base = Math.max(0, iv + bonus - red);
  if (enemy.statuses?.some(s => s.id === "chaos" && s._chaosDebuff && s.stacks > 0)) return Math.floor(base * 0.5);
  return base;
}

function poisonAttackReduction(enemy) {
  const poison = statusStacks(enemy, "poison");
  if (poison <= 0) return 0;
  const red = Math.min(5, Math.floor(poison / 2));
  return red;
}

function projectedTrueMartialFormationAttackBonus(run, enemy) {
  const formation = run?.combat?.flags?.trueMartialFormation;
  if (!run?.trueMartial || !formation || !enemy) return 0;
  if (formation.stage === "break") return trueMartialFormationAttackBonus(run, enemy);
  let projectedPressure = formation.pressure ?? 0;
  const turn = run.combat?.turn ?? 0;
  if (!formation.triggeredTurns?.includes(turn)) {
    if (formation.stage === "trial" && turn >= 3 && projectedPressure < 2) projectedPressure = Math.min(2, projectedPressure + 1);
    else if (formation.stage === "demon") {
      if (turn === 4) projectedPressure = Math.min(5, projectedPressure + 1);
      if (turn === 10) projectedPressure = Math.min(5, projectedPressure + 2);
    } else if (formation.stage === "final") {
      if (turn % 3 === 0) projectedPressure = Math.min(6, projectedPressure + 1);
      const sov = run.combat?.enemies?.find(e => e.hp > 0 && e.enemyId === "voidSovereign");
      if (sov) {
        const hpPct = sov.hp / (sov.maxHp || 1);
        if (hpPct <= 0.33) projectedPressure = Math.max(projectedPressure, 4);
        else if (hpPct <= 0.66) projectedPressure = Math.max(projectedPressure, 2);
      }
    }
  }
  return projectedPressure;
}

function enemyAttackBonus(run, enemy, options = {}) {
  const bossBonus = enemy.enemyId === "blackMountain" && enemy.hp <= enemy.maxHp / 2
    ? 2 * (run.combat?.turn ?? 0) : 0;
  const formationBonus = options.preview
    ? projectedTrueMartialFormationAttackBonus(run, enemy)
    : trueMartialFormationAttackBonus(run, enemy);
  return bossBonus + formationBonus + enemyIntentBonus(run);
}

function enemyIntentBonus(run) {
  // TM-T2A6-P1: trueMartial early intent bonus from floor 6
  if (run.trueMartial) {
    if (run.floor < 6) return 0;
    if (run.floor <= 9) return 1;
  }

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
  const definition = enemies[enemyId] || trueMartialEnemies[enemyId];
  if (!definition) return { type: "attack", value: 5, text: "攻击 5" };
  return { ...choice(run, definition.intents) };
}

function nextEnemyUid(run) {
  run.nextUid += 1;
  return `enemy_${run.nextUid}`;
}

export function effectiveMaxEnergy(run) {
  const bonus = run?.combat?.flags?.soulFurnaceBonus ?? 0;
  return (run?.maxEnergy ?? 3) + bonus;
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

// ============ V3.0: True Martial Formation System ============

function hasTrueMartialRelic(run, relicId) {
  return Boolean(run?.trueMartial && run?.relics?.includes(relicId));
}

export function trueMartialFormationStage(run) {
  if (!run?.trueMartial) return null;
  const floor = run.floor ?? 1;
  if (floor <= 5) return "trial";
  if (floor <= 10) return "break";
  if (floor <= 15) return "demon";
  if (floor <= 20) return "ascend";
  return "final";
}

export function initializeTrueMartialFormation(state) {
  const run = state.run;
  if (!run?.trueMartial) return;
  const stage = trueMartialFormationStage(run);
  if (!stage) return;
  const combat = run.combat;
  if (!combat) return;

  const formation = { stage, pressure: 0, anchorUid: null, triggeredTurns: [] };
  let id, name;

  switch (stage) {
    case "trial":
      id = "resonance"; name = "真武共鸣"; break;
    case "break":
      id = "anchor"; name = "阵眼";
      if (combat.enemies.length > 0) {
        formation.anchorUid = combat.enemies[0].uid;
        combat.log.push(`真武阵眼显现：【${combat.enemies[0].name}】成为阵眼。`);
      }
      break;
    case "demon":
      id = "demonize"; name = "魔化倒计时"; break;
    case "ascend":
      id = "counter"; name = "破法轮转"; break;
    case "final":
      id = "voidDomain"; name = "虚渊领域"; break;
  }

  formation.id = id;
  formation.name = name;
  combat.flags.trueMartialFormation = formation;
}

export function trueMartialFormationInfo(run) {
  const combat = run?.combat;
  const formation = combat?.flags?.trueMartialFormation;
  if (!run?.trueMartial || !formation) return null;

  const stageInfo = {
    trial:    { stageLabel: "试锋 1-5层", summary: "敌人会随回合积蓄轻微攻势，拖久会变危险。", tip: "拖久会让敌方攻击提高。" },
    break:    { stageLabel: "破阵 6-10层", summary: "阵眼存活时，其他敌人获得攻防支援。", tip: "优先击破阵眼可削弱联动。" },
    demon:    { stageLabel: "入魔 11-15层", summary: "第4、7、10回合敌方会逐步强化。", tip: "注意第4/7/10回合的强化波次。" },
    ascend:   { stageLabel: "登真 16-20层", summary: "敌方会周期性净化负面状态并加定力。", tip: "中后期敌人会净化部分状态，不要只依赖无限叠层。" },
    final:    { stageLabel: "问武 21-25层", summary: "虚渊领域随回合加压，主宰血量降低后进入危险阶段。", tip: "注意主宰66%和33%的阶段变化。" },
  }[formation.stage] || { stageLabel: "未知", summary: "", tip: "" };

  const detailLines = [];
  if (formation.anchorUid) {
    const anchor = combat.enemies.find(e => e.uid === formation.anchorUid);
    if (anchor) detailLines.push(`阵眼：【${anchor.name}】`);
  }
  if (formation.pressure > 0) detailLines.push(`阵势压力：${formation.pressure}`);

  let nextTrigger = "";
  switch (formation.stage) {
    case "trial": nextTrigger = "第3回合后逐步增强"; break;
    case "break": nextTrigger = "每3回合给非阵眼敌人格挡"; break;
    case "demon": nextTrigger = "第4/7/10回合触发强化"; break;
    case "ascend": nextTrigger = "每3回合净化部分负面状态"; break;
    case "final": nextTrigger = "每3回合加压；主宰66%/33%转阶段"; break;
  }

  return { id: formation.id, name: formation.name, stage: formation.stage, stageLabel: stageInfo.stageLabel, summary: stageInfo.summary, detailLines, pressure: formation.pressure, anchorName: anchorName(formation, combat), nextTrigger, tip: stageInfo.tip };
}

function anchorName(f, combat) {
  if (!f.anchorUid) return null;
  const e = combat?.enemies?.find(x => x.uid === f.anchorUid);
  return e?.name ?? null;
}

export function trueMartialFormationAttackBonus(run, enemy) {
  const formation = run?.combat?.flags?.trueMartialFormation;
  if (!run?.trueMartial || !formation || !enemy) return 0;
  let bonus = 0;
  if (formation.pressure > 0 && formation.stage !== "break") {
    bonus += formation.pressure;
  }
  if (formation.stage === "break" && formation.anchorUid && enemy.uid !== formation.anchorUid) {
    const anchor = run.combat?.enemies?.find(e => e.uid === formation.anchorUid);
    if (anchor?.hp > 0) {
      bonus += 1; // V3.6: 2→1
    }
  }
  return bonus;
}

function applyTrueMartialFormation(state) {
  const run = state.run;
  if (!run?.trueMartial) return;
  const combat = run.combat;
  const f = combat?.flags?.trueMartialFormation;
  if (!combat || !f) return;

  const turn = combat.turn;
  if (f.triggeredTurns.includes(turn)) return;
  f.triggeredTurns.push(turn);

  switch (f.stage) {
    case "trial": {
      if (turn >= 3 && f.pressure < 2) {
        f.pressure = Math.min(2, f.pressure + 1);
        for (const e of combat.enemies) {
          if (e.hp > 0) e.block = (e.block || 0) + 2;
        }
        combat.log.push("真武共鸣涌动，敌方阵势 +1。");
      }
      break;
    }
    case "break": {
      if (f.anchorUid) {
        const anchor = combat.enemies.find(e => e.uid === f.anchorUid);
        if (turn % 3 === 0 && anchor && anchor.hp > 0) {
          for (const e of combat.enemies) {
            if (e.uid !== f.anchorUid && e.hp > 0) e.block = (e.block || 0) + 3; // V3.6: 4→3
          }
          combat.log.push("阵眼牵引，敌方获得护势。");
        }
      }
      break;
    }
    case "demon": {
      if (turn === 4) {
        f.pressure = Math.min(5, f.pressure + 1); // V3.6: 2→1
        combat.log.push("魔气翻涌，敌方攻势增强。");
      }
      if (turn === 7) {
        for (const e of combat.enemies) {
          if (e.hp > 0) addStatus(e, "controlResist", 1);
        }
        combat.log.push("魔心凝定，敌方获得定力。");
      }
      if (turn === 10) {
        f.pressure = Math.min(5, f.pressure + 2); // V3.6: 3→2
        combat.log.push("魔化完成，敌方攻势大幅增强。");
      }
      break;
    }
    case "ascend": {
      if (turn % 3 === 0) {
        for (const e of combat.enemies) {
          if (e.hp <= 0) continue;
          const statusIds = ["poison", "bleed", "thunderMark", "burn"];
          let maxId = statusIds[0], maxVal = 0;
          for (const sid of statusIds) {
            const v = e.statuses?.find(s => s.id === sid)?.stacks ?? 0;
            if (v > maxVal) { maxVal = v; maxId = sid; }
          }
          if (maxVal > 0) {
            const remove = Math.max(1, Math.floor(maxVal * 0.3));
            const s = e.statuses.find(s => s.id === maxId);
            if (s) s.stacks = Math.max(0, s.stacks - remove);
          }
          const hasControl = e.statuses?.some(s => (s.id === "chaos" || s.id === "bind" || s.id === "stun") && s.stacks > 0);
          if (hasControl) addStatus(e, "controlResist", 1);
        }
        combat.log.push("破法轮转，敌方化去部分负面状态。");
      }
      break;
    }
    case "final": {
      if (turn % 3 === 0) {
        f.pressure = Math.min(6, f.pressure + 1);
        combat.log.push("虚渊领域加深，敌方阵势增强。");
      }
      for (const e of combat.enemies) {
        if (e.hp <= 0 || e.enemyId !== "voidSovereign") continue;
        const hpPct = e.hp / (e.maxHp || 1);
        // V3.0.1: use logged flags so phase messages always appear once
        if (hpPct <= 0.33 && !f.phase33Logged) {
          f.phase33Logged = true;
          f.pressure = Math.max(f.pressure, 4);
          combat.log.push("虚渊主宰进入归墟阶段。");
        } else if (hpPct <= 0.66 && !f.phase66Logged) {
          f.phase66Logged = true;
          f.pressure = Math.max(f.pressure, 2);
          combat.log.push("虚渊主宰进入破法阶段。");
        }
      }
      break;
    }
  }
}
