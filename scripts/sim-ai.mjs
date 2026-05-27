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
      s = reduceGame(s, combatAct(s, stepCombat));
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
function combatAct(s, stepC) {
  if (stepC > 200) return { type: "endTurn" }; // safety valve
  const run = s.run;
  const combat = run.combat;
  const hand = combat.hand.filter(inst => !(cards[inst.cardId]?.id === "meditate" && run.energy >= run.maxEnergy));
  const hpPct = run.hp / run.maxHp;
  const block = combat.block ?? 0;
  const enemies = combat.enemies.filter(e => e.hp > 0);
  const enemyDmg = estimateIncoming(run);

  // Discard pick
  if (run.pendingChoice?.type === "discardPick") {
    return handleDiscard(run);
  }

  // Can we kill an enemy this turn?
  const canKill = findKill(run, hand);
  if (canKill && hpPct > 0.2) return { type: "playCard", cardUid: canKill.uid, targetUid: null };

  // Low HP defense
  if (hpPct < 0.3 && block < enemyDmg) {
    const blockCard = findBest(run, hand, e => e.type === "block");
    if (blockCard) return { type: "playCard", cardUid: blockCard.uid, targetUid: null };
  }

  // Draw/energy always good
  const drawCard = findBest(run, hand, e => e.type === "draw" || e.type === "gainEnergy");
  if (drawCard && run.energy >= 2) return { type: "playCard", cardUid: drawCard.uid, targetUid: null };

  // Play sensible cards
  const playable = hand
    .map(inst => ({ inst, card: cards[inst.cardId] }))
    .filter(h => run.energy >= h.card.cost && (h.card.id !== "meditate" || run.energy < run.maxEnergy));

  if (playable.length === 0) return { type: "endTurn" };

  // Score each playable card
  playable.sort((a, b) => cardScore(run, b.card) - cardScore(run, a.card));
  const best = playable[0];
  if (cardScore(run, best.card) < 0 && hpPct > 0.5) return { type: "endTurn" };

  return { type: "playCard", cardUid: best.inst.uid, targetUid: null };
}

function cardScore(run, card) {
  let s = 0;
  const hpPct = run.hp / run.maxHp;
  const block = run.combat?.block ?? 0;
  

  // Damage: good, better when safe
  if (card.effects.some(e => e.type === "damage")) s += 20 + (hpPct > 0.5 ? 15 : -5);
  // Block: essential when low, still good otherwise
  if (card.effects.some(e => e.type === "block")) s += hpPct < 0.4 ? 50 : hpPct < 0.7 ? 30 : 10;
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
