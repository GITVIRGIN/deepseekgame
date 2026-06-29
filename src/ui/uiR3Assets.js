// uiR3Assets.js - UI R3 Xiaoxitian Seed Asset Mapper
// Only maps resource paths and visual categories. No gameplay logic.

import { assetUrl } from "./assetPath.js";

export const R3_BASE = assetUrl("/public/assets/ui-r3");

// === CARD VISUAL MAPPING ===
const cardVisualMap = {
  "sword-slash": "cards/card_attack_sword_slash_sample.png",
  "shield-guard": "cards/card_skill_shield_guard_sample.png",
  "poison-blade": "cards/card_skill_poison_blade_sample.png",
  "fire-spell": "cards/card_attack_burn_sample.png",
  "thunder-mark": "cards/card_attack_thunder_mark_sample.png",
  "blood-ritual": "cards/card_attack_blood_shadow_sample.png",
  "thorn-counter": "cards/card_skill_thorn_guard_sample.png",
  "draw-scroll": "cards/card_skill_whirlwind_step_sample.png",
  "discard-ash": "cards/card_skill_shadow_draw_sample.png",
  "fusion-dual": "cards/card_fusion_dual_sample.png",
  "fusion-triple": "cards/card_fusion_triple_sample.png",
};
const fallbackCard = "cards/card_skill_shadow_draw_sample.png";

export function r3CardArtPath(visualCategory) {
  return cardVisualMap[visualCategory] || fallbackCard;
}

export function r3CardArtUrl(visualCategory) {
  return `${R3_BASE}/${r3CardArtPath(visualCategory)}`;
}

export function r3FallbackCardArtUrl() {
  return `${R3_BASE}/${fallbackCard}`;
}

// Map card definition to visual category
export function cardVisualCategory(definition) {
  const effects = (definition.effects || []);
  // Check style first
  if (definition.style === "physical") return effects.some(e => e.type === "damage" || e.type === "execute") ? "sword-slash" : "draw-scroll";
  if (definition.style === "spell") {
    if (effects.some(e => e.type === "thunderMark" || e.status === "thunderMark")) return "thunder-mark";
    if (effects.some(e => e.status === "burn")) return "fire-spell";
    return "fire-spell";
  }
  if (definition.style === "bleed") return "blood-ritual";
  if (definition.style === "shell") {
    if (effects.some(e => e.type === "spikes" || e.status === "spikes")) return "thorn-counter";
    return "shield-guard";
  }
  if (definition.style === "poison") return "poison-blade";
  if (definition.style === "control") return "draw-scroll";
  // Check effects for hints
  if (effects.some(e => e.status === "poison")) return "poison-blade";
  if (effects.some(e => e.status === "burn")) return "fire-spell";
  if (effects.some(e => e.type === "thunderMark" || e.status === "thunderMark")) return "thunder-mark";
  if (effects.some(e => e.type === "spikes" || e.status === "spikes")) return "thorn-counter";
  if (effects.some(e => e.type === "block" || e.status === "blockShield" || e.status === "ward")) return "shield-guard";
  if (effects.some(e => e.type === "damage" || e.type === "execute")) return "sword-slash";
  if (effects.some(e => e.type === "draw" || e.type === "recoverDiscard")) return "draw-scroll";
  if (effects.some(e => e.status === "bleed")) return "blood-ritual";
  return "draw-scroll";
}

// Map enemy by name/id to archetype
export function enemyArchetype(enemy) {
  const name = (enemy.name || "").toLowerCase();
  if (name.includes("修罗") || name.includes("护法")) return "xiuluo-guardian";
  if (name.includes("虎") || name.includes("将") || name.includes("魔")) return "demon-general";
  if (name.includes("龙") || name.includes("青")) return "dragon-spirit";
  if (name.includes("蛇") || name.includes("魅")) return "serpent-spirit";
  if (name.includes("龟") || name.includes("壳") || name.includes("甲")) return "bronze-golem";
  if (name.includes("鬼") || name.includes("魂") || name.includes("妖")) return "ghost-cultivator";
  if (name.includes("剑") || name.includes("兵") || name.includes("符")) return "daoist-warrior";
  if (name.includes("鹤") || name.includes("鸟") || name.includes("羽")) return "crane-spirit";
  return "xiuluo-guardian";
}

// === STATUS/EFFECT ICON MAPPING ===
const effectIconMap = {
  burn: "effects/effect_burn_icon.png",
  bleed: "effects/effect_bleed_icon.png",
  poison: "effects/effect_poison_icon.png",
  thunderMark: "effects/effect_thunder_icon.png",
  spikes: "effects/effect_thorn_icon.png",
  blockShield: "effects/effect_shield_icon.png",
  ward: "effects/effect_shield_icon.png",
  shield: "effects/effect_shield_icon.png",
  block: "effects/effect_block_icon.png",
  bind: "effects/effect_bind_icon.png",
  weak: "effects/effect_weak_icon.png",
  vulnerable: "effects/effect_vulnerable_icon.png",
  strength: "effects/effect_strength_icon.png",
  agility: "effects/effect_agility_icon.png",
  draw: "effects/effect_draw_icon.png",
  discard: "effects/effect_discard_icon.png",
  gatherAsh: "effects/effect_gatherash_icon.png",
  chaos: "effects/effect_discard_icon.png",
  stun: "effects/effect_bind_icon.png",
  thunderFireMark: "effects/effect_thunder_icon.png",
  stasis: "effects/effect_block_icon.png",
  curse: "effects/effect_weak_icon.png",
  spirit: "effects/effect_burn_icon.png",
  battleIntent: "effects/effect_strength_icon.png",
  brittle: "effects/effect_vulnerable_icon.png",
  controlResist: "effects/effect_shield_icon.png",
  clearMind: "effects/effect_agility_icon.png",
  trueMartial: "effects/effect_true_martial_icon.png",
  dualFusion: "effects/effect_dual_fusion_a_icon.png",
  tripleFusion: "effects/effect_triple_fusion_icon.png",
  thunderJie: "effects/effect_thunder_jie_icon.png",
};

export function r3EffectIconUrl(statusId) {
  const path = effectIconMap[statusId];
  return path ? `${R3_BASE}/${path}` : null;
}

// Large effects
const largeEffectMap = {
  burn: "effects/effect_burn_large.png",
  bleed: "effects/effect_bleed_icon.png",
  poison: "effects/effect_poison_large.png",
  thunderMark: "effects/effect_thunder_large.png",
  spikes: "effects/effect_thorn_large.png",
  block: "effects/effect_block_large.png",
  shield: "effects/effect_block_large.png",
};
export function r3LargeEffectUrl(statusId) {
  const path = largeEffectMap[statusId];
  return path ? `${R3_BASE}/${path}` : null;
}

// === BACKGROUND MAPPING ===
export const R3_BACKGROUNDS = {
  combat: `${R3_BASE}/backgrounds/bg_combat_xiaoxitian_hall.png`,
  reward: `${R3_BASE}/backgrounds/bg_reward_altar.png`,
  gatherAsh: `${R3_BASE}/backgrounds/bg_gatherash_talisman_altar.png`,
};

// === PANEL MAPPING ===
export const R3_PANELS = {
  battleLog: `${R3_BASE}/panels/panel_battle_log_scroll.png`,
  handArea: `${R3_BASE}/panels/panel_hand_area_card_slots.png`,
  rewardShrine: `${R3_BASE}/panels/panel_reward_shrine.png`,
  gatherAshAltar: `${R3_BASE}/panels/panel_gatherash_altar.png`,
  buttonStrip: `${R3_BASE}/buttons/button_strip_xiaoxitian.png`,
  iconStrip: `${R3_BASE}/panels/icon_strip_core_ui.png`,
};

// === FALLBACK STATISTICS ===
export function mappingStats() {
  return {
    cardSamples: Object.keys(cardVisualMap).length,
    cardFallbackKey: fallbackCard,
    enemySamples: Object.keys(enemyVisualMap).length,
    enemyFallbackKey: fallbackEnemy,
    effectIconMappings: Object.keys(effectIconMap).length,
    largeEffectMappings: Object.keys(largeEffectMap).length,
    backgrounds: Object.keys(R3_BACKGROUNDS).length,
    panels: Object.keys(R3_PANELS).length,
  };
}
