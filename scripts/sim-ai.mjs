import { cards, relics as allRelics } from "../src/core/data.js";
import { createRunGoal, markSpecialGoalBaseline } from "../src/core/goals.js";
import { prepareRouteChoice } from "../src/core/nodes.js";
import { reduceGame } from "../src/core/reducer.js";
import { createInitialState, startRun } from "../src/core/state.js";
import { DIFFICULTY_REGULAR, DIFFICULTY_TRUE_MARTIAL } from "../src/core/types.js";

// ============ GAME CONSTANTS (must match src/core/effects.js) ============
const TM_POJUN_TRUE_DAMAGE = 9;

// ============ CLI ARGS ============
function parseArgs(argv) {
  const p = {};
  for (const a of argv) {
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const k = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      const v = eq >= 0 ? a.slice(eq + 1) : "true";
      p[k] = v;
    }
  }
  return p;
}

const args = parseArgs(process.argv.slice(2));
const RUNS = Math.max(1, Number(args.runs ?? 200));
const SEED_COUNT = Math.max(1, Number(args.seeds ?? 2));
const MODE = String(args.mode ?? "both");            // normal | regular | trueMartial | both
const STRATEGY = String(args.strategy ?? "styleAware"); // basic | styleAware
const JSON_OUT = args.json !== undefined;
const SINGLE_PROFILE = args.profile ?? null;         // optional single style
const SEED_BASE = Number(args.seedBase ?? 2026052700);

const STYLES = ["physical", "spell", "bleed", "shell", "poison", "control"];
const NAMES = { physical: "物理", spell: "法术", bleed: "流血", shell: "龟壳", poison: "中毒", control: "控制" };

// ============ SEED GENERATION (fully deterministic from seedBase) ============
const SEED_BASES = Array.from({ length: SEED_COUNT }, (_, i) => (SEED_BASE + i * 999983) >>> 0);
function genSeeds(styleIdx, totalRuns) {
  const seeds = [];
  const basePerSeed = Math.floor(totalRuns / SEED_COUNT);
  let remainder = totalRuns - basePerSeed * SEED_COUNT;
  for (let s = 0; s < SEED_COUNT; s++) {
    const count = basePerSeed + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    for (let i = 0; i < count; i++) {
      seeds.push((SEED_BASES[s] + styleIdx * 7919 + i * 92821) >>> 0);
    }
  }
  return seeds;
}

// ============ HELPERS ============
function hasTMRelic(run, id) { return run.trueMartial && (run.relics || []).includes(id); }
function aliveEnemy(run) { return run?.combat?.enemies?.find(e => e.hp > 0) ?? null; }
function mapHand(hand) { return hand.map(inst => ({ inst, card: cards[inst.cardId] })); }
function statusStacks(fighter, id) { return fighter?.statuses?.find(s => s.id === id)?.stacks ?? 0; }

// ============ SEEDED RUN SETUP ============
function seededRun(seed, tmStyle = null, difficulty = null) {
  // T0 guard: trueMartial requires explicit trueMartialStyle in tool layer
  if (difficulty === DIFFICULTY_TRUE_MARTIAL && !tmStyle) {
    throw new Error(
      "trueMartial requires explicit trueMartialStyle. " +
      "Must be one of: physical, spell, bleed, shell, poison, control"
    );
  }
  if (tmStyle && !STYLES.includes(tmStyle)) {
    throw new Error(
      `Invalid trueMartialStyle "${tmStyle}". ` +
      "Must be one of: physical, spell, bleed, shell, poison, control"
    );
  }
  // startRun internally uses Date.now() for seed, which would make
  // shopTiers and other derived state non-deterministic. Override
  // Date.now to return a deterministic timestamp from our seed,
  // then restore it after startRun completes.
  const origNow = Date.now;
  Date.now = () => (seed * 1000) >>> 0;
  try {
    const initial = createInitialState();
    const s = startRun(initial, tmStyle, difficulty);
    // Now restore Date.now and rebuild all seed-dependent state
    Date.now = origNow;
    s.run.seed = seed;
    s.run.goal = createRunGoal(seed);
    markSpecialGoalBaseline(s.run);
    // Clear shopTiers so prepareRouteChoice regenerates them with correct seed
    if (s.run.shopTiers) delete s.run.shopTiers;
    return prepareRouteChoice(s);
  } finally {
    Date.now = origNow;
  }
}

// ============ ROUTE / SHOP / REWARD (shared) ============
function pickRoute(run) {
  const c = run.nodeChoices ?? [];
  const shop = c.find(n => n.id === "shop_final" || n.type === "shop");
  const side = c.find(n => n.id === "side_final" || n.type === "side");
  const main = c.find(n => n.type === "main") ?? c[0];
  if (side && run.hp >= run.maxHp * 0.5) return side;
  if (shop && run.gold >= 30) return shop;
  return main;
}

function shopAct(s) {
  const run = s.run;
  const stock = (run.shopStock ?? []).filter(i => !i.sold);
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

function pickReward(s, profile = "balanced") {
  const run = s.run;
  const floor = run.floor;
  const rewards = run.rewards;
  const energyRel = rewards.find(r => r.type === "relic" && allRelics[r.value]?.effects?.some(e => e.type === "energy"));
  if (energyRel && run.maxEnergy < 4) return energyRel;
  const heal = rewards.find(r => r.type === "heal");
  if (heal && run.hp <= run.maxHp * 0.35) return heal;
  if (floor < 8) {
    const relic = rewards.find(r => r.type === "relic");
    if (relic) return relic;
    const gold = rewards.find(r => r.type === "gold");
    if (gold) return gold;
  }
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
  if (card.style === profile) s += 20;
  if (profile === "bleed" && card.effects.some(e => e.type === "status" && e.status === "bleed")) s += 28;
  if (profile === "bleed" && card.effects.some(e => e.type === "bleedSiphon")) s += 35;
  if (profile === "poison" && card.effects.some(e => e.type === "status" && e.status === "poison")) s += 28;
  if (profile === "spell" && card.effects.some(e => e.type === "thunderMark")) s += 34;
  if (profile === "physical" && card.effects.some(e => e.type === "execute")) s += 25;
  if (profile === "shell" && card.effects.some(e => e.type === "shellReflect")) s += 40;
  if (profile === "shell" && card.effects.some(e => e.type === "block")) s += 18;
  if (profile === "control" && card.effects.some(e => ["chaos","bind","stun","stasis"].includes(e.status))) s += 32;
  return s;
}

// ============ COMBAT: estimate ============
function estimateIncoming(run) {
  return (run.combat?.enemies || []).filter(e => e.hp > 0).reduce((s, e) => {
    const intent = e.nextIntent ?? { type: "attack", value: 6 };
    return s + (intent.type === "attack" ? intent.value : 0);
  }, 0);
}

function handleDiscard(run) {
  const pick = run.combat.discardPile.find(c => c.uid !== run.pendingChoice.sourceUid);
  return pick ? { type: "pickDiscardCard", cardUid: pick.uid } : { type: "cancelDiscardPick" };
}

// ============ COMBAT: find helpers ============
function findBest(run, hand, effectFilter) {
  const playable = hand.map(inst => ({ inst, card: cards[inst.cardId] }))
    .filter(h => run.energy >= h.card.cost && h.card.effects.some(effectFilter));
  if (playable.length === 0) return null;
  playable.sort((a, b) => {
    const va = b.card.effects.filter(effectFilter).reduce((s, e) => s + (e.value || e.stacks || 1), 0);
    const vb = a.card.effects.filter(effectFilter).reduce((s, e) => s + (e.value || e.stacks || 1), 0);
    return va - vb;
  });
  return playable[0].inst;
}

function findKill(run, hand) {
  const enemies = (run.combat?.enemies || []).filter(e => e.hp > 0);
  const lowest = enemies.sort((a, b) => a.hp - b.hp)[0];
  if (!lowest) return null;
  const isTM = run.trueMartial;
  const hasPoJun = isTM && hasTMRelic(run, "poJunLing");
  const trueDmg = hasPoJun ? TM_POJUN_TRUE_DAMAGE : 0;
  const dmgCards = hand.map(inst => ({ inst, card: cards[inst.cardId] }))
    .filter(h => run.energy >= h.card.cost && h.card.effects.some(e => e.type === "damage"));
  for (const h of dmgCards) {
    const rawDmg = h.card.effects.filter(e => e.type === "damage").reduce((s, e) => s + (e.value || 0), 0);
    const bonus = (h.card.style === "physical" && hasPoJun) ? trueDmg : 0;
    const totalDmg = rawDmg + bonus;
    const effectiveHp = lowest.hp + (hasPoJun && h.card.style === "physical" ? Math.max(0, lowest.block - trueDmg) : (lowest.block || 0));
    if (totalDmg >= effectiveHp) return h.inst;
  }
  const totalBlock = lowest.block || 0;
  if (lowest.hp + totalBlock <= 15 + trueDmg && dmgCards.length > 0) return dmgCards[0].inst;
  return null;
}

// ============================================================
//  STRATEGY: basic  (profile-agnostic, no TM relic awareness)
// ============================================================
function basicCardScore(run, card) {
  let s = 0;
  const hpPct = run.hp / run.maxHp;
  const block = run.combat?.block ?? 0;
  const nearKill = (run.combat?.enemies || []).some(e => e.hp > 0 && e.hp <= 15);
  if (card.effects.some(e => e.type === "damage")) { s += 20 + (nearKill ? 30 : 0); if (hpPct > 0.4) s += 15; }
  if (card.effects.some(e => e.type === "block")) {
    const needed = Math.max(0, estimateIncoming(run) - block);
    s += hpPct < 0.3 && needed > 0 ? 50 : hpPct < 0.5 ? 15 : 5;
  }
  if (card.effects.some(e => e.type === "draw" || e.type === "gainEnergy")) s += 35;
  if (card.effects.some(e => e.type === "shellReflect")) s += block > 10 ? 60 : 10;
  if (card.effects.some(e => e.type === "bleedSiphon")) s += 30;
  if (card.effects.some(e => e.type === "status")) s += 15;
  if (card.effects.some(e => e.type === "status" && e.status === "spikes")) s += 10;
  if (card.effects.some(e => e.type === "execute")) s += 35;
  if (card.effects.some(e => e.type === "doubleBlock")) s += block > 10 ? 55 : 20;
  if (card.effects.some(e => e.type === "thunderMark")) s += 25;
  if (card.effects.some(e => e.type === "loseHp")) s -= hpPct < 0.5 ? 80 : 15;
  if (card.cost >= 2 && run.maxEnergy < 4 && run.energy <= card.cost) s -= 20;
  return s;
}

function basicCombatAct(s, stepC) {
  if (stepC > 200) return { type: "endTurn" };
  const run = s.run;
  const combat = run.combat;
  const hand = combat.hand.filter(inst => !(cards[inst.cardId]?.id === "meditate" && run.energy >= run.maxEnergy));
  const hpPct = run.hp / run.maxHp;
  const block = combat.block ?? 0;
  const enemyDmg = estimateIncoming(run);

  if (run.pendingChoice?.type === "discardPick") return handleDiscard(run);

  const canKill = findKill(run, hand);
  if (canKill && hpPct > 0.2) return { type: "playCard", cardUid: canKill.uid, targetUid: null };

  if (hpPct < 0.3 && block < enemyDmg) {
    const blockCard = findBest(run, hand, e => e.type === "block");
    if (blockCard) return { type: "playCard", cardUid: blockCard.uid, targetUid: null };
  }

  const drawCard = findBest(run, hand, e => e.type === "draw" || e.type === "gainEnergy");
  if (drawCard && run.energy >= 2) return { type: "playCard", cardUid: drawCard.uid, targetUid: null };

  const playable = hand.map(inst => ({ inst, card: cards[inst.cardId] }))
    .filter(h => run.energy >= h.card.cost && (h.card.id !== "meditate" || run.energy < run.maxEnergy));
  if (playable.length === 0) return { type: "endTurn" };

  playable.sort((a, b) => basicCardScore(run, b.card) - basicCardScore(run, a.card));
  if (basicCardScore(run, playable[0].card) < 0 && hpPct > 0.5) return { type: "endTurn" };
  return { type: "playCard", cardUid: playable[0].inst.uid, targetUid: null };
}

// ================================================================
//  STRATEGY: styleAware  (profile-specific AI + TM relic awareness)
// ================================================================
function styleAwareCardScore(run, card, profile) {
  let s = basicCardScore(run, card);
  const isTM = run.trueMartial;
  const block = run.combat?.block ?? 0;
  const hpPct = run.hp / run.maxHp;

  // TM relic awareness
  if (card.style === "physical" && isTM && hasTMRelic(run, "poJunLing")) {
    if (card.effects.some(e => e.type === "damage")) s += 20;
  }
  if (isTM && hasTMRelic(run, "turtleShell")) {
    if (card.effects.some(e => e.type === "shellReflect")) s += 25;
    if (profile === "shell" && card.effects.some(e => e.type === "block")) s += 15;
  }
  if (isTM && hasTMRelic(run, "asuraHeart")) {
    if (card.effects.some(e => e.type === "bleedSiphon")) s += 35;
    if (card.effects.some(e => e.type === "loseHp") && card.effects.some(e => e.type === "bleedSiphon")) s += 30;
  }
  if (isTM && hasTMRelic(run, "nineSkyTribulation")) {
    const tmStacks = statusStacks(aliveEnemy(run), "thunderMark");
    if (card.effects.some(e => e.type === "thunderMark")) s += tmStacks >= 6 ? 50 : 20;
  }
  if (isTM && hasTMRelic(run, "venomScripture")) {
    if (card.effects.some(e => e.type === "status" && e.status === "poison")) s += 18;
  }

  // Profile synergy
  if (card.style === profile) s += 14;
  const e = card.effects;
  if (profile === "bleed" && e.some(f => f.type === "bleedSiphon")) s += 45;
  if (profile === "bleed" && e.some(f => f.type === "status" && f.status === "bleed")) s += 18;
  if (profile === "shell" && e.some(f => f.type === "shellReflect")) s += block > 12 ? 50 : 20;
  if (profile === "shell" && e.some(f => f.type === "block")) s += 10;
  if (profile === "poison" && e.some(f => f.type === "status" && f.status === "poison")) s += 22;
  if (profile === "poison" && e.some(f => f.type === "amplifyDebuffs")) s += 30;
  if (profile === "spell" && e.some(f => f.type === "thunderMark")) s += 35;
  if (profile === "control" && e.some(f => ["chaos","bind","stun","stasis"].includes(f.status))) s += 30;
  if (profile === "physical" && e.some(f => f.type === "execute")) s += 28;

  return s;
}

function makeAction(h) { return { type: "playCard", cardUid: h.inst.uid, targetUid: null }; }

// --- Profile-specific AIs ---
function bleedAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const curBleed = statusStacks(aliveEnemy(run), "bleed");
  const siphon = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "bleedSiphon"));
  const bleed = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "status" && e.status === "bleed"));
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
  const target = aliveEnemy(run);
  if (!target) return null;
  const curPsn = statusStacks(target, "poison");
  const hpPct = run.hp / run.maxHp;
  const enemyDmg = estimateIncoming(run);
  const block = run.combat?.block ?? 0;
  const hasVenom = hasTMRelic(run, "venomScripture");

  const psn = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "status" && e.status === "poison"));
  const burst = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "poisonBurst"));
  const amp = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "amplifyDebuffs"));
  const dmg = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "damage"));

  const venomMult = hasVenom ? 2 : 1;

  // 1) Enemy near death: finish with direct damage
  if (target.hp <= 10 && dmg.length > 0) return makeAction(dmg[0]);

  // 2) About to die: defend
  if (hpPct < 0.25 && block < enemyDmg) {
    const b = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "block"));
    if (b.length > 0) return makeAction(b.sort((a, b) => (b.card.effects.find(e => e.type === "block")?.value || 0) - (a.card.effects.find(e => e.type === "block")?.value || 0))[0]);
  }

  // 3) poisonBurst if it can kill right now
  if (burst.length > 0 && curPsn * venomMult >= target.hp + (target.block || 0)) return makeAction(burst[0]);

  // 4) poisonBurst if poison >= 12 (meaningful damage threshold)
  if (burst.length > 0 && curPsn >= 12) return makeAction(burst[0]);

  // 5) poison < 12: keep stacking
  if (curPsn < 12 && psn.length > 0) {
    return makeAction(psn.sort((a, b) => (b.card.effects.find(e => e.status === "poison")?.stacks || 0) - (a.card.effects.find(e => e.status === "poison")?.stacks || 0))[0]);
  }

  // 6) amplify when poison is decent
  if (amp.length > 0 && curPsn >= (hasVenom ? 5 : 8)) return makeAction(amp[0]);

  // 7) poison >= 18 without burst: switch to direct damage or defend
  if (curPsn >= 18 && dmg.length > 0) return makeAction(dmg[0]);

  // 8) Still have poison cards and under 18: stack more
  if (curPsn < 18 && psn.length > 0) return makeAction(psn[0]);

  // 9) Defense fallback
  if (hpPct < 0.3) {
    const b = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "block"));
    if (b.length > 0) return makeAction(b[0]);
  }
  return null;
}


function physicalAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const target = aliveEnemy(run);
  if (!target) return null;
  const hasPoJun = hasTMRelic(run, "poJunLing");
  const trueDmg = hasPoJun ? TM_POJUN_TRUE_DAMAGE : 0;
  const hpPct = run.hp / run.maxHp;
  const enemyDmg = estimateIncoming(run);
  const block = run.combat?.block ?? 0;
  const battleIntent = statusStacks({ statuses: run.statuses || [] }, "battleIntent");

  // 1) Can kill? Try execute first, then damage cards
  const exec = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "execute" || e.tmExecute));
  if (exec.length > 0 && target.hp <= target.maxHp * 0.35) return makeAction(exec[0]);

  const dmgCards = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "damage"));
  // killingIntent: highest priority when target < 25%
  const killingIntent = dmgCards.filter(h => h.card.id === "killingIntent" && target.hp <= target.maxHp * 0.25);
  if (killingIntent.length > 0) return makeAction(killingIntent[0]);

  // Check if we can kill with any damage card
  for (const h of dmgCards) {
    const rawDmg = h.card.effects.filter(e => e.type === "damage").reduce((s, e) => s + (e.value || 0), 0);
    const bonus = (h.card.style === "physical" && hasPoJun) ? trueDmg : 0;
    if (rawDmg + bonus >= target.hp + Math.max(0, target.block - (hasPoJun && h.card.style === "physical" ? trueDmg : 0))) {
      return makeAction(h);
    }
  }

  // 2) About to die? Defend
  if (hpPct < 0.25 && block < enemyDmg) {
    const b = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "block"));
    if (b.length > 0) return makeAction(b.sort((a, b) => (b.card.effects.find(e => e.type === "block")?.value || 0) - (a.card.effects.find(e => e.type === "block")?.value || 0))[0]);
  }

  // 3) readyStance: 0-cost battleIntent starter, prioritize if battleIntent low and we have damage cards
  const readyStance = hand.filter(h => ok(h) && h.card.id === "readyStance");
  if (readyStance.length > 0 && battleIntent < 5 && dmgCards.length >= 1) return makeAction(readyStance[0]);

  // 4) furySlash > normal strike (scores higher naturally, but explicit prioritization)
  const furySlash = dmgCards.filter(h => h.card.id === "furySlash");
  if (furySlash.length > 0) return makeAction(furySlash[0]);

  // 5) armorBreaker: higher priority when target < 50% HP
  const armorBreaker = dmgCards.filter(h => h.card.id === "armorBreaker" && target.hp <= target.maxHp * 0.5);
  if (armorBreaker.length > 0) return makeAction(armorBreaker[0]);

  // 6) General damage: prioritize by damage value + true damage bonus
  if (dmgCards.length > 0) {
    const sorted = dmgCards.sort((a, b) => {
      const va = (b.card.effects.find(e => e.type === "damage")?.value || 0) + (b.card.style === "physical" && hasPoJun ? trueDmg : 0);
      return va - (a.card.effects.find(e => e.type === "damage")?.value || 0) - (a.card.style === "physical" && hasPoJun ? trueDmg : 0);
    })[0];
    return makeAction(sorted);
  }

  // 7) Battle intent cards if no damage available
  const intent = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "status" && e.status === "battleIntent"));
  if (intent.length > 0) return makeAction(intent[0]);

  return null;
}

function spellAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const target = aliveEnemy(run);
  if (!target) return null;
  const tm = statusStacks(target, "thunderMark");
  const hpPct = run.hp / run.maxHp;
  const enemyDmg = estimateIncoming(run);
  const block = run.combat?.block ?? 0;
  const markCards = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "thunderMark"));

  // Thunder tribulation threshold is always 8.
  // nineSky only increases damage and stun, NOT the threshold.
  const THUNDER_THRESHOLD = 8;

  // 1) About to die: defend
  if (hpPct < 0.25 && block < enemyDmg) {
    const b = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "block"));
    if (b.length > 0) return makeAction(b.sort((a, b) => (b.card.effects.find(e => e.type === "block")?.value || 0) - (a.card.effects.find(e => e.type === "block")?.value || 0))[0]);
  }

  // 2) If current thunderMark + any mark card can reach threshold, prioritize that mark card
  if (markCards.length > 0) {
    for (const h of markCards) {
      const markVal = h.card.effects.find(e => e.type === "thunderMark")?.value || 0;
      if (tm + markVal >= THUNDER_THRESHOLD) return makeAction(h);
    }
  }

  // 3) Near threshold: push with any damage or mark
  const nearThreshold = THUNDER_THRESHOLD - 2;
  if (tm >= nearThreshold) {
    const pushers = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "damage" || e.type === "thunderMark"));
    if (pushers.length > 0) {
      return makeAction(pushers.sort((a, b) =>
        (b.card.effects.find(e => e.type === "thunderMark")?.value || 0) -
        (a.card.effects.find(e => e.type === "thunderMark")?.value || 0)
      )[0]);
    }
  }

  // 4) Stack marks if not near threshold
  if (markCards.length > 0) {
    return makeAction(markCards.sort((a, b) =>
      (b.card.effects.find(e => e.type === "thunderMark")?.value || 0) -
      (a.card.effects.find(e => e.type === "thunderMark")?.value || 0)
    )[0]);
  }

  // 5) Low HP defense
  if (hpPct < 0.25) {
    const b = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "block"));
    if (b.length > 0) return makeAction(b[0]);
  }
  return null;
}

function shellAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const block = run.combat?.block ?? 0;
  const hpPct = run.hp / run.maxHp;
  const enemyDmg = estimateIncoming(run);
  const hasTurtle = hasTMRelic(run, "turtleShell");
  const reflect = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "shellReflect"));
  const blockCards = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "block"));
  const spikes = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "status" && e.status === "spikes"));

  // turtleShell gives +10% reflect (1.1x), not 2x
  const reflectMult = hasTurtle ? 1.1 : 1.0;

  // 1) About to die: prioritize defense
  if (hpPct < 0.25 && block < enemyDmg) {
    if (blockCards.length > 0) return makeAction(blockCards.sort((a, b) =>
      (b.card.effects.find(e => e.type === "block")?.value || 0) -
      (a.card.effects.find(e => e.type === "block")?.value || 0)
    )[0]);
  }

  // 2) Reflect when block is high enough (threshold reflects 1.1x)
  const reflectThreshold = hasTurtle ? 12 : 16;
  if (reflect.length > 0 && block >= reflectThreshold) return makeAction(reflect[0]);

  // 3) Stack block if low or threatened
  if (blockCards.length > 0 && (block < 18 || hpPct < 0.4)) {
    return makeAction(blockCards.sort((a, b) =>
      (b.card.effects.find(e => e.type === "block")?.value || 0) -
      (a.card.effects.find(e => e.type === "block")?.value || 0)
    )[0]);
  }

  // 4) Spikes for passive damage
  if (spikes.length > 0 && block >= 10) return makeAction(spikes[0]);

  // 5) Reflect if any block at all
  if (reflect.length > 0 && block >= 6) return makeAction(reflect[0]);

  // 6) Fallback defense
  if (blockCards.length > 0) return makeAction(blockCards[0]);

  return null;
}

function controlAI(run, hand) {
  hand = mapHand(hand);
  const ok = h => run.energy >= h.card.cost;
  const target = aliveEnemy(run);
  const controlPressure = (target?.statuses || []).reduce((s, st) => {
    if (["chaos","bind","stun","stasis"].includes(st.id)) return s + (st.stacks || 0);
    return s;
  }, 0);
  const control = hand.filter(h => ok(h) && h.card.effects.some(e => ["chaos","bind","stun","stasis"].includes(e.status)));
  const dmg = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "damage"));
  if (controlPressure >= 5 && dmg.length > 0) return makeAction(dmg.sort((a,b)=>(b.card.effects.find(e=>e.type==="damage")?.value||0)-(a.card.effects.find(e=>e.type==="damage")?.value||0))[0]);
  if (control.length > 0 && controlPressure < 4) return makeAction(control[0]);
  if (dmg.length > 0) return makeAction(dmg[0]);
  if (control.length > 0) return makeAction(control[0]);
  if (run.hp <= run.maxHp * 0.3) { const b=hand.filter(h=>ok(h)&&h.card.effects.some(e=>e.type==="block")); if(b.length>0)return makeAction(b[0]); }
  return null;
}

function styleAwareCombatAct(s, stepC, profile = "balanced") {
  if (stepC > 200) return { type: "endTurn" };
  const run = s.run;
  const combat = run.combat;
  const hand = combat.hand.filter(inst => !(cards[inst.cardId]?.id === "meditate" && run.energy >= run.maxEnergy));
  const hpPct = run.hp / run.maxHp;
  const block = combat.block ?? 0;
  const enemyDmg = estimateIncoming(run);
  const isTM = run.trueMartial;

  // 1) pendingChoice
  if (run.pendingChoice?.type === "discardPick") return handleDiscard(run);

  // 2) Can kill any enemy?
  const canKill = findKill(run, hand);
  if (canKill && hpPct > 0.12) return { type: "playCard", cardUid: canKill.uid, targetUid: null };

  // 3) Lethal threat: defend/heal first
  if (hpPct < 0.25 && block < enemyDmg) {
    const blockCard = findBest(run, hand, e => e.type === "block");
    if (blockCard) return { type: "playCard", cardUid: blockCard.uid, targetUid: null };
    const healCard = findBest(run, hand, e => e.type === "heal");
    if (healCard) return { type: "playCard", cardUid: healCard.uid, targetUid: null };
  }

  // 4) Try profile-specific AI (each now handles its own priority internally)
  if (isTM && profile !== "balanced") {
    let profileAct = null;
    if (profile === "bleed") profileAct = bleedAI(run, hand);
    else if (profile === "poison") profileAct = poisonAI(run, hand);
    else if (profile === "physical") profileAct = physicalAI(run, hand);
    else if (profile === "spell") profileAct = spellAI(run, hand);
    else if (profile === "shell") profileAct = shellAI(run, hand);
    else if (profile === "control") profileAct = controlAI(run, hand);
    if (profileAct) return profileAct;
  }

  // 5) Draw/energy: positive value when energy to spare
  const drawCard = findBest(run, hand, e => e.type === "draw" || e.type === "gainEnergy");
  if (drawCard && run.energy >= 2) return { type: "playCard", cardUid: drawCard.uid, targetUid: null };

  // 6) Scored fallback: play best card, or endTurn if nothing good
  const playable = hand.map(inst => ({ inst, card: cards[inst.cardId] }))
    .filter(h => run.energy >= h.card.cost && (h.card.id !== "meditate" || run.energy < run.maxEnergy));
  if (playable.length === 0) return { type: "endTurn" };

  playable.sort((a, b) => styleAwareCardScore(run, b.card, profile) - styleAwareCardScore(run, a.card, profile));
  const best = playable[0];
  if (styleAwareCardScore(run, best.card, profile) < -20 && hpPct > 0.4) return { type: "endTurn" };
  return { type: "playCard", cardUid: best.inst.uid, targetUid: null };
}

// ============ MAIN RUN LOOP ============
function pickPurgeCardAI(run) {
  const purge = run.pendingPurge;
  if (!purge) return null;
  let filter = typeof purge === "object" ? (purge.filter || "any") : String(purge || "any");
  const deck = run.deck;
  if (deck.length <= 8) return null;
  const basicIds = ["strike", "guard", "yellowCharm", "meditate"];
  const purgeable = deck.filter(c => {
    const def = cards[c.cardId];
    if (!def) return false;
    if (def.undeletable || def.isCurse) return false;
    if (filter === "basic" && !basicIds.includes(c.cardId)) return false;
    return true;
  });
  if (purgeable.length === 0) return null;
  // Prioritize basic cards
  purgeable.sort((a, b) => {
    const aBasic = basicIds.includes(a.cardId) ? 0 : 1;
    const bBasic = basicIds.includes(b.cardId) ? 0 : 1;
    return aBasic - bBasic;
  });
  return purgeable[0].uid;
}

function runOne(seed, profile, trueMartial, strategy, difficulty = null) {
  let s = seededRun(seed, trueMartial ? profile : null, difficulty);
  let steps = 0;
  let stepCombat = 0;

  while (s.phase !== "gameOver" && steps < 5000) {
    steps++;
    if (s.phase === "combat") stepCombat++;
    else stepCombat = 0;

    // Handle pendingPurge (blocks all other actions)
    if (s.run?.pendingPurge) {
      const cardUid = pickPurgeCardAI(s.run);
      // CQA-P2-001: dispatch even when null — reducer handles safe exit
      s = reduceGame(s, { type: "confirmPurge", cardUid: cardUid || null });
      continue;
    }

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
      const act = strategy === "basic"
        ? basicCombatAct(s, stepCombat)
        : styleAwareCombatAct(s, stepCombat, profile);
      s = reduceGame(s, act);
    }
  }
  // V1.8.2: timeout — return timedOut marker, don't pollute win rate
  if (steps >= 5000 && s.phase !== "gameOver") {
    return {
      floor: s.run?.floor ?? 0,
      won: false,
      timedOut: true,
      deck: s.run?.deck.length ?? 0,
      relics: s.run?.relics.length ?? 0,
      energy: s.run?.maxEnergy ?? 3,
      hp: s.run?.hp ?? 0,
      phase: s.phase,
      pendingPurge: Boolean(s.run?.pendingPurge),
      seed: s.run?.seed,
      profile,
    };
  }
  // V1.8: validate terminal state consistency (enhanced)
  assertTerminalState(s, steps);
  return {
    floor: s.run?.floor ?? 0,
    won: isVictory(s.run),
    timedOut: false,
    deck: s.run?.deck.length ?? 0,
    relics: s.run?.relics.length ?? 0,
    energy: s.run?.maxEnergy ?? 3,
    hp: s.run?.hp ?? 0,
  };
}

// V1.8: Only boss/special count as victory
function isVictory(run) {
  const cb = run?.goal?.completedBy;
  return cb === "boss" || cb === "special";
}

// V1.8: Terminal state consistency check (enhanced)
function assertTerminalState(state, steps) {
  const run = state.run;
  if (!run) return;
  const completedBy = run.goal?.completedBy;
  const hasCompletedBy = Boolean(completedBy);
  const validVictory = completedBy === "boss" || completedBy === "special";

  if (hasCompletedBy && !validVictory) {
    throw new Error(`Terminal: invalid completedBy="${completedBy}" (steps=${steps})`);
  }
  if (state.phase === "gameOver" && run.finished !== true) {
    throw new Error(`Terminal: phase=gameOver but run.finished is not true (steps=${steps})`);
  }
  if (validVictory && state.phase !== "gameOver") {
    throw new Error(`Terminal: valid completedBy="${completedBy}" but phase="${state.phase}" (steps=${steps})`);
  }
  if (validVictory && run.finished !== true) {
    throw new Error(`Terminal: valid completedBy exists but run.finished is not true (steps=${steps})`);
  }
}

// ============ BATCH RUNNER ============
function runBatch(profiles, trueMartial, strategy, difficulty = null) {
  const modeLabel = trueMartial ? "trueMartial" : (difficulty === "regular" ? "regular" : "normal");
  // runsPerSeed removed; genSeeds now takes totalRuns directly
  const results = [];

  for (const profile of profiles) {
    let wins = 0, losses = 0, timeouts = 0, floors = 0, decks = 0, relics = 0, energy = 0;
    const deathFloors = [];
    const timeoutSamples = [];
    const seeds = genSeeds(STYLES.indexOf(profile), RUNS);

    for (const seed of seeds) {
      const r = runOne(seed, profile, trueMartial, strategy, difficulty);
      if (r.timedOut) {
        timeouts++;
        if (timeoutSamples.length < 3) timeoutSamples.push({ seed, floor: r.floor, phase: r.phase, pendingPurge: r.pendingPurge });
      } else if (r.won) {
        wins++;
      } else {
        losses++;
        deathFloors.push(r.floor);
      }
      floors += r.floor;
      decks += r.deck;
      relics += r.relics;
      energy += r.energy;
    }

    const total = seeds.length;
    const effective = wins + losses;
    const early = deathFloors.filter(f => f <= 6).length;
    const mid = deathFloors.filter(f => f >= 7 && f <= 12).length;
    const late = deathFloors.filter(f => f >= 13).length;

    results.push({
      profile,
      mode: modeLabel,
      strategy,
      runs: total,
      effectiveRuns: effective,
      timeouts,
      timeoutSamples: timeoutSamples.length > 0 ? timeoutSamples : undefined,
      seeds: SEED_COUNT,
      seedBase: SEED_BASE,
      winRate: effective > 0 ? wins / effective : 0,
      avgFloor: floors / total,
      avgDeckSize: decks / total,
      avgRelics: relics / total,
      avgEnergy: energy / total,
      deathFloorDistribution: { early, mid, late },
    });
  }
  return results;
}

// ============ OUTPUT ============
function printTable(allResults) {
  for (const group of allResults) {
    console.log(`\n=== ${group.mode} / strategy=${group.strategy} ===  (${group.results[0].runs}局/流派, ${group.results[0].seeds} seed, seedBase=${SEED_BASE})`);
    let hasTimeouts = false;
    for (const r of group.results) { if (r.timeouts > 0) hasTimeouts = true; }
    if (hasTimeouts) {
      console.log("⚠  timeouts detected (excluded from win-rate denominator)");
      for (const r of group.results) {
        if (r.timeouts > 0) {
          const samples = (r.timeoutSamples || []).map(s => `seed=${s.seed} floor=${s.floor}`).join(", ");
          console.log(`   ${NAMES[r.profile]}: ${r.timeouts} timeouts (${samples})`);
        }
      }
    }
    console.log("流派      通关%   均层   均牌组  均遗物  均能量  失败分布(早/中/晚)");
    console.log("─".repeat(65));
    for (const r of group.results) {
      const d = r.deathFloorDistribution;
      const distStr = (r.runs - Math.round(r.winRate * r.runs)) > 0
        ? `早${d.early}中${d.mid}晚${d.late}` : "-";
      console.log(
        NAMES[r.profile].padEnd(6),
        `${(r.winRate * 100).toFixed(1)}%`.padStart(6),
        r.avgFloor.toFixed(1).padStart(5),
        r.avgDeckSize.toFixed(0).padStart(5),
        r.avgRelics.toFixed(1).padStart(5),
        r.avgEnergy.toFixed(1).padStart(5),
        `  ${distStr}`
      );
    }
  }
}

function printJSON(allResults) {
  const flat = [];
  for (const group of allResults) {
    for (const r of group.results) {
      const wins = Math.round(r.winRate * r.effectiveRuns);
      flat.push({
        profile: r.profile,
        mode: r.mode,
        strategy: r.strategy,
        runs: r.runs,
        totalRuns: r.runs,
        effectiveRuns: r.effectiveRuns,
        seeds: r.seeds,
        seedBase: r.seedBase,
        wins,
        winRate: Number(r.winRate.toFixed(4)),
        avgFloor: Number(r.avgFloor.toFixed(2)),
        avgDeckSize: Number(r.avgDeckSize.toFixed(1)),
        avgRelics: Number(r.avgRelics.toFixed(1)),
        avgEnergy: Number(r.avgEnergy.toFixed(1)),
        deathFloorDistribution: r.deathFloorDistribution,
        timeouts: r.timeouts || 0,
        timeoutRate: r.timeouts > 0 ? Number((r.timeouts / r.runs).toFixed(4)) : 0,
        timeoutSamples: r.timeoutSamples || [],
        errors: [],
        simErrors: [],
      });
    }
  }
  console.log(JSON.stringify(flat, null, 2));
}

// ============ MAIN ============
const profiles = SINGLE_PROFILE ? [SINGLE_PROFILE] : STYLES;
const allResults = [];

if (MODE === "normal" || MODE === "both") {
  allResults.push({ mode: "normal", strategy: STRATEGY, results: runBatch(profiles, false, STRATEGY) });
}
if (MODE === "regular" || MODE === "both") {
  allResults.push({ mode: "regular", strategy: STRATEGY, results: runBatch(profiles, false, STRATEGY, DIFFICULTY_REGULAR) });
}
if (MODE === "trueMartial" || MODE === "both") {
  allResults.push({ mode: "trueMartial", strategy: STRATEGY, results: runBatch(profiles, true, STRATEGY) });
}

if (JSON_OUT) {
  printJSON(allResults);
} else {
  printTable(allResults);
}
