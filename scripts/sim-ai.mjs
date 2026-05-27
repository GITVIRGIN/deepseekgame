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
      s = reduceGame(s, { type: "chooseReward", rewardId: pickReward(s).id });
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
function pickReward(s) {
  const run = s.run;
  const floor = run.floor;
  const rewards = run.rewards;

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

  // Late game: prefer high-quality cards
  return [...rewards].sort((a, b) => rewardScore(run, b) - rewardScore(run, a))[0];
}

function rewardScore(run, reward) {
  if (reward.type === "specialFragment") return 85;
  if (reward.type === "relic") return 65;
  if (reward.type === "gold") return 25;
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
  return s;
}

// ============ COMBAT AI ============
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

  // Boss fight: max aggression, kill before curse stacks kill you
  if (isBoss) {
    const dmgCard = findBest(run, hand, e => e.type === "damage" || e.type === "execute");
    if (dmgCard) return { type: "playCard", cardUid: dmgCard.uid, targetUid: null };
  }

  // Can we kill an enemy this turn?
  const canKill = findKill(run, hand);
  if (canKill && hpPct > 0.2) return { type: "playCard", cardUid: canKill.uid, targetUid: null };

  // Low HP defense - BUT if we can kill an enemy, do it
  const nearDeath = enemies.some(e => e.hp <= 15);
  if (hpPct < 0.3 && block < enemyDmg && !nearDeath) {
    const blockCard = findBest(run, hand, e => e.type === "block");
    if (blockCard) return { type: "playCard", cardUid: blockCard.uid, targetUid: null };
  }

  // Draw/energy always good
  const drawCard = findBest(run, hand, e => e.type === "draw" || e.type === "gainEnergy");
  if (drawCard && run.energy >= 2) return { type: "playCard", cardUid: drawCard.uid, targetUid: null };

  // Archetype preference
  const styleBoost = profile !== "balanced" ? 10 : 0;

  // Play sensible cards
  const playable = hand
    .map(inst => ({ inst, card: cards[inst.cardId] }))
    .filter(h => run.energy >= h.card.cost && (h.card.id !== "meditate" || run.energy < run.maxEnergy));

  if (playable.length === 0) return { type: "endTurn" };

  // Score each playable card
  playable.sort((a, b) => cardScore(run, b.card, profile) - cardScore(run, a.card, profile));
  const best = playable[0];
  if (cardScore(run, best.card, profile) < 0 && hpPct > 0.5) return { type: "endTurn" };

  return { type: "playCard", cardUid: best.inst.uid, targetUid: null };
}

function cardScore(run, card, profile) {
  let s = 0;
  const hpPct = run.hp / run.maxHp;
  const block = run.combat?.block ?? 0;
  

  // Damage: good, better when safe or enemy near death
  const nearKill = (run.combat?.enemies || []).some(e => e.hp > 0 && e.hp <= 15);
  if (card.effects.some(e => e.type === "damage")) { s += 20 + (nearKill ? 30 : 0); if (hpPct > 0.4) s += 15; }
  // Block: essential when low, but don't over-block
  const enemyDmg2 = estimateIncoming(run);
  if (card.effects.some(e => e.type === "block")) {
    const needed = Math.max(0, estimateIncoming(run) - (run.combat?.block ?? 0));
    s += hpPct < 0.3 && needed > 0 ? 50 : hpPct < 0.5 ? 15 : 5;
  }
  // Draw/energy: always positive
  if (card.effects.some(e => e.type === "draw" || e.type === "gainEnergy")) s += 35;
  // Shell reflect: good with block
  if (card.effects.some(e => e.type === "shellReflect")) s += block > 10 ? 60 : 10;
  // Bleed siphon: good with stacks
  if (card.effects.some(e => e.type === "bleedSiphon")) s += 30;
  // Statuses: generally positive
  if (card.effects.some(e => e.type === "status")) s += 15;
  // Spikes: free damage
  if (card.effects.some(e => e.type === "status" && e.status === "spikes")) s += 10;
  // Execute: amazing on low enemies
  if (card.effects.some(e => e.type === "execute")) s += 35;
  // Double block: good
  if (card.effects.some(e => e.type === "doubleBlock")) s += block > 10 ? 55 : 20;
  // Thunder mark: stack for trib
  if (card.effects.some(e => e.type === "thunderMark")) s += 25;
  // Self-damage: avoid when low
  if (card.effects.some(e => e.type === "loseHp")) s -= hpPct < 0.5 ? 80 : 15;
  if (card.style === profile) s += 12;
  // Profile synergy bonuses
  const e = card.effects;
  if (profile === "bleed" && e.some(f => f.type === "bleedSiphon")) s += 45;
  if (profile === "bleed" && e.some(f => f.type === "status" && f.status === "bleed")) s += 18;
  if (profile === "shell" && e.some(f => f.type === "shellReflect")) s += block > 12 ? 50 : 20;
  if (profile === "shell" && e.some(f => f.type === "block")) s += 10;
  if (profile === "poison" && e.some(f => f.type === "status" && f.status === "poison")) s += 22;
  if (profile === "poison" && e.some(f => f.type === "amplifyDebuffs")) s += 30;
  if (profile === "spell" && e.some(f => f.type === "thunderMark")) s += 35;
  if (profile === "control" && e.some(f => ["chaos","bind","stasis"].includes(f.status))) s += 30;
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
  playable.sort((a, b) => 
    (b.card.effects.filter(effectFilter).reduce((s, e) => s + (e.value || e.stacks || 1), 0)) -
    (a.card.effects.filter(effectFilter).reduce((s, e) => s + (e.value || e.stacks || 1), 0))
  );
  return playable[0].inst;
}

function findKill(run, hand) {
  const enemies = run.combat?.enemies.filter(e => e.hp > 0) ?? [];
  const lowest = enemies.sort((a, b) => a.hp - b.hp)[0];
  if (!lowest || lowest.hp > 18) return null;
  const dmgCards = hand
    .map(inst => ({ inst, card: cards[inst.cardId] }))
    .filter(h => run.energy >= h.card.cost && h.card.effects.some(e => e.type === "damage"));
  if (dmgCards.length === 0) return null;
  return dmgCards[0].inst;
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
console.log("流派      通关%   均层   均牌组  均遗物  均能量");
console.log("─".repeat(48));

function runBatch(label, styles, tmFlag) {
  console.log(`\n${label}`);
  console.log("流派      通关%   均层   均牌组  均遗物  均能量");
  console.log("─".repeat(48));
  for (const style of styles) {
    let wins = 0, floors = 0, decks = 0, relics = 0, energy = 0;
    for (let i = 0; i < RUNS; i++) {
      const seed = (2026052700 + STYLES.indexOf(style) * 7919 + i * 92821) >>> 0;
      const r = runOne(seed, style, tmFlag);
      if (r.won) wins++;
      floors += r.floor;
      decks += r.deck;
      relics += r.relics;
      energy += r.energy;
    }
    console.log(
      NAMES[style].padEnd(6),
      `${(wins / RUNS * 100).toFixed(1)}%`,
      (floors / RUNS).toFixed(1),
      (decks / RUNS).toFixed(0),
      (relics / RUNS).toFixed(1),
      (energy / RUNS).toFixed(1)
    );
  }
}

runBatch("=== 常规模式 ===", STYLES, false);
runBatch("=== 真武模式 ===", STYLES, true);
function makeAction(h) { return { type: "playCard", cardUid: h.inst.uid, targetUid: null }; }
function aliveEnemy(run) { return run?.combat?.enemies?.find(e => e.hp > 0) ?? null; }

function bleedAI(run, hand) {
  const ok = h => run.energy >= h.card.cost;
  const curBleed = aliveEnemy(run)?.statuses?.find(s => s.id === "bleed")?.stacks ?? 0;
  const siphon = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "bleedSiphon"));
  const bleed = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "status" && e.status === "bleed"));
  if (siphon.length > 0 && curBleed >= 6) return makeAction(siphon[0]);
  if (siphon.length > 0 && curBleed >= 3 && run.hp <= run.maxHp * 0.5) return makeAction(siphon[0]);
  if (bleed.length > 0) return makeAction(bleed.sort((a,b)=>(b.card.effects.find(e=>e.status==="bleed")?.stacks||0)-(a.card.effects.find(e=>e.status==="bleed")?.stacks||0))[0]);
  if (run.hp <= run.maxHp * 0.3) { const b=hand.filter(h=>ok(h)&&h.card.effects.some(e=>e.type==="block")); if(b.length>0)return makeAction(b[0]); }
  return null;
}
function poisonAI(run, hand) {
  const ok = h => run.energy >= h.card.cost;
  const psn = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "status" && e.status === "poison"));
  const amp = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "amplifyDebuffs"));
  const curPsn = aliveEnemy(run)?.statuses?.find(s => s.id === "poison")?.stacks ?? 0;
  if (psn.length > 0) return makeAction(psn.sort((a,b)=>(b.card.effects.find(e=>e.status==="poison")?.stacks||0)-(a.card.effects.find(e=>e.status==="poison")?.stacks||0))[0]);
  if (amp.length > 0 && curPsn >= 8) return makeAction(amp[0]);
  if (run.hp <= run.maxHp * 0.3) { const b=hand.filter(h=>ok(h)&&h.card.effects.some(e=>e.type==="block")); if(b.length>0)return makeAction(b[0]); }
  return null;
}
function physicalAI(run, hand) {
  const ok = h => run.energy >= h.card.cost;
  const target = aliveEnemy(run);
  const exec = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "execute" || e.tmExecute));
  const dmg = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "damage"));
  if (exec.length > 0 && target && target.hp <= target.maxHp * 0.3) return makeAction(exec[0]);
  if (dmg.length > 0) return makeAction(dmg.sort((a,b)=>(b.card.effects.find(e=>e.type==="damage")?.value||0)-(a.card.effects.find(e=>e.type==="damage")?.value||0))[0]);
  return null;
}
function spellAI(run, hand) {
  const ok = h => run.energy >= h.card.cost;
  const mark = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "thunderMark"));
  const tm = aliveEnemy(run)?.statuses?.find(s => s.id === "thunderMark")?.stacks ?? 0;
  if (tm >= 6) { const d=hand.filter(h=>ok(h)&&h.card.effects.some(e=>e.type==="damage")); if(d.length>0)return makeAction(d[0]); }
  if (mark.length > 0) return makeAction(mark.sort((a,b)=>(b.card.effects.find(e=>e.type==="thunderMark")?.value||0)-(a.card.effects.find(e=>e.type==="thunderMark")?.value||0))[0]);
  return null;
}


