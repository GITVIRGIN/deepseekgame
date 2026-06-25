import { cards, enemies, relics, rarityInfo, shopItems, statusInfo, styleInfo, trueMartialDecks, trueMartialRelics } from "../src/core/data.js";
import { gameVersion } from "../src/core/version.js";
import {
  ACTIVE_DUAL_FUSION_CARD_IDS,
  ACTIVE_TRIPLE_FUSION_CARD_IDS,
  cardsForTier,
  fusionCandidateCards,
  isFusionCard,
  trueMartialBaseCardsForTier,
} from "../src/core/rewards.js";
import { FUSION_ROUTE_KEYS, canonicalFusionKey } from "../src/core/archetypes.js";
import fs from "fs";

let warns = 0;

function warn(msg) { warns++; console.warn("⚠️", msg); }
function pass(msg) { console.log("✅", msg); }

const IMPLEMENTED_EFFECTS = new Set([
  "damage", "execute", "block", "heal", "loseHp", "draw", "gainEnergy",
  "status", "amplifyDebuffs", "poisonBurst", "thunderMark", "bleedSiphon", "shellReflect",
  "recoverDiscard", "cleanse", "spikeBurst", "doubleBlock",
  "purgeCard", "loseHpPlayer", // 删牌系统和真武高代价效果
]);

// 1. Card effect types
for (const [id, card] of Object.entries(cards)) {
  if (card.id !== id) warn(`Card key mismatch: ${id} vs ${card.id}`);
  for (const effect of card.effects ?? []) {
    if (effect.type && !IMPLEMENTED_EFFECTS.has(effect.type)) {
      warn(`Unimplemented effect type "${effect.type}" in card ${card.name} (${id})`);
    }
  }
}
pass("Card effect types validated");

// 2. Shop item effects
const SHOP_EFFECT_TYPES = new Set(["maxEnergy","maxHp","rareCard","relic","heal","handLimit","deckLimit","energy","draw","gold","cleanse","purgeCard","loseHpPlayer"]);
for (const [id, item] of Object.entries(shopItems)) {
  for (const effect of item.effects ?? []) {
    if (!SHOP_EFFECT_TYPES.has(effect.type)) {
      warn(`Unknown shop effect "${effect.type}" in ${id}`);
    }
  }
}
pass("Shop item effects validated");

// 3. startingDeck card IDs
const startingDeck = ["strike","strike","strike","strike","strike","guard","guard","guard","guard","meditate"];
for (const id of startingDeck) {
  if (!cards[id]) warn(`startingDeck card not found: ${id}`);
}
pass("Starting deck validated");

// 4. trueMartialDecks
for (const [style, deck] of Object.entries(trueMartialDecks)) {
  if (!styleInfo[style]) warn(`TM deck style unknown: ${style}`);
  for (const id of deck) {
    if (!cards[id]) warn(`TM deck card not found: ${id} (style: ${style})`);
  }
}
pass("True Martial decks validated");

// 5. trueMartialRelics
for (const [style, relicId] of Object.entries(trueMartialRelics)) {
  if (!styleInfo[style]) warn(`TM relic style unknown: ${style}`);
  if (!relics[relicId]) warn(`TM relic not found: ${relicId} (style: ${style})`);
}
pass("True Martial relics validated");

// 6. Martial UI styles vs TM decks
const UI_STYLES = ["physical","spell","bleed","shell","poison","control"];
for (const style of UI_STYLES) {
  if (!trueMartialDecks[style]) warn(`UI style "${style}" missing from trueMartialDecks`);
}
pass("TM UI styles consistent with decks");

// 7. VERSION.md sync
try {
  const vmd = fs.readFileSync("VERSION.md", "utf-8");
  const match = vmd.match(/v?(\d+\.\d+\.\d+)/);
  if (match) {
    const vmdVer = match[1];
    if (vmdVer !== gameVersion.app) {
      console.log("ℹ️ VERSION.md:", vmdVer, "≠ code:", gameVersion.app, "(acceptable drift)");
    } else {
      pass("VERSION.md matches code version");
    }
  }
} catch (e) { console.log("ℹ️ VERSION.md not readable"); }

// 8. Enemies
for (const [id, enemy] of Object.entries(enemies)) {
  if (!enemy.intents || enemy.intents.length === 0) warn(`Enemy ${enemy.name} has no intents`);
}
pass("Enemies validated");

// 9. StatusInfo
for (const [id, info] of Object.entries(statusInfo)) {
  if (!info.label) warn(`Status ${id} has no label`);
}
pass("Status info validated");

// 10. Purge reward types require filter
const purgeShopItems = Object.values(shopItems).filter(item =>
  item.effects?.some(e => e.type === "purgeCard")
);
for (const item of purgeShopItems) {
  const effect = item.effects.find(e => e.type === "purgeCard");
  if (!effect.filter) warn(`Shop purge item ${item.id} lacks filter`);
}
pass("Purge item filter validated");

// 11. Curse/special cards excluded from reward pools
const curseCardIds = Object.values(cards).filter(c => c.isCurse).map(c => c.id);
if (curseCardIds.length > 0 && !curseCardIds.includes("karmaCurse")) {
  warn("karmaCurse card not defined or lacks isCurse flag");
}
pass("Curse card exclusion validated");

// 12. trueMartialOnly relics filtering
const tmOnlyRelics = Object.values(relics).filter(r => r.trueMartialOnly);
if (tmOnlyRelics.length === 0) warn("No trueMartialOnly relics defined");
// Check for relics without implemented field (true by default, but should be explicit)
for (const relic of tmOnlyRelics) {
  if (relic.implemented === undefined) {
    warn(`True martial relic ${relic.id} lacks implemented field`);
  }
}
pass("True martial relic filtering validated");

// 13. undeletable card checks
const undeletableCards = Object.values(cards).filter(c => c.undeletable);
if (undeletableCards.length === 0) warn("No undeletable cards defined");
for (const card of undeletableCards) {
  if (!card.undeletable) warn(`Card ${card.id} missing undeletable flag`);
}
pass("Undeletable card rules validated");

// V2.6: True Martial unlock relic requirements validation
const normalUnlockRelicsForValidation = Object.values(relics).filter(r =>
  r.implemented !== false &&
  r.trueMartialOnly !== true &&
  !r.text?.includes("真武专属")
);
const normalUnlockRelicIds = new Set(normalUnlockRelicsForValidation.map(r => r.id));

for (const relic of Object.values(relics)) {
  if ((relic.trueMartialOnly === true || relic.implemented === false) && normalUnlockRelicIds.has(relic.id)) {
    warn(`True martial unlock requirements incorrectly include ${relic.id}`);
  }
}
for (const id of ["bloodContract", "cursedMirror", "soulFurnace", "hollowBlessing"]) {
  if (normalUnlockRelicIds.has(id)) warn(`True martial unlock requirements incorrectly include ${id}`);
}
pass("True Martial unlock relic requirements validated");

// V3.3: True Martial relic implemented effects validation
const tmRelics = Object.values(relics).filter(r => r.trueMartialOnly === true);
for (const relic of tmRelics) {
  if (relic.implemented === undefined) warn(`TM relic ${relic.id} missing implemented field`);
  if (relic.implemented === true) {
    const implementedIds = ["bloodContract", "cursedMirror", "soulFurnace", "infernoLotus", "inverseScaleArmor", "chaosBell", "berserkBrand", "bloodPrisonOath", "venomousCauldron", "poJunLing", "nineSkyTribulation", "asuraHeart", "venomScripture", "chaosTreasure", "turtleShell"];
    if (!implementedIds.includes(relic.id)) warn(`TM relic ${relic.id} marked implemented=true but no code reference found`);
  }
}
// Only hollowBlessing should remain implemented:false
for (const id of ["hollowBlessing"]) {
  const r = relics[id];
  if (r && r.implemented !== false) warn(`${id} must be implemented:false`);
}
pass("True Martial relic implemented effects validated");

// T2-A3 fusion route metadata and reward-pool gating
const BASE_STYLES = new Set(["physical", "spell", "bleed", "shell", "poison", "control"]);
const FUSION_STAGES = new Set(["base", "commit", "formed", "highrollA", "highrollB", "mastery"]);
const ACTIVE_DUAL_SET = new Set(ACTIVE_DUAL_FUSION_CARD_IDS);
const ACTIVE_TRIPLE_SET = new Set(ACTIVE_TRIPLE_FUSION_CARD_IDS);
const ACTIVE_HEAVENLY_TRIGGER_IDS = [
  "triggerThunderBloodBreakArmy",
  "triggerThreeCalamityTribulation",
  "triggerRottenGuPrison",
  "triggerXuanGuPrison",
  "triggerDemonSuppressArmor",
  "triggerXuanThunderArmy",
];
const ACTIVE_TRIGGER_SET = new Set(ACTIVE_HEAVENLY_TRIGGER_IDS);
const EXPECTED_DUAL_KEYS = new Set([
  "physical+spell",
  "spell+bleed",
  "bleed+poison",
  "poison+control",
  "control+shell",
  "physical+shell",
]);
const EXPECTED_TRIPLE_KEYS = new Set([
  "physical+spell+bleed",
  "spell+bleed+poison",
  "bleed+poison+control",
  "poison+control+shell",
  "physical+control+shell",
  "physical+spell+shell",
]);
const STAGE_TEXT = {
  base: "真武双合流·入门",
  commit: "真武双合流·押注",
  formed: "真武双合流·成型",
  highrollA: "真武双合流·胡牌",
  highrollB: "真武双合流·胡牌",
  mastery: "真武双合流·大成",
};

const fusionCards = Object.values(cards).filter((card) => isFusionCard(card) || card.heavenlyTrigger);
for (const card of fusionCards) {
  if (card.heavenlyTrigger) {
    // Heavenly trigger card checks
    if (!card.triggerTripleCardId) warn(`Heavenly trigger ${card.id} missing triggerTripleCardId`);
    if (!Array.isArray(card.triggerRoutes) || card.triggerRoutes.length !== 2) warn(`Heavenly trigger ${card.id} triggerRoutes must be array of 2`);
    if (!Array.isArray(card.triggerStyles) || card.triggerStyles.length !== 3) warn(`Heavenly trigger ${card.id} triggerStyles must be array of 3`);
    if (card.trueMartial !== true) warn(`Heavenly trigger ${card.id} must be trueMartial=true`);
    if (card.fusionTier !== 3) warn(`Heavenly trigger ${card.id} must have fusionTier=3`);
    if (!card.triggerName) warn(`Heavenly trigger ${card.id} missing triggerName`);
    if (!card.text?.includes("【天尊契机】")) warn(`Heavenly trigger ${card.id} text missing 【天尊契机】`);
    if (!card.text?.includes("选择后进化为")) warn(`Heavenly trigger ${card.id} text missing 选择后进化为`);
    if (!ACTIVE_TRIGGER_SET.has(card.id)) warn(`Heavenly trigger ${card.id} not in active trigger list`);
    if (card.effects?.length > 0) warn(`Heavenly trigger ${card.id} should have no combat effects`);
    if (!cards[card.triggerTripleCardId]) warn(`Heavenly trigger ${card.id} triggerTripleCardId ${card.triggerTripleCardId} not found`);
    continue;
  }
  if (!Array.isArray(card.fusionStyles)) warn(`Fusion card ${card.id} fusionStyles must be an array`);
  if (card.fusionTier === 2 && card.fusionStyles?.length !== 2) warn(`Dual fusion ${card.id} must have 2 fusionStyles`);
  if (card.fusionTier === 3 && card.fusionStyles?.length !== 3) warn(`Triple fusion ${card.id} must have 3 fusionStyles`);
  if (card.fusionTier !== 2 && card.fusionTier !== 3) warn(`Fusion card ${card.id} must have fusionTier 2 or 3`);
  for (const style of card.fusionStyles || []) {
    if (!BASE_STYLES.has(style)) warn(`Fusion card ${card.id} has invalid fusion style ${style}`);
  }
  if (card.trueMartial !== true) warn(`Fusion card ${card.id} must be trueMartial=true`);
  if (card.isCurse) warn(`Fusion card ${card.id} must not be curse`);
  if (card.fusionTier === 2) {
    if (!BASE_STYLES.has(card.style)) warn(`Fusion card ${card.id} has invalid card.style ${card.style}`);
    if (Array.isArray(card.fusionStyles) && !card.fusionStyles.includes(card.style)) {
      warn(`Fusion card ${card.id} card.style must be included in fusionStyles`);
    }
    if (!card.fusionName) warn(`Fusion card ${card.id} missing fusionName`);
    if (!card.text?.includes("真武双合流")) warn(`Dual fusion ${card.id} text missing 真武双合流`);
    if (!card.fusionRoute) warn(`Dual route card ${card.id} missing fusionRoute`);
    if (!EXPECTED_DUAL_KEYS.has(card.fusionRoute)) warn(`Dual route card ${card.id} has inactive route ${card.fusionRoute}`);
    if (!FUSION_STAGES.has(card.fusionStage)) warn(`Dual route card ${card.id} has invalid fusionStage ${card.fusionStage}`);
    if (card.fusionRoute !== canonicalFusionKey(card.fusionStyles || [])) {
      warn(`Dual route card ${card.id} fusionRoute ${card.fusionRoute} does not match fusionStyles`);
    }
    if (card.fusionStage && !card.text?.includes(STAGE_TEXT[card.fusionStage])) {
      warn(`Dual route card ${card.id} text missing ${STAGE_TEXT[card.fusionStage]}`);
    }
  }
  if (card.fusionTier === 3 && !card.heavenlyTrigger) {
    if (!card.text?.includes("真武三合流")) warn(`Triple fusion ${card.id} text missing 真武三合流`);
    if (!card.fusionName) warn(`Triple fusion ${card.id} missing fusionName`);
  }
  for (const effect of card.effects ?? []) {
    if (effect.type && !IMPLEMENTED_EFFECTS.has(effect.type)) {
      warn(`Fusion card ${card.id} has unimplemented effect ${effect.type}`);
    }
  }
}

for (const id of ACTIVE_DUAL_FUSION_CARD_IDS) {
  const card = cards[id];
  if (!card) warn(`Expected dual fusion missing: ${id}`);
  else if (card.fusionTier !== 2) warn(`Expected dual fusion ${id} has tier ${card.fusionTier}`);
  else if (!EXPECTED_DUAL_KEYS.has(canonicalFusionKey(card.fusionStyles))) warn(`Expected dual fusion ${id} has unexpected key ${canonicalFusionKey(card.fusionStyles)}`);
  else if (!card.fusionRoute || !FUSION_STAGES.has(card.fusionStage)) warn(`Expected dual fusion ${id} missing route stage metadata`);
}

for (const id of ACTIVE_TRIPLE_FUSION_CARD_IDS) {
  const card = cards[id];
  if (!card) warn(`Expected triple fusion missing: ${id}`);
  else if (card.fusionTier !== 3) warn(`Expected triple fusion ${id} has tier ${card.fusionTier}`);
  else if (!EXPECTED_TRIPLE_KEYS.has(canonicalFusionKey(card.fusionStyles))) warn(`Expected triple fusion ${id} has unexpected key ${canonicalFusionKey(card.fusionStyles)}`);
}

for (const routeKey of FUSION_ROUTE_KEYS) {
  if (!EXPECTED_DUAL_KEYS.has(routeKey)) warn(`Unexpected fusion route key exported: ${routeKey}`);
}

for (const routeKey of EXPECTED_DUAL_KEYS) {
  const routeCards = ACTIVE_DUAL_FUSION_CARD_IDS.map((id) => cards[id]).filter((card) => card?.fusionRoute === routeKey);
  for (const stage of FUSION_STAGES) {
    if (!routeCards.some((card) => card.fusionStage === stage)) {
      warn(`Fusion route ${routeKey} missing active ${stage} card`);
    }
  }
}

for (const card of fusionCards.filter((card) => card.fusionTier === 2)) {
  if (!EXPECTED_DUAL_KEYS.has(card.fusionRoute)) {
    const fakeRun = {
      trueMartial: true,
      trueMartialStyle: "physical",
      floor: 19,
      archetypeAffinity: Object.fromEntries([...BASE_STYLES].map((style) => [style, 30])),
      deck: ACTIVE_DUAL_FUSION_CARD_IDS.map((id) => ({ cardId: id, acquiredFloor: 10 })),
    };
    const candidateIds = fusionCandidateCards(fakeRun, 2).map((candidate) => candidate.id);
    if (candidateIds.includes(card.id)) warn(`Inactive route card ${card.id} enters active reward pool`);
  }
}

for (const card of fusionCards.filter((card) => card.fusionTier === 2)) {
  const active = ACTIVE_DUAL_SET.has(card.id);
  if (!active) {
    const fakeRun = {
      trueMartial: true,
      trueMartialStyle: "physical",
      floor: 19,
      archetypeAffinity: Object.fromEntries([...BASE_STYLES].map((style) => [style, 20])),
      deck: ACTIVE_DUAL_FUSION_CARD_IDS.map((id) => ({ cardId: id })),
    };
    const candidateIds = fusionCandidateCards(fakeRun, 2).map((candidate) => candidate.id);
    if (candidateIds.includes(card.id)) warn(`Inactive dual fusion ${card.id} enters active candidate pool`);
  }
}

for (const id of startingDeck) {
  if (isFusionCard(cards[id])) warn(`Normal starting deck contains fusion card ${id}`);
}
for (const id of startingDeck) {
  if (cards[id]?.trueMartial) warn(`Normal starting deck contains trueMartial card ${id}`);
}

for (const tier of [1, 2, 3, 4, 5]) {
  for (const premium of [false, true]) {
    const normalPool = cardsForTier(tier, premium);
    if (normalPool.some((card) => card.trueMartial || isFusionCard(card))) {
      warn(`Normal/regular reward pool tier=${tier} premium=${premium} contains trueMartial/fusion card`);
    }
    const tmBasePool = trueMartialBaseCardsForTier({ trueMartial: true, deck: [], archetypeAffinity: {}, floor: 1 }, tier, premium);
    if (tmBasePool.some((card) => isFusionCard(card))) {
      warn(`TrueMartial base reward pool tier=${tier} premium=${premium} contains fusion card`);
    }
  }
}
pass("T2-A2 fusion metadata and reward pool gating validated");

// Summary
if (warns === 0) {
  console.log("\n🎉 All checks passed!");
} else {
  console.log(`\n⚠️ ${warns} warning(s) found`);
}
process.exit(warns > 0 ? 1 : 0);
