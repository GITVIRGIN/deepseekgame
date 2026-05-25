import { styleInfo } from "./data.js";

export const STYLE_IDS = Object.keys(styleInfo);

export function createArchetypeAffinity() {
  return Object.fromEntries(STYLE_IDS.map((styleId) => [styleId, 0]));
}

export function migrateArchetypes(run) {
  run.archetypeAffinity = run.archetypeAffinity ?? {};
  for (const styleId of STYLE_IDS) {
    run.archetypeAffinity[styleId] = run.archetypeAffinity[styleId] ?? 0;
  }
  return run;
}

export function recordCardArchetype(run, card) {
  if (!card?.style) return null;

  migrateArchetypes(run);
  const gain = 2 + (card.grade ?? 1);
  run.archetypeAffinity[card.style] += gain;

  return {
    style: card.style,
    gain,
    total: run.archetypeAffinity[card.style],
  };
}

export function dominantArchetype(run) {
  migrateArchetypes(run);

  const ranked = archetypeRanking(run);
  const best = ranked[0];
  if (!best || best.score <= 0) return null;

  return best;
}

export function archetypeRanking(run) {
  migrateArchetypes(run);
  return STYLE_IDS.map((style) => ({
    style,
    score: run.archetypeAffinity[style] ?? 0,
  })).sort((left, right) => right.score - left.score);
}

export function archetypeRewardWeight(run, card) {
  if (!card?.style) return 1;

  migrateArchetypes(run);
  const score = run.archetypeAffinity[card.style] ?? 0;
  const dominant = dominantArchetype(run);
  const floor = run.floor ?? 1;
  const pressure = floor >= 13 ? 0.18 : floor >= 7 ? 0.1 : 0.035;
  const dominantBonus = dominant?.style === card.style ? (floor >= 13 ? 1.32 : floor >= 7 ? 1.16 : 1.04) : 1;
  const baseWeight = styleBaseRewardWeight(card.style, dominant, score, floor);

  return Math.min(4.2, baseWeight * (1 + score * pressure) * dominantBonus);
}

export function shouldGuaranteeArchetype(run, tier) {
  const dominant = dominantArchetype(run);
  if (!dominant) return false;
  const threshold = dominant.style === "bleed" ? 13 : 9;
  return tier >= 2 && dominant.score >= threshold;
}

export function styleLabel(styleId) {
  return styleInfo[styleId]?.label ?? styleId;
}

function styleBaseRewardWeight(styleId, dominant, score, floor) {
  if (styleId !== "bleed") return 1;

  if (dominant?.style === "bleed" && score >= 13) {
    return floor >= 13 ? 0.95 : 0.85;
  }

  if (score >= 7) return 0.72;
  return 0.52;
}
