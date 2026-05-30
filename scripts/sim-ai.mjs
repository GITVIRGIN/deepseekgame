import { cards, relics as allRelics } from "../src/core/data.js";
import { createRunGoal, markSpecialGoalBaseline } from "../src/core/goals.js";
import { prepareRouteChoice } from "../src/core/nodes.js";
import { reduceGame } from "../src/core/reducer.js";
import { createInitialState, startRun } from "../src/core/state.js";

const STYLES = ["physical", "spell", "bleed", "shell", "poison", "control"];
const NAMES = { physical: "物理", spell: "法术", bleed: "流血", shell: "龟壳", poison: "中毒", control: "控制" };
const RUNS = 200;

function runOne(seed, profile, trueMartial = false) {
  let s = seededRun(seed, trueMartial ? profile : null);
  let steps = 0;
  let stepCombat = 0;
  while (s.phase !== "gameOver" && steps < 4000) {
    steps++;
    if (s.phase === "combat") stepCombat++;
    else stepCombat = 0;

    if (s.phase === "route") {
      s = reduceGame(s, { type: "chooseNode", nodeId: pickRoute(s.run).id });
      continue;
    }
    if (s.phase === "shop") {
      s = shopAct(s);
      continue;
    }
    if (s.phase === "reward") {
      s = reduceGame(s, { type: "chooseReward", rewardId: pickReward(s, profile).id });
      continue;
    }
    if (s.phase === "combat") {
      s = reduceGame(s, combatAct(s, stepCombat, profile));
    }
  }
  return {
    floor: s.run?.floor ?? 0,
    won: Boolean(s.run?.goal?.completedBy),
    deck: s.run?.deck.length ?? 0,
    relics: s.run?.relics.length ?? 0,
    energy: s.run?.maxEnergy ?? 3,
    hp: s.run?.hp ?? 0,
  };
}

function seededRun(seed, tmStyle = null) {
  const initial = createInitialState();
  const s = startRun(initial, tmStyle);
  s.run.seed = seed;
  s.run.goal = createRunGoal(seed);
  markSpecialGoalBaseline(s.run);
  return prepareRouteChoice(s);
}

// ============ ROUTE ============
function pickRoute(run) {
  const c = run.nodeChoices ?? [];
  const shop = c.find(n => n.id === "shop_final" || n.type === "shop");
  const side = c.find(n => n.id === "side_final" || n.type === "side");
  const main = c.find(n => n.type === "main") ?? c[0];
  // Early game: avoid side if HP low
  if (side && run.hp >= run.maxHp * 0.5) return side;
  if (shop && run.gold >= 30) return shop;
  return main;
}

// ============ SHOP ============
function shopAct(s) {
  const run = s.run;
  const stock = (run.shopStock ?? []).filter(i => !i.sold);
  // Priority: max energy > max HP > rare card > relic > heal
  const priority = { maxEnergy: 100, maxHp: 60, rareCard: 50, relic: 45, heal: 35, handLimit: 30 };
  const affordable = stock.filter(i => run.gold >= i.price);
  if (affordable.length === 0) return reduceGame(s, { type: "leaveShop" });
  affordable.sort((a, b) => {
    const sa = Math.max(...(a.effects || []).map(e => priority[e.type] || 0));
    const sb = Math.max(...(b.effects || []).map(e => priority[e.type] || 0));
    return sb - sa;
  });
  return reduceGame(s, { type: "buyShopItem", itemId: affordable[0].id });
}

// ============ REWARD ============
function pickReward(s, profile = "balanced") {
  const run = s.run;
  const floor = run.floor;
  const rewards = run.rewards;
  const isTM = run.trueMartial;

  // Energy relic: always pick early
  const energyRel = rewards.find(r => r.type === "relic" && allRelics[r.value]?.effects?.some(e => e.type === "energy"));
  if (energyRel && run.maxEnergy < 4) return energyRel;

  // Heal when critical
  const heal = rewards.find(r => r.type === "heal");
  if (heal && run.hp <= run.maxHp * 0.35) return heal;

  // Early game (floor < 8): prefer survival and generics
  if (floor < 8) {
    const relic = rewards.find(r => r.type === "relic");
    if (relic) return relic;
    const gold = rewards.find(r => r.type === "gold");
    if (gold) return gold;
  }

  // Late game: prefer high-quality cards matching profile
  return [...rewards].sort((a, b) => rewardScore(run, b, profile) - rewardScore(run, a, profile))[0];
}

function rewardScore(run, reward, profile = "balanced") {
  if (reward.type === "specialFragment") return 85;
  if (reward.type === "relic") return 65;
  if (reward.type === "gold") return run.gold < 50 ? 28 : 15;
  if (reward.type === "heal") return run.hp <= run.maxHp * 0.5 ? 70 : 10;
  const card = cards[reward.value];
  if (!card) return 0;
  let s = 5;
  if (card.rarity === "legendary") s += 45;
  else if (card.rarity === "epic") s += 30;
  else if (card.rarity === "rare") s += 15;
  if (card.effects.some(e => e.type === "draw")) s += 12;
  if (card.effects.some(e => e.type === "gainEnergy")) s += 20;
  if (card.effects.some(e => e.type === "block")) s += run.hp <= run.maxHp * 0.5 ? 25 : 5;
  if (card.cost >= 2 && run.maxEnergy >= 4) s += 15;

  // Style-aware card picking
  if (card.style === profile) s += 20;
  if (profile === "bleed" && card.effects.some(e => e.type === "status" && e.status === "bleed")) s += 28;
  if (profile === "bleed" && card.effects.some(e => e.type === "bleedSiphon")) s += 35;
  if (profile === "poison" && card.effects.some(e => e.type === "status" && e.status === "poison")) s += 28;
  if (profile === "spell" && card.effects.some(e => e.type === "thunderMark")) s += 34;
  if (profile === "physical" && card.effects.some(e => e.type === "damage")) s += 16;
  if (profile === "physical" && card.effects.some(e => e.type === "execute")) s += 25;
  if (profile === "shell" && card.effects.some(e => e.type === "block")) s += 18;
  if (profile === "shell" && card.effects.some(e => e.type === "shellReflect")) s += 40;
  if (profile === "control" && card.effects.some(e => ["chaos","bind","stun","stasis"].includes(e.status))) s += 32;
  return s;
}

// ============ COMBAT AI ============
function hasTMRelic(run, id) { return run.trueMartial && (run.relics || []).includes(id); }

function combatAct(s, stepC, profile = "balanced") {
  if (stepC > 200) return { type: "endTurn" }; // safety valve
  const run = s.run;
  const combat = run.combat;
  const hand = combat.hand.filter(inst => !(cards[inst.cardId]?.id === "meditate" && run.energy >= run.maxEnergy));
  const hpPct = run.hp / run.maxHp;
  const block = combat.block ?? 0;
  const enemies = combat.enemies.filter(e => e.hp > 0);
  const isBoss = enemies.some(e => e.maxHp && e.maxHp >= 40 && enemies.length === 1);
  const isTM = run.trueMartial;
  const enemyDmg = estimateIncoming(run);

  // Discard pick
  if (run.pendingChoice?.type === "discardPick") {
    return handleDiscard(run);
  }

  // === Profile-specific AI first (if enabled) ===
  if (profile !== "balanced" && isTM) {
    let profileAct = null;
    if (profile === "bleed") profileAct = bleedAI(run, hand);
    else if (profile === "poison") profileAct = poisonAI(run, hand);
    else if (profile === "physical") profileAct = physicalAI(run, hand);
    else if (profile === "spell") profileAct = spellAI(run, hand);
    else if (profile === "shell") profileAct = shellAI(run, hand);
    else if (profile === "control") profileAct = controlAI(run, hand);
    if (profileAct) return profileAct;
  }

  // Boss fight: max aggression
  if (isBoss) {
    const dmgCard = findBest(run, hand, e => e.type === "damage" || e.type === "execute");
    if (dmgCard) return { type: "playCard", cardUid: dmgCard.uid, targetUid: null };
  }

  // Can we kill an enemy this turn? (improved: considers true damage)
  const canKill = findKill(run, hand);
  if (canKill && hpPct > 0.15) return { type: "playCard", cardUid: canKill.uid, targetUid: null };

  // Low HP defense
  if (hpPct < 0.3 && block < enemyDmg) {
    const blockCard = findBest(run, hand, e => e.type === "block");
    if (blockCard) return { type: "playCard", cardUid: blockCard.uid, targetUid: null };
    const healCard = findBest(run, hand, e => e.type === "heal");
    if (healCard) return { type: "playCard", cardUid: healCard.uid, targetUid: null };
  }

  // Draw/energy always good when we have energy to spare
  const drawCard = findBest(run, hand, e => e.type === "draw" || e.type === "gainEnergy");
  if (drawCard && run.energy >= 2) return { type: "playCard", cardUid: drawCard.uid, targetUid: null };

  // Play sensible cards
  const playable = hand
    .map(inst => ({ inst, card: cards[inst.cardId] }))
    .filter(h => run.energy >= h.card.cost && (h.card.id !== "meditate" || run.energy < run.maxEnergy));

  if (playable.length === 0) return { type: "endTurn" };

  // Score each playable card
  playable.sort((a, b) => cardScore(run, b.card, profile) - cardScore(run, a.card, profile));
  const best = playable[0];
  if (cardScore(run, best.card, profile) < -20 && hpPct > 0.4) return { type: "endTurn" };

  return { type: "playCard", cardUid: best.inst.uid, targetUid: null };
}

function cardScore(run, card, profile) {
  let s = 0;
  const hpPct = run.hp / run.maxHp;
  const block = run.combat?.block ?? 0;
  const enemies = (run.combat?.enemies || []).filter(e => e.hp > 0);
  const isTM = run.trueMartial;

  // Damage: good, better when safe or enemy near death
  const nearKill = enemies.some(e => e.hp > 0 && e.hp <= 15);
  if (card.effects.some(e => e.type === "damage")) {
    let dmgBonus = 20 + (nearKill ? 30 : 0);
    if (hpPct > 0.4) dmgBonus += 15;
    // poJunLing: +3 true damage makes physical damage much better vs block
    if (isTM && card.style === "physical" && hasTMRelic(run, "poJunLing")) dmgBonus += 20;
    s += dmgBonus;
  }
  // Block: essential when low
  if (card.effects.some(e => e.type === "block")) {
    const needed = Math.max(0, estimateIncoming(run) - block);
    s += hpPct < 0.3 && needed > 0 ? 50 : hpPct < 0.5 ? 15 : 5;
    // turtleShell: start +20 block, reflect double, value block more for shell
    if (isTM && hasTMRelic(run, "turtleShell") && profile === "shell") s += 15;
  }
  // Draw/energy: always positive
  if (card.effects.some(e => e.type === "draw" || e.type === "gainEnergy")) s += 35;
  // Shell reflect: good with block; turtleShell doubles reflect value
  if (card.effects.some(e => e.type === "shellReflect")) {
    const reflectBonus = (isTM && hasTMRelic(run, "turtleShell")) ? 25 : 0;
    s += block > 10 ? 60 + reflectBonus : 10 + reflectBonus;
  }
  // Bleed siphon: good with stacks; asuraHeart doubles siphon
  if (card.effects.some(e => e.type === "bleedSiphon")) {
    const siphonBonus = (isTM && hasTMRelic(run, "asuraHeart")) ? 35 : 0;
    s += 30 + siphonBonus;
  }
  // Statuses: generally positive
  if (card.effects.some(e => e.type === "status")) s += 15;
  // Spikes: free damage
  if (card.effects.some(e => e.type === "status" && e.status === "spikes")) s += 10;
  // Execute: amazing on low enemies
  if (card.effects.some(e => e.type === "execute")) s += 35;
  // Double block: good
  if (card.effects.some(e => e.type === "doubleBlock")) s += block > 10 ? 55 : 20;
  // Thunder mark: stack for trib; nineSky makes trib MUCH better (52 dmg + 2 stun)
  if (card.effects.some(e => e.type === "thunderMark")) {
    const tmStacks = aliveEnemy(run)?.statuses?.find(st => st.id === "thunderMark")?.stacks ?? 0;
    const nearTrib = tmStacks >= 6;
    const tribBonus = (isTM && hasTMRelic(run, "nineSkyTribulation")) ? (nearTrib ? 50 : 20) : 0;
    s += 25 + tribBonus;
  }
  // Self-damage: avoid when low, but asuraHeart makes bleed siphon worth the risk
  if (card.effects.some(e => e.type === "loseHp")) {
    const hasSiphon = card.effects.some(e => e.type === "bleedSiphon");
    const siphonSafe = hasSiphon && isTM && hasTMRelic(run, "asuraHeart");
    s -= hpPct < 0.4 && !siphonSafe ? 80 : hpPct < 0.6 && !siphonSafe ? 30 : 10;
  }

  if (card.style === profile) s += 14;
  // Profile synergy bonuses
  const e = card.effects;
  if (profile === "bleed" && e.some(f => f.type === "bleedSiphon")) s += 45;
  if (profile === "bleed" && e.some(f => f.type === "status" && f.status === "bleed")) s += 18;
  if (profile === "shell" && e.some(f => f.type === "shellReflect")) s += block > 12 ? 50 : 20;
  if (profile === "shell" && e.some(f => f.type === "block")) s += 10;
  if (profile === "poison" && e.some(f => f.type === "status" && f.status === "poison")) {
    // venomScripture doubles enemy poison damage
    const poisonBonus = (isTM && hasTMRelic(run, "venomScripture")) ? 18 : 0;
    s += 22 + poisonBonus;
  }
  if (profile === "poison" && e.some(f => f.type === "amplifyDebuffs")) s += 30;
  if (profile === "spell" && e.some(f => f.type === "thunderMark")) s += 35;
  if (profile === "control" && e.some(f => ["chaos","bind","stasis","stun"].includes(f.status))) s += 30;
  if (profile === "physical" && e.some(f => f.type === "execute")) s += 28;
  if (profile === "physical" && e.some(f => f.type === "status" && f.status === "battleIntent")) s += 15;

  // High cost penalty if low energy
  if (card.cost >= 2 && run.maxEnergy < 4 && run.energy <= card.cost) s -= 20;
  return s;
}

function findBest(run, hand, effectFilter) {
  const playable = hand
    .map(inst => ({ inst, card: cards[inst.cardId] }))
    .filter(h => run.energy >= h.card.cost && h.card.effects.some(effectFilter));
  if (playable.length === 0) return null;
  playable.sort((a, b) => {
    const va = totalEffectValue(b.card, effectFilter);
    const vb = totalEffectValue(a.card, effectFilter);
    return vb - va;
  });
  return playable[0].inst;
}

function totalEffectValue(card, filter) {
  return card.effects.filter(filter).reduce((s, e) => s + (e.value || e.stacks || 1), 0);
}

function findKill(run, hand) {
  const enemies = run.combat?.enemies.filter(e => e.hp > 0) ?? [];
  const lowest = enemies.sort((a, b) => a.hp - b.hp)[0];
  if (!lowest) return null;
  const isTM = run.trueMartial;
  const hasPoJun = isTM && hasTMRelic(run, "poJunLing");
  // True damage from poJunLing bypasses block: physical cards get +7 true damage
  const trueDmg = hasPoJun ? 7 : 0;

  const dmgCards = hand
    .map(inst => ({ inst, card: cards[inst.cardId] }))
    .filter(h => run.energy >= h.card.cost && h.card.effects.some(e => e.type === "damage"));

  for (const h of dmgCards) {
    const rawDmg = h.card.effects.filter(e => e.type === "damage").reduce((s, e) => s + (e.value || 0), 0);
    const bonus = (h.card.style === "physical" && hasPoJun) ? trueDmg : 0;
    const totalDmg = rawDmg + bonus;
    // If damage > enemy HP + block (true damage bypasses block partially)
    const effectiveHp = lowest.hp + (hasPoJun && h.card.style === "physical" ? Math.max(0, lowest.block - trueDmg) : lowest.block);
    if (totalDmg >= effectiveHp) return h.inst;
  }
  // Fallback: if enemy is very low, any damage card
  const totalBlock = lowest.block || 0;
  if (lowest.hp + totalBlock <= 18 + trueDmg * 2 && dmgCards.length > 0) return dmgCards[0].inst;
  return null;
}

function estimateIncoming(run) {
  const enemies = run.combat?.enemies.filter(e => e.hp > 0) ?? [];
  // Rough estimate of next turn's incoming damage
  return enemies.reduce((s, e) => {
    const intent = e.nextIntent ?? { type: "attack", value: 6 };
    return s + (intent.type === "attack" ? intent.value : 0);
  }, 0);
}

function handleDiscard(run) {
  const pick = run.combat.discardPile.find(c => c.uid !== run.pendingChoice.sourceUid);
  return pick ? { type: "pickDiscardCard", cardUid: pick.uid } : { type: "cancelDiscardPick" };
}

// ============ RUN ============
const SEEDS = [
  { label: "seed1", base: 2026052700 },
  { label: "seed2", base: 2026053117 },
];

function runBatch(label, styles, tmFlag) {
  console.log(`\n${label}`);
  console.log("流派      通关%   均层   均牌组  均遗物  均能量  失败层分布");
  console.log("─".repeat(65));
  for (const style of styles) {
    let wins = 0, floors = 0, decks = 0, relics = 0, energy = 0;
    const deathFloors = [];
    const runsPerSeed = Math.floor(RUNS / SEEDS.length);
    for (const sd of SEEDS) {
      for (let i = 0; i < runsPerSeed; i++) {
        const seed = (sd.base + STYLES.indexOf(style) * 7919 + i * 92821) >>> 0;
        const r = runOne(seed, style, tmFlag);
        if (r.won) wins++;
        else deathFloors.push(r.floor);
        floors += r.floor;
        decks += r.deck;
        relics += r.relics;
        energy += r.energy;
      }
    }
    const total = RUNS;
    const lossCount = total - wins;
    // Floor distribution: early(1-6) / mid(7-12) / late(13-18)
    const earlyDeaths = deathFloors.filter(f => f <= 6).length;
    const midDeaths = deathFloors.filter(f => f >= 7 && f <= 12).length;
    const lateDeaths = deathFloors.filter(f => f >= 13).length;
    const distStr = lossCount > 0 ? `早${earlyDeaths}中${midDeaths}晚${lateDeaths}` : "-";
    console.log(
      NAMES[style].padEnd(6),
      `${(wins / total * 100).toFixed(1)}%`.padStart(6),
      (floors / total).toFixed(1).padStart(5),
      (decks / total).toFixed(0).padStart(5),
      (relics / total).toFixed(1).padStart(5),
      (energy / total).toFixed(1).padStart(5),
      `  ${distStr}`
    );
  }
}

runBatch("=== 常规模式 ===  (200局/流派, 2 seed)", STYLES, false);
runBatch("=== 真武模式 ===  (200局/流派, 2 seed)", STYLES, true);
function makeAction(h) { return { type: "playCard", cardUid: h.inst.uid, targetUid: null }; }
function aliveEnemy(run) { return run?.combat?.enemies?.find(e => e.hp > 0) ?? null; }
function mapHand(hand) { return hand.map(inst => ({ inst, card: cards[inst.cardId] })); }

function bleedAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const curBleed = aliveEnemy(run)?.statuses?.find(s => s.id === "bleed")?.stacks ?? 0;
  const siphon = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "bleedSiphon"));
  const bleed = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "status" && e.status === "bleed"));
  // asuraHeart doubles siphon → much more healing, so lower threshold to siphon
  const hasAsura = hasTMRelic(run, "asuraHeart");
  const siphonThreshold = hasAsura ? 3 : 5;
  if (siphon.length > 0 && curBleed >= siphonThreshold && run.hp <= run.maxHp * 0.6) return makeAction(siphon[0]);
  if (siphon.length > 0 && curBleed >= siphonThreshold + 3) return makeAction(siphon[0]);
  if (bleed.length > 0) return makeAction(bleed.sort((a,b)=>(b.card.effects.find(e=>e.status==="bleed")?.stacks||0)-(a.card.effects.find(e=>e.status==="bleed")?.stacks||0))[0]);
  if (run.hp <= run.maxHp * 0.3) { const b=hand.filter(h=>ok(h)&&h.card.effects.some(e=>e.type==="block")); if(b.length>0)return makeAction(b[0]); }
  return null;
}
function poisonAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const psn = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "status" && e.status === "poison"));
  const amp = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "amplifyDebuffs"));
  const curPsn = aliveEnemy(run)?.statuses?.find(s => s.id === "poison")?.stacks ?? 0;
  const hasVenom = hasTMRelic(run, "venomScripture");
  // venomScripture doubles poison damage → poison stacking is much more valuable
  if (psn.length > 0) return makeAction(psn.sort((a,b)=>(b.card.effects.find(e=>e.status==="poison")?.stacks||0)-(a.card.effects.find(e=>e.status==="poison")?.stacks||0))[0]);
  if (amp.length > 0 && curPsn >= (hasVenom ? 5 : 8)) return makeAction(amp[0]);
  // Also consider damage if enemy near death (poison takes time)
  const target = aliveEnemy(run);
  if (target && target.hp <= 8) { const d=hand.filter(h=>ok(h)&&h.card.effects.some(e=>e.type==="damage")); if(d.length>0)return makeAction(d[0]); }
  if (run.hp <= run.maxHp * 0.3) { const b=hand.filter(h=>ok(h)&&h.card.effects.some(e=>e.type==="block")); if(b.length>0)return makeAction(b[0]); }
  return null;
}
function physicalAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const target = aliveEnemy(run);
  const hasPoJun = hasTMRelic(run, "poJunLing");
  const trueDmg = hasPoJun ? 7 : 0;
  const exec = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "execute" || e.tmExecute));
  const dmg = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "damage"));
  // Priority: execute if target low
  if (exec.length > 0 && target && target.hp <= target.maxHp * 0.35) return makeAction(exec[0]);
  // With poJunLing, physical damage bypasses block → prioritize damage even vs high block
  if (dmg.length > 0) {
    const sorted = dmg.sort((a,b)=>{
      const va = (b.card.effects.find(e=>e.type==="damage")?.value||0) + (b.card.style==="physical"&&hasPoJun?trueDmg:0);
      const vb = (a.card.effects.find(e=>e.type==="damage")?.value||0) + (a.card.style==="physical"&&hasPoJun?trueDmg:0);
      return va - vb;
    })[0];
    return makeAction(sorted);
  }
  // Battle intent cards
  const intent = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "status" && e.status === "battleIntent"));
  if (intent.length > 0 && dmg.length === 0) return makeAction(intent[0]);
  return null;
}
function spellAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const mark = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "thunderMark"));
  const tm = aliveEnemy(run)?.statuses?.find(s => s.id === "thunderMark")?.stacks ?? 0;
  const hasNineSky = hasTMRelic(run, "nineSkyTribulation");
  // nineSky: trib does 52 dmg + 2 stun → near-trib marks are extremely valuable
  const tribThreshold = hasNineSky ? 5 : 7;
  if (tm >= tribThreshold) {
    const d = hand.filter(h=>ok(h)&&h.card.effects.some(e=>e.type==="damage"||e.type==="thunderMark"));
    if(d.length>0)return makeAction(d.sort((a,b)=>(b.card.effects.find(e=>e.type==="thunderMark")?.value||0)-(a.card.effects.find(e=>e.type==="thunderMark")?.value||0))[0]);
  }
  if (mark.length > 0) return makeAction(mark.sort((a,b)=>(b.card.effects.find(e=>e.type==="thunderMark")?.value||0)-(a.card.effects.find(e=>e.type==="thunderMark")?.value||0))[0]);
  if (run.hp <= run.maxHp * 0.25) { const b=hand.filter(h=>ok(h)&&h.card.effects.some(e=>e.type==="block")); if(b.length>0)return makeAction(b[0]); }
  return null;
}

function shellAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const block = run.combat?.block ?? 0;
  const hasTurtle = hasTMRelic(run, "turtleShell");
  const reflect = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "shellReflect"));
  const blockCards = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "block"));
  const spikes = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "status" && e.status === "spikes"));
  const hpPct = run.hp / run.maxHp;
  // turtleShell doubles reflect → reflect with some block is devastating
  const reflectMinBlock = hasTurtle ? 8 : 14;
  if (reflect.length > 0 && block >= reflectMinBlock) return makeAction(reflect[0]);
  if (blockCards.length > 0 && (block < 15 || hpPct < 0.4)) return makeAction(blockCards.sort((a,b)=>(b.card.effects.find(e=>e.type==="block")?.value||0)-(a.card.effects.find(e=>e.type==="block")?.value||0))[0]);
  if (spikes.length > 0 && block >= 8) return makeAction(spikes[0]);
  if (reflect.length > 0 && block >= 5) return makeAction(reflect[0]);
  if (blockCards.length > 0) return makeAction(blockCards[0]);
  return null;
}

function controlAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const target = aliveEnemy(run);
  const hasChaos = hasTMRelic(run, "chaosTreasure");
  const controlPressure = (target?.statuses || []).reduce((s, st) => {
    if (["chaos","bind","stun","stasis"].includes(st.id)) return s + (st.stacks || 0);
    return s;
  }, 0);
  const control = hand.filter(h => ok(h) && h.card.effects.some(e => ["chaos","bind","stun","stasis"].includes(e.status)));
  const dmg = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "damage"));
  // If enemy already well-controlled, deal damage
  if (controlPressure >= 5 && dmg.length > 0) return makeAction(dmg.sort((a,b)=>(b.card.effects.find(e=>e.type==="damage")?.value||0)-(a.card.effects.find(e=>e.type==="damage")?.value||0))[0]);
  // Apply control if enemy not controlled enough
  if (control.length > 0 && controlPressure < 4) return makeAction(control[0]);
  // Damage if controlled
  if (dmg.length > 0) return makeAction(dmg[0]);
  // Apply more control
  if (control.length > 0) return makeAction(control[0]);
  if (run.hp <= run.maxHp * 0.3) { const b=hand.filter(h=>ok(h)&&h.card.effects.some(e=>e.type==="block")); if(b.length>0)return makeAction(b[0]); }
  return null;
}


