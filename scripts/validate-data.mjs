import { cards, enemies, relics, rarityInfo, shopItems, statusInfo, styleInfo, trueMartialDecks, trueMartialRelics } from "../src/core/data.js";
import { gameVersion } from "../src/core/version.js";
import fs from "fs";

let warns = 0;

function warn(msg) { warns++; console.warn("⚠️", msg); }
function pass(msg) { console.log("✅", msg); }

const IMPLEMENTED_EFFECTS = new Set([
  "damage", "execute", "block", "heal", "loseHp", "draw", "gainEnergy",
  "status", "amplifyDebuffs", "poisonBurst", "thunderMark", "bleedSiphon", "shellReflect",
  "recoverDiscard", "cleanse", "spikeBurst", "doubleBlock"
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
const SHOP_EFFECT_TYPES = new Set(["maxEnergy","maxHp","rareCard","relic","heal","handLimit","deckLimit","energy","draw","gold","cleanse"]);
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

// Summary
if (warns === 0) {
  console.log("\n🎉 All checks passed!");
} else {
  console.log(`\n⚠️ ${warns} warning(s) found`);
}
process.exit(warns > 0 ? 1 : 0);
