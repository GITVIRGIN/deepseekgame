import fs from "fs";
import path from "path";
import { cards, relics as allRelics } from "../src/core/data.js";
import { pathToFileURL } from "url";
import { createRunGoal, markSpecialGoalBaseline } from "../src/core/goals.js";
import { prepareRouteChoice } from "../src/core/nodes.js";
import { reduceGame } from "../src/core/reducer.js";
import { createInitialState, startRun } from "../src/core/state.js";
import { DIFFICULTY_REGULAR, DIFFICULTY_TRUE_MARTIAL } from "../src/core/types.js";
import {
  bridgeStyles,
  canonicalFusionKey,
  deckStyleScores,
  eligibleDualRouteCards,
  eligibleHeavenlyTriggers,
  fusionRouteProgress,
  masteredFusionRoutes,
} from "../src/core/archetypes.js";

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
const NAMES = { physical: "physical", spell: "spell", bleed: "bleed", shell: "turtle/shell", poison: "poison", control: "control" };

const RAW_OUT = args.rawOut ?? null;
const controlCardsPerTurnCap = 4;
const noProgressActionCap = 6;
const CONTROL_STATUS_IDS = new Set(["chaos", "bind", "stun", "stasis"]);
const PROGRESS_EFFECT_TYPES = new Set([
  "damage",
  "execute",
  "poisonBurst",
  "bleedSiphon",
  "thunderMark",
  "burn",
  "directAttack",
  "scalingDamage",
  "finisher",
  "spikeBurst",
  "shellReflect",
]);
const PROGRESS_STATUS_IDS = new Set(["poison", "bleed", "thunderMark", "burn"]);
const TIMEOUT_REASONS = new Set([
  "stepLimit5000",
  "singleTurnCombatLoop",
  "controlNoProgress",
  "repeatedStateSignature",
  "endTurnNoOpLoop",
  "unknownPendingChoice",
  "unknown",
]);
const endTurnNoOpCap = 8;
const rawOutputRows = [];

// ============ SEED GENERATION (fully deterministic from seedBase) ============
const SEED_BASES = Array.from({ length: SEED_COUNT }, (_, i) => (SEED_BASE + i * 999983) >>> 0);
function genSeedRecords(styleIdx, totalRuns) {
  const records = [];
  const basePerSeed = Math.floor(totalRuns / SEED_COUNT);
  let remainder = totalRuns - basePerSeed * SEED_COUNT;
  for (let seedGroup = 0; seedGroup < SEED_COUNT; seedGroup++) {
    const count = basePerSeed + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    for (let runIndex = 0; runIndex < count; runIndex++) {
      records.push({
        seed: (SEED_BASES[seedGroup] + styleIdx * 7919 + runIndex * 92821) >>> 0,
        seedGroup,
        runIndex,
      });
    }
  }
  return records;
}

function genSeeds(styleIdx, totalRuns) {
  return genSeedRecords(styleIdx, totalRuns).map((record) => record.seed);
}

// ============ HELPERS ============
function hasTMRelic(run, id) { return run.trueMartial && (run.relics || []).includes(id); }
function aliveEnemy(run) { return run?.combat?.enemies?.find(e => e.hp > 0) ?? null; }
function mapHand(hand) { return hand.map(inst => ({ inst, card: cards[inst.cardId] })); }
function statusStacks(fighter, id) { return fighter?.statuses?.find(s => s.id === id)?.stacks ?? 0; }

function displayStyle(profile) {
  return profile === "shell" ? "turtle/shell" : profile;
}

function cardHasProgressEffect(card) {
  return (card?.effects || []).some((effect) => {
    if (PROGRESS_EFFECT_TYPES.has(effect.type)) return true;
    return effect.type === "status" && PROGRESS_STATUS_IDS.has(effect.status);
  });
}

function isPureControlCard(card) {
  const effects = card?.effects || [];
  return effects.some((effect) => effect.type === "status" && CONTROL_STATUS_IDS.has(effect.status))
    && !effects.some((effect) => {
      if (PROGRESS_EFFECT_TYPES.has(effect.type)) return true;
      return effect.type === "status" && PROGRESS_STATUS_IDS.has(effect.status);
    });
}

function enemyIsControlled(run) {
  return (run?.combat?.enemies || []).some((enemy) => {
    if (enemy.hp <= 0) return false;
    return (enemy.statuses || []).some((status) => CONTROL_STATUS_IDS.has(status.id) && (status.stacks || 0) > 0);
  });
}

function pickProgressCard(run, playable, scoreFn) {
  const progress = playable.filter((item) => cardHasProgressEffect(item.card));
  if (!progress.length) return null;
  return progress
    .sort((a, b) => scoreFn(run, b.card) - scoreFn(run, a.card))[0];
}

function ensureRcState(combat) {
  if (!combat._rcs || combat._rcs.turn !== (combat.turn || 0)) {
    combat._rcs = {
      turn: combat.turn || 0,
      cardsPlayed: 0,
      ctrlCards: 0,
      controlCardsPerTurnCap,
      noProgressActionCap,
      noProgressActions: 0,
      sigs: [],
      aggressive: false,
      noDmgTurns: combat._rcs?.noDmgTurns || 0,
      lastEhp: combat._rcs?.lastEhp ?? null,
    };
    const curEhp = (combat.enemies || []).reduce((sum, enemy) => sum + Math.max(0, enemy.hp), 0);
    if (combat._rcs.lastEhp !== null && curEhp >= combat._rcs.lastEhp) combat._rcs.noDmgTurns++;
    else if (combat._rcs.lastEhp !== null && curEhp < combat._rcs.lastEhp) combat._rcs.noDmgTurns = 0;
    combat._rcs.lastEhp = curEhp;
  }
  combat._rcs.controlCardsPerTurnCap = controlCardsPerTurnCap;
  combat._rcs.noProgressActionCap = noProgressActionCap;
  combat._rcs.noProgressActions = combat._rcs.noProgressActions || 0;
  return combat._rcs;
}

function stateSignature(run, combat) {
  return [
    run.hp,
    combat.block || 0,
    run.energy,
    (combat.hand || []).map((item) => item.cardId).sort().join(","),
    (combat.drawPile || []).length,
    (combat.discardPile || []).length,
    (combat.enemies || []).map((enemy) => `${enemy.uid}:${enemy.hp}:${enemy.block || 0}`).join(","),
    (combat.enemies || []).flatMap((enemy) => (enemy.statuses || []).map((status) => `${enemy.uid}:${status.id}:${status.stacks}`)).join(","),
    combat.turn,
  ].join("|");
}

function statusValue(fighter, id) {
  return statusStacks(fighter, id);
}

function stateProgressSignature(state) {
  const run = state?.run ?? {};
  const combat = run.combat ?? {};
  const enemies = (combat.enemies || []).map((enemy) => ({
    uid: enemy.uid,
    id: enemy.id ?? enemy.uid,
    hp: enemy.hp ?? 0,
    block: enemy.block ?? 0,
    poison: statusValue(enemy, "poison"),
    bleed: statusValue(enemy, "bleed"),
    thunderMark: statusValue(enemy, "thunderMark"),
    burn: statusValue(enemy, "burn"),
    stun: statusValue(enemy, "stun"),
    weak: statusValue(enemy, "weak"),
    vulnerable: statusValue(enemy, "vulnerable"),
    alive: (enemy.hp ?? 0) > 0,
  }));
  return JSON.stringify({
    phase: state?.phase ?? null,
    floor: run.floor ?? null,
    combatTurn: combat.turn ?? null,
    combatRound: combat.round ?? null,
    combatActionCounter: combat.actionCounter ?? null,
    pendingChoiceType: pendingChoiceType(run),
    playerHp: run.hp ?? null,
    playerBlock: combat.block ?? 0,
    playerEnergy: run.energy ?? null,
    handCardIds: (combat.hand || []).map((item) => item.cardId),
    drawPileSize: (combat.drawPile || []).length,
    discardPileSize: (combat.discardPile || []).length,
    exhaustPileSize: (combat.exhaustPile || []).length,
    enemyIds: enemies.map((enemy) => enemy.id),
    enemies,
    combatLogLength: (combat.log || []).length,
  });
}

function combatProgressSnapshot(run) {
  const combat = run?.combat;
  if (!combat) return null;
  const enemyRows = (combat.enemies || []).map((enemy) => ({
    uid: enemy.uid,
    hp: Math.max(0, enemy.hp || 0),
    block: enemy.block || 0,
    alive: enemy.hp > 0,
    poison: statusStacks(enemy, "poison"),
    bleed: statusStacks(enemy, "bleed"),
    thunderMark: statusStacks(enemy, "thunderMark"),
    burn: statusStacks(enemy, "burn"),
  }));
  const countProgress = (pile) => (pile || []).filter((inst) => cardHasProgressEffect(cards[inst.cardId])).length;
  return {
    energy: run.energy || 0,
    handProgress: countProgress(combat.hand),
    drawProgress: countProgress(combat.drawPile),
    discardProgress: countProgress(combat.discardPile),
    enemyHp: enemyRows.reduce((sum, enemy) => sum + enemy.hp, 0),
    enemyBlock: enemyRows.reduce((sum, enemy) => sum + enemy.block, 0),
    enemyAlive: enemyRows.filter((enemy) => enemy.alive).length,
    poison: enemyRows.reduce((sum, enemy) => sum + enemy.poison, 0),
    bleed: enemyRows.reduce((sum, enemy) => sum + enemy.bleed, 0),
    thunderMark: enemyRows.reduce((sum, enemy) => sum + enemy.thunderMark, 0),
    burn: enemyRows.reduce((sum, enemy) => sum + enemy.burn, 0),
  };
}

function actionMadeProgress(before, after, action, card) {
  if (!before || !after || action?.type !== "playCard") return true;
  if (after.enemyAlive < before.enemyAlive) return true;
  if (after.enemyHp < before.enemyHp) return true;
  if (after.poison !== before.poison) return true;
  if (after.bleed !== before.bleed) return true;
  if (after.thunderMark !== before.thunderMark) return true;
  if (after.burn !== before.burn) return true;
  if (after.enemyBlock < before.enemyBlock) return true;
  if (after.handProgress > before.handProgress) return true;
  if (after.drawProgress > before.drawProgress) return true;
  if (after.discardProgress > before.discardProgress) return true;
  return before.energy > after.energy && cardHasProgressEffect(card);
}

function rememberAction(history, beforeState, afterState, action, steps, stepCombat, beforeSignature, afterSignature) {
  const changed = beforeSignature !== afterSignature;
  const pendingChoiceBefore = pendingChoiceType(beforeState.run);
  const pendingChoiceAfter = pendingChoiceType(afterState.run);
  const card = action?.cardUid
    ? (beforeState.run?.combat?.hand || []).find((item) => item.uid === action.cardUid)
    : null;
  const cardDef = card ? cards[card.cardId] : null;
  history.push({
    globalStep: steps,
    step: steps,
    stepCombat,
    phase: beforeState.phase,
    floor: beforeState.run?.floor ?? null,
    turn: beforeState.run?.combat?.turn ?? null,
    energy: beforeState.run?.energy ?? null,
    actionType: action?.type ?? "unknown",
    action: action?.type ?? "unknown",
    cardUid: action?.cardUid ?? null,
    cardId: cardDef?.id ?? card?.cardId ?? null,
    cardName: cardDef?.name ?? null,
    simReason: action?.simReason ?? null,
    reason: action?.simReason ?? null,
    beforeSignature,
    afterSignature,
    changed,
    pendingChoiceBefore,
    pendingChoiceAfter,
    pendingChoiceType: action?.pendingChoiceType ?? pendingChoiceBefore ?? pendingChoiceAfter ?? null,
  });
  while (history.length > 20) history.shift();
  return history[history.length - 1];
}

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
  if (run.hp <= run.maxHp * 0.35) {
    const survival = rewards
      .filter((r) => r.type === "card" && isHealOrSurvivalCard(cards[r.value]))
      .sort((a, b) => rewardScore(run, b, profile) - rewardScore(run, a, profile))[0];
    if (survival) return survival;
  }
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
  if (run.hp <= run.maxHp * 0.35 && isHealOrSurvivalCard(card)) return 260;
  let s = 5;
  const scores = deckStyleScores(run, cards);
  const ownedCardIds = new Set((run.deck || []).map((inst) => inst.cardId));
  const floor = run.floor ?? 1;

  // T2-A5: Heavenly trigger cards
  if (card.heavenlyTrigger && card.triggerTripleCardId) {
    const eligible = eligibleHeavenlyTriggers(run, cards);
    const isEligible = eligible.some((t) => t.id === card.id);
    if (!isEligible) return -999;
    s += 480;
    if (floor >= 19) s += 100;
    const alreadyHas = (run.deck || []).some((inst) => inst.cardId === card.triggerTripleCardId);
    if (!alreadyHas) s += 100;
    else return -200;
    if (run.hp <= run.maxHp * 0.35) s -= 80;
    return s;
  }

  // T2-A3: Triple fusion (should not appear as direct reward)
  if (card.fusionTier === 3 && !card.heavenlyTrigger) {
    return -999;
  }

  if (card.fusionTier === 2) {
    const progress = fusionRouteProgress(run, cards);
    const route = progress[card.fusionRoute];
    const eligible = new Set(eligibleDualRouteCards(run, cards).map((routeCard) => routeCard.id));
    if (!eligible.has(card.id)) return -999;

    if (run.hp <= run.maxHp * 0.35) s -= 60;

    const stage = card.fusionStage;
    if (stage === "base") {
      if ((route?.routeCardCount ?? 0) === 0) s += 90;
      if (floor <= 6) s += 35;
      if (route?.hasBase) s -= 25;
    } else if (stage === "commit") {
      if (!route?.hasBase) return -999;
      s += 110;
      if (route.routeCardCount === 1) s += 60;
    } else if (stage === "formed") {
      if (!route?.hasBase || route.routeCardCount < 2) return -999;
      s += 150;
      if (route.routeCardCount === 2) s += 70;
    } else if (stage === "highrollA" || stage === "highrollB") {
      if (!route?.hasBase || !route?.hasFormed || route.routeCardCount < 3) return -999;
      s += 190;
      if (route.routeCardCount === 3) s += 80;
      if (route.routeCardCount === 4) s += 70;
    } else if (stage === "mastery") {
      if (!route?.hasBase || !route?.hasFormed || route.routeCardCount < 4) return -999;
      s += 270;
      if (route.routeCardCount === 4) s += 80;
      if (route.routeCardCount >= 5) s += 150;
      if (!route.hasHighrollA && !route.hasHighrollB && route.routeCardCount === 4) s -= 80;
    }

    // T2-A5 extra route weights
    if (route?.hasMastery && route.routeCardCount < 6 && card.fusionRoute === route.routeKey) s += 240;
    if (route?.routeCardCount >= 5 && !route?.hasMastery && stage === "mastery") s += 160;
    if (card.fusionStyles?.includes(profile)) s += 40;
    if ((card.fusionStyles || []).every((style) => (scores[style] ?? 0) >= 7)) s += 25;
    if (card.fusionStyles?.includes("control")) s -= 20;
    if (ownedCardIds.has(card.id)) s -= 5;
    return s;
  }

  if (card.trueMartial && !card.fusionStyles && !card.heavenlyTrigger) {
    if (card.style === profile) s += 35;
    if (bridgeStyles(profile).includes(card.style)) s += 20;
    if (profile === "poison" && card.style === "poison" && run.floor <= 12) s += 20;
  }

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

function isHealOrSurvivalCard(card) {
  return Boolean(card?.effects?.some((effect) => (
    effect.type === "heal" ||
    effect.type === "block" ||
    effect.type === "cleanse" ||
    effect.type === "doubleBlock" ||
    effect.type === "shellReflect"
  )));
}

// ============ COMBAT: estimate ============
function estimateIncoming(run) {
  return (run.combat?.enemies || []).filter(e => e.hp > 0).reduce((s, e) => {
    const intent = e.nextIntent ?? { type: "attack", value: 6 };
    return s + (intent.type === "attack" ? intent.value : 0);
  }, 0);
}

function cardInstanceScore(run, cardInstance, profile = "balanced") {
  const card = cards[cardInstance?.cardId];
  if (!card) return -999;
  return Math.max(basicCardScore(run, card), styleAwareCardScore(run, card, profile));
}

function lowValueCardUid(run, cardInstances, profile = "balanced") {
  const basicIds = new Set(["strike", "guard", "yellowCharm", "meditate"]);
  const ranked = [...(cardInstances || [])]
    .filter((inst) => cards[inst.cardId])
    .sort((a, b) => {
      const ac = cards[a.cardId];
      const bc = cards[b.cardId];
      const aBasic = basicIds.has(a.cardId) ? -200 : 0;
      const bBasic = basicIds.has(b.cardId) ? -200 : 0;
      const aProfile = ac.style === profile || cardHasProgressEffect(ac) ? 50 : 0;
      const bProfile = bc.style === profile || cardHasProgressEffect(bc) ? 50 : 0;
      return (aBasic + aProfile + cardInstanceScore(run, a, profile)) - (bBasic + bProfile + cardInstanceScore(run, b, profile));
    });
  return ranked[0]?.uid ?? null;
}

function highValueCardUid(run, cardInstances, profile = "balanced") {
  const ranked = [...(cardInstances || [])]
    .filter((inst) => cards[inst.cardId])
    .sort((a, b) => cardInstanceScore(run, b, profile) - cardInstanceScore(run, a, profile));
  return ranked[0]?.uid ?? null;
}

function recoverableDiscardCardsForChoice(run) {
  const combat = run?.combat;
  const choice = run?.pendingChoice;
  if (!combat || !choice) return [];
  const excluded = new Set(choice.excludeStyles ?? []);
  return (combat.discardPile || []).filter((card) => {
    if (card.uid === choice.sourceUid) return false;
    const style = cards[card.cardId]?.style;
    return !style || !excluded.has(style);
  });
}

function handleDiscard(run, profile = "balanced") {
  const recoverable = recoverableDiscardCardsForChoice(run);
  const pickUid = highValueCardUid(run, recoverable, profile);
  return pickUid
    ? { type: "pickDiscardCard", cardUid: pickUid, simReason: "pendingChoice:discardPick" }
    : { type: "cancelDiscardPick", simReason: "pendingChoice:discardPickEmpty" };
}

function pendingChoiceType(run) {
  if (!run) return null;
  if (run.pendingChoice?.type) return run.pendingChoice.type;
  if (run.pendingPurge) return "pendingPurge";
  for (const key of ["pendingReward", "pendingEvent", "pendingShop", "pendingCardRemove", "pendingCardUpgrade", "pendingCardSelect"]) {
    if (run[key]) return key;
  }
  return null;
}

function chooseBlockingAction(state, profile = "balanced") {
  const run = state?.run;
  if (!run) return null;

  if (run.pendingPurge) {
    return { type: "confirmPurge", cardUid: pickPurgeCardAI(run), simReason: "pendingPurge" };
  }

  const choice = run.pendingChoice;
  if (!choice) return null;
  const type = choice.type ?? "unknown";

  if (type === "discardPick") return handleDiscard(run, profile);

  if (["purgePick", "removeCard", "cardRemove"].includes(type)) {
    return { type: "confirmPurge", cardUid: lowValueCardUid(run, run.deck, profile), simReason: `pendingChoice:${type}`, pendingChoiceType: type };
  }

  if (["upgradePick", "cardUpgrade"].includes(type)) {
    return { type: "upgradeCard", cardUid: highValueCardUid(run, run.deck, profile), simReason: `pendingChoice:${type}`, pendingChoiceType: type };
  }

  if (["rewardPick", "cardReward"].includes(type) && (run.rewards || []).length) {
    return { type: "chooseReward", rewardId: pickReward(state, profile).id, simReason: `pendingChoice:${type}`, pendingChoiceType: type };
  }

  if (type === "relicPick" && (run.rewards || []).length) {
    const relicReward = (run.rewards || []).find((reward) => reward.type === "relic") ?? pickReward(state, profile);
    return { type: "chooseReward", rewardId: relicReward.id, simReason: "pendingChoice:relicPick", pendingChoiceType: type };
  }

  if (type === "shopChoice" && state.phase === "shop") {
    const stock = (run.shopStock ?? []).filter((item) => !item.sold);
    const affordable = stock.filter((item) => run.gold >= item.price);
    const purge = affordable.find((item) => item.effect?.type === "removeCard" || item.effect?.type === "purge" || item.type === "removeCard");
    if (purge) return { type: "buyShopItem", itemId: purge.id, simReason: "pendingChoice:shopChoice", pendingChoiceType: type };
    const profileCard = affordable.find((item) => item.cardId && cards[item.cardId]?.style === profile);
    if (profileCard) return { type: "buyShopItem", itemId: profileCard.id, simReason: "pendingChoice:shopChoice", pendingChoiceType: type };
    const relicItem = affordable.find((item) => item.type === "relic" || item.effect?.type === "relic");
    if (relicItem) return { type: "buyShopItem", itemId: relicItem.id, simReason: "pendingChoice:shopChoice", pendingChoiceType: type };
    return { type: "leaveShop", simReason: "pendingChoice:shopChoice", pendingChoiceType: type };
  }

  if (type === "eventChoice") {
    return { type: "chooseEventOption", optionIndex: 0, simReason: "unknownPendingChoice", pendingChoiceType: type };
  }

  return { type: "unknownPendingChoice", simReason: "unknownPendingChoice", pendingChoiceType: type };
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
  const run = s.run;
  const combat = run.combat;
  if (!combat) return { type: "endTurn" };
  const blockingAction = chooseBlockingAction(s, "balanced");
  if (blockingAction) return blockingAction;
  if (stepC > 200) return { type: "endTurn", simReason: "singleTurnCombatLoop" };
  const rc = ensureRcState(combat);
  rc.cardsPlayed++;
  if (rc.cardsPlayed > 40) return { type: "endTurn" };
  if ((rc.noProgressActions || 0) >= noProgressActionCap) {
    rc.noProgressActions = 0;
    return { type: "endTurn", simReason: "controlNoProgress" };
  }
  // Stall detection
  const sig = stateSignature(run, combat);
  rc.sigs.push(sig); if (rc.sigs.length > 12) rc.sigs.shift();
  if (rc.sigs.length >= 8 && rc.sigs.every(s => s === sig)) return { type: "endTurn", simReason: "repeatedStateSignature" };
  if (rc.noDmgTurns >= 8) rc.aggressive = true;
  if (rc.noDmgTurns < 4) rc.aggressive = false;
  const hand = combat.hand.filter(inst => !(cards[inst.cardId]?.id === "meditate" && run.energy >= run.maxEnergy));
  const hpPct = run.hp / run.maxHp;
  const block = combat.block ?? 0;
  const enemyDmg = estimateIncoming(run);

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

  if (enemyIsControlled(run)) {
    const progress = pickProgressCard(run, playable, basicCardScore);
    if (progress) return { type: "playCard", cardUid: progress.inst.uid, targetUid: null };
  }

  playable.sort((a, b) => {
    let sa = basicCardScore(run, a.card);
    let sb = basicCardScore(run, b.card);
    if (enemyIsControlled(run)) {
      if (cardHasProgressEffect(a.card)) sa += 500;
      if (cardHasProgressEffect(b.card)) sb += 500;
      if (isPureControlCard(a.card)) sa -= 800;
      if (isPureControlCard(b.card)) sb -= 800;
    }
    if (isPureControlCard(a.card) && rc.ctrlCards >= controlCardsPerTurnCap) sa = -999;
    if (isPureControlCard(b.card) && rc.ctrlCards >= controlCardsPerTurnCap) sb = -999;
    return sb - sa;
  });
  if (basicCardScore(run, playable[0].card) < 0 && hpPct > 0.5) return { type: "endTurn" };
  if (isPureControlCard(playable[0].card)) {
    if (rc.ctrlCards >= controlCardsPerTurnCap) return { type: "endTurn", simReason: "controlNoProgress" };
    rc.ctrlCards++;
  }
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
  const progress = hand.filter(h => ok(h) && cardHasProgressEffect(h.card));
  const dmg = hand.filter(h => ok(h) && h.card.effects.some(e => e.type === "damage"));
  if (controlPressure >= 5 && progress.length > 0) return makeAction(progress.sort((a,b)=>styleAwareCardScore(run,b.card,"control")-styleAwareCardScore(run,a.card,"control"))[0]);
  if (control.length > 0 && controlPressure < 4) return makeAction(control[0]);
  if (progress.length > 0) return makeAction(progress[0]);
  if (dmg.length > 0) return makeAction(dmg[0]);
  if (control.length > 0) return makeAction(control[0]);
  if (run.hp <= run.maxHp * 0.3) { const b=hand.filter(h=>ok(h)&&h.card.effects.some(e=>e.type==="block")); if(b.length>0)return makeAction(b[0]); }
  return null;
}

function styleAwareCombatAct(s, stepC, profile = "balanced") {
  const run = s.run;
  const combat = run.combat;
  if (!combat) return { type: "endTurn" };
  const blockingAction = chooseBlockingAction(s, profile);
  if (blockingAction) return blockingAction;
  if (stepC > 200) return { type: "endTurn", simReason: "singleTurnCombatLoop" };
  const rc = ensureRcState(combat);
  rc.cardsPlayed++;
  if (rc.cardsPlayed > 40) return { type: "endTurn" };
  if ((rc.noProgressActions || 0) >= noProgressActionCap) {
    rc.noProgressActions = 0;
    return { type: "endTurn", simReason: "controlNoProgress" };
  }

  // Stall detection: same state signature 8+ actions → endTurn
  const sig = stateSignature(run, combat);
  rc.sigs.push(sig); if (rc.sigs.length > 12) rc.sigs.shift();
  if (rc.sigs.length >= 8 && rc.sigs.every(s => s === sig)) return { type: "endTurn", simReason: "repeatedStateSignature" };

  if (rc.noDmgTurns >= 8) rc.aggressive = true;
  if (rc.noDmgTurns < 4) rc.aggressive = false;

  const hand = combat.hand.filter(inst => !(cards[inst.cardId]?.id === "meditate" && run.energy >= run.maxEnergy));
  const hpPct = run.hp / run.maxHp;
  const block = combat.block ?? 0;
  const enemyDmg = estimateIncoming(run);
  const isTM = run.trueMartial;

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

  const playableNow = hand.map(inst => ({ inst, card: cards[inst.cardId] }))
    .filter(h => run.energy >= h.card.cost && (h.card.id !== "meditate" || run.energy < run.maxEnergy));
  if (enemyIsControlled(run)) {
    const progress = pickProgressCard(run, playableNow, (activeRun, card) => styleAwareCardScore(activeRun, card, profile));
    if (progress) return { type: "playCard", cardUid: progress.inst.uid, targetUid: null };
  }

  // 4) Try profile-specific AI
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

  // 5) Draw/energy
  const drawCard = findBest(run, hand, e => e.type === "draw" || e.type === "gainEnergy");
  if (drawCard && run.energy >= 2) return { type: "playCard", cardUid: drawCard.uid, targetUid: null };

  // 6) Scored fallback with RC3 control guardrails
  const playable = playableNow;
  if (playable.length === 0) return { type: "endTurn" };

  playable.sort((a, b) => {
    let sa = styleAwareCardScore(run, a.card, profile);
    let sb = styleAwareCardScore(run, b.card, profile);
    if (rc.aggressive || enemyIsControlled(run)) {
      if (cardHasProgressEffect(a.card)) sa += 500;
      if (cardHasProgressEffect(b.card)) sb += 500;
      if (isPureControlCard(a.card)) sa -= 800;
      if (isPureControlCard(b.card)) sb -= 800;
    }
    if (isPureControlCard(a.card) && rc.ctrlCards >= controlCardsPerTurnCap) sa = -999;
    if (isPureControlCard(b.card) && rc.ctrlCards >= controlCardsPerTurnCap) sb = -999;
    return sb - sa;
  });
  const best = playable[0];
  if (isPureControlCard(best.card)) {
    if (rc.ctrlCards >= controlCardsPerTurnCap) return { type: "endTurn", simReason: "controlNoProgress" };
    rc.ctrlCards++;
  }
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
  return lowValueCardUid(run, purgeable, run.trueMartialStyle ?? "balanced");
}

function decideNextAction(state, profile, strategy, stepCombat) {
  const blocking = chooseBlockingAction(state, profile);
  if (blocking) return blocking;

  if (state.phase === "route") {
    return { type: "chooseNode", nodeId: pickRoute(state.run).id, simReason: "route" };
  }
  if (state.phase === "shop") {
    return { type: "__stateResult", nextState: shopAct(state), simReason: "shopAct" };
  }
  if (state.phase === "reward") {
    return { type: "chooseReward", rewardId: pickReward(state, profile).id, simReason: "reward" };
  }
  if (state.phase === "combat") {
    return strategy === "basic"
      ? basicCombatAct(state, stepCombat)
      : styleAwareCombatAct(state, stepCombat, profile);
  }
  return { type: "unknownPhase", simReason: "unknown" };
}

function runOne(seed, profile, trueMartial, strategy, difficulty = null) {
  let s = seededRun(seed, trueMartial ? profile : null, difficulty);
  let steps = 0;
  let stepCombat = 0;
  let turns = 0;
  let lastTurnKey = null;
  let timeoutReasonCandidate = null;
  let forcedTimeoutReason = null;
  let endTurnNoOpCount = 0;
  let consecutiveEndTurnNoOp = 0;
  let unknownPendingChoiceCount = 0;
  let lastPendingChoiceType = null;
  const timeoutLastActions = [];

  const noteTurn = (state) => {
    const combat = state.run?.combat;
    if (state.phase !== "combat" || !combat) return;
    const key = `${state.run?.floor ?? 0}:${combat.turn ?? 0}`;
    if (key !== lastTurnKey) {
      turns++;
      lastTurnKey = key;
    }
  };

  while (s.phase !== "gameOver" && steps < 5000) {
    noteTurn(s);
    steps++;
    if (s.phase === "combat") stepCombat++;
    else stepCombat = 0;

    const beforeState = s;
    const beforeSignature = stateProgressSignature(beforeState);
    const beforeProgress = combatProgressSnapshot(s.run);
    const beforeTurn = s.run?.combat?.turn ?? null;
    const act = decideNextAction(s, profile, strategy, stepCombat);
    if (TIMEOUT_REASONS.has(act?.simReason)) timeoutReasonCandidate = act.simReason;
    if (act?.type === "unknownPendingChoice") {
      unknownPendingChoiceCount++;
      lastPendingChoiceType = act.pendingChoiceType ?? pendingChoiceType(s.run);
      forcedTimeoutReason = "unknownPendingChoice";
    }

    let nextState = null;
    let card = null;
    if (act?.type === "__stateResult") {
      nextState = act.nextState;
    } else {
      const cardInst = act?.cardUid
        ? (s.run?.combat?.hand || []).find((item) => item.uid === act.cardUid)
        : null;
      card = cardInst ? cards[cardInst.cardId] : null;
      nextState = reduceGame(s, act);
    }

    s = nextState;
    noteTurn(s);

    const afterSignature = stateProgressSignature(s);
    const actionRecord = rememberAction(timeoutLastActions, beforeState, s, act, steps, stepCombat, beforeSignature, afterSignature);

    if (actionRecord.pendingChoiceBefore && !actionRecord.changed && act?.type !== "endTurn") {
      unknownPendingChoiceCount++;
      lastPendingChoiceType = actionRecord.pendingChoiceBefore;
      forcedTimeoutReason = "unknownPendingChoice";
      actionRecord.simReason = "unknownPendingChoice";
      actionRecord.reason = "unknownPendingChoice";
    }

    const afterProgress = combatProgressSnapshot(s.run);
    const sameTurn = s.phase === "combat"
      && s.run?.combat
      && beforeTurn === (s.run.combat.turn ?? null);
    if (sameTurn && act.type === "playCard") {
      const rc = ensureRcState(s.run.combat);
      if (actionMadeProgress(beforeProgress, afterProgress, act, card)) {
        rc.noProgressActions = 0;
      } else {
        rc.noProgressActions = (rc.noProgressActions || 0) + 1;
        if (rc.noProgressActions >= noProgressActionCap) timeoutReasonCandidate = "controlNoProgress";
      }
    }

    if (act?.type === "endTurn" && !actionRecord.changed) {
      endTurnNoOpCount++;
      consecutiveEndTurnNoOp++;
      actionRecord.simReason = actionRecord.simReason ?? "noOpEndTurn";
      actionRecord.reason = actionRecord.simReason;
      actionRecord.noOpEndTurn = true;
      if (actionRecord.pendingChoiceBefore) {
        lastPendingChoiceType = actionRecord.pendingChoiceBefore;
      } else if (consecutiveEndTurnNoOp >= endTurnNoOpCap) {
        forcedTimeoutReason = "endTurnNoOpLoop";
      }
    } else if (act?.type !== "endTurn" || actionRecord.changed) {
      consecutiveEndTurnNoOp = 0;
    }

    if (forcedTimeoutReason) break;
  }
  // V1.8.2: timeout — return timedOut marker, don't pollute win rate
  if ((forcedTimeoutReason || steps >= 5000) && s.phase !== "gameOver") {
    const timeoutReason = TIMEOUT_REASONS.has(forcedTimeoutReason ?? timeoutReasonCandidate)
      ? (forcedTimeoutReason ?? timeoutReasonCandidate)
      : "stepLimit5000";
    return {
      floor: s.run?.floor ?? 0,
      won: false,
      timedOut: true,
      timeout: true,
      outcome: "timeout",
      timeoutReason,
      timeoutLastActions: timeoutLastActions.length ? timeoutLastActions : [{
        globalStep: steps,
        step: steps,
        stepCombat,
        phase: s.phase,
        actionType: "timeout",
        action: "timeout",
        simReason: timeoutReason,
        reason: timeoutReason,
        changed: false,
        pendingChoiceBefore: pendingChoiceType(s.run),
        pendingChoiceAfter: pendingChoiceType(s.run),
        turn: s.run?.combat?.turn ?? null,
      }],
      deck: s.run?.deck.length ?? 0,
      relics: s.run?.relics.length ?? 0,
      energy: s.run?.maxEnergy ?? 3,
      hp: s.run?.hp ?? 0,
      steps,
      turns,
      phase: s.phase,
      pendingPurge: Boolean(s.run?.pendingPurge),
      pendingChoiceType: lastPendingChoiceType ?? pendingChoiceType(s.run),
      endTurnNoOpCount,
      unknownPendingChoiceCount,
      seed: s.run?.seed,
      profile,
      controlCardsPerTurnCap,
      noProgressActionCap,
    };
  }
  // V1.8: validate terminal state consistency (enhanced)
  assertTerminalState(s, steps);
  const won = isVictory(s.run);
  return {
    floor: s.run?.floor ?? 0,
    won,
    timedOut: false,
    timeout: false,
    outcome: won ? "win" : "loss",
    timeoutReason: null,
    timeoutLastActions: [],
    deck: s.run?.deck.length ?? 0,
    relics: s.run?.relics.length ?? 0,
    energy: s.run?.maxEnergy ?? 3,
    hp: s.run?.hp ?? 0,
    steps,
    turns,
    pendingChoiceType: null,
    endTurnNoOpCount,
    unknownPendingChoiceCount,
    seed: s.run?.seed,
    profile,
    controlCardsPerTurnCap,
    noProgressActionCap,
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

function toRawRunRecord(result, meta) {
  const timeout = Boolean(result.timedOut || result.timeout);
  return {
    runId: `${meta.mode}:${meta.profile}:s${meta.seedGroup}:r${meta.runIndex}:seed${meta.seed}`,
    mode: meta.mode,
    difficulty: meta.difficulty,
    profile: meta.profile,
    displayStyle: displayStyle(meta.profile),
    seed: meta.seed,
    seedGroup: meta.seedGroup,
    runIndex: meta.runIndex,
    outcome: result.outcome ?? (timeout ? "timeout" : result.won ? "win" : "loss"),
    win: Boolean(result.won),
    timeout,
    crash: false,
    floor: result.floor ?? 0,
    steps: result.steps ?? null,
    turns: result.turns ?? 0,
    finalHp: result.hp ?? 0,
    finalDeckSize: result.deck ?? 0,
    finalRelicCount: result.relics ?? 0,
    timeoutReason: timeout ? (TIMEOUT_REASONS.has(result.timeoutReason) ? result.timeoutReason : "unknown") : null,
    timeoutLastActions: timeout ? (result.timeoutLastActions || []) : [],
    pendingChoiceType: result.pendingChoiceType ?? null,
    endTurnNoOpCount: result.endTurnNoOpCount ?? 0,
    unknownPendingChoiceCount: result.unknownPendingChoiceCount ?? 0,
    controlCardsPerTurnCap,
  };
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
    const seedRecords = genSeedRecords(STYLES.indexOf(profile), RUNS);

    for (const seedRecord of seedRecords) {
      const seed = seedRecord.seed;
      const r = runOne(seed, profile, trueMartial, strategy, difficulty);
      if (RAW_OUT) {
        rawOutputRows.push(toRawRunRecord(r, {
          mode: modeLabel,
          difficulty: modeLabel,
          profile,
          seed,
          seedGroup: seedRecord.seedGroup,
          runIndex: seedRecord.runIndex,
        }));
      }
      if (r.timedOut) {
        timeouts++;
        if (timeoutSamples.length < 3) timeoutSamples.push({
          seed,
          floor: r.floor,
          phase: r.phase,
          pendingPurge: r.pendingPurge,
          timeoutReason: r.timeoutReason,
          timeoutLastActions: r.timeoutLastActions,
        });
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

    const total = seedRecords.length;
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

export {
  STYLES,
  seededRun,
  pickRoute,
  shopAct,
  pickReward,
  rewardScore,
  basicCombatAct,
  styleAwareCombatAct,
  runOne,
  isVictory,
  displayStyle,
  controlCardsPerTurnCap,
  noProgressActionCap,
  endTurnNoOpCap,
  toRawRunRecord,
};

function main() {
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

  if (RAW_OUT) {
    fs.mkdirSync(path.dirname(RAW_OUT), { recursive: true });
    fs.writeFileSync(RAW_OUT, `${rawOutputRows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
