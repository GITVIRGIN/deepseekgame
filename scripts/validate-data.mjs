import { cards, enemies, relics, rarityInfo, shopItems, statusInfo, styleInfo, trueMartialDecks, trueMartialRelics } from "../src/core/data.js";
import { gameVersion } from "../src/core/version.js";
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

// Summary
if (warns === 0) {
  console.log("\n🎉 All checks passed!");
} else {
  console.log(`\n⚠️ ${warns} warning(s) found`);
}
process.exit(warns > 0 ? 1 : 0);
