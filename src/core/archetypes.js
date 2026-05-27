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
  if (!card?.style) return 0.45;

  migrateArchetypes(run);
  const score = run.archetypeAffinity[card.style] ?? 0;
  const dominant = dominantArchetype(run);
  const floor = run.floor ?? 1;
  const pressure = floor >= 13 ? 0.18 : floor >= 7 ? 0.1 : 0.035;
  const dominantBonus = dominant?.style === card.style ? (floor >= 13 ? 1.32 : floor >= 7 ? 1.16 : 1.04) : 1;
  const baseWeight = styleBaseRewardWeight(run, card.style, dominant, score, floor);

  return Math.min(4.2, baseWeight * (1 + score * pressure) * dominantBonus);
}

export function shouldGuaranteeArchetype(run, tier) {
  const dominant = dominantArchetype(run);
  if (!dominant) return false;
  const threshold =
    dominant.style === "bleed"
      ? 8
      : dominant.style === "physical"
        ? 7
        : dominant.style === "shell"
          ? 10
          : dominant.style === "poison" || dominant.style === "spell"
            ? 8
            : dominant.style === "control"
              ? 10
            : 9;
  return tier >= 2 && dominant.score >= threshold;
}

export function styleLabel(styleId) {
  return styleInfo[styleId]?.label ?? styleId;
}

function styleBaseRewardWeight(run, styleId, dominant, score, floor) {
  if (styleId === "physical") {
    if (dominant?.style === "physical" && score >= 9) {
      return floor >= 13 ? 1.1 : floor >= 7 ? 0.9 : 0.6;
    }
    if (score >= 5) return 0.55;
    return 0.45;
  }

  if (styleId === "shell") {
    const lossStreak = run.lossStreak ?? 0;
    if (lossStreak >= 3) return floor >= 7 ? 0.94 : 0.72;

    if (dominant?.style === "shell" && score >= 10) {
      return floor >= 13 ? 0.92 : floor >= 7 ? 0.78 : 0.5;
    }

    if (score >= 6) return floor >= 7 ? 0.55 : 0.42;
    return 0.28;
  }

  if (styleId === "poison") {
    if (dominant?.style === "poison" && score >= 8) {
      return floor >= 13 ? 1.16 : floor >= 7 ? 1.06 : 0.68;
    }

    if (score >= 5) return floor >= 7 ? 0.8 : 0.6;
    return 0.54;
  }

  if (styleId === "spell") {
    if (dominant?.style === "spell" && score >= 8) {
      return floor >= 13 ? 1.18 : floor >= 7 ? 1.08 : 0.74;
    }

    if (score >= 5) return floor >= 7 ? 0.84 : 0.64;
    return 0.70;
  }

  if (styleId === "control") {
    if (dominant?.style === "control" && score >= 10) {
      return floor >= 13 ? 1.08 : floor >= 7 ? 0.96 : 0.52;
    }

    if (score >= 5) return floor >= 7 ? 0.72 : 0.48;
    return 0.45;
  }

  if (styleId !== "bleed") return 1;

  if (dominant?.style === "bleed" && score >= 8) {
    return floor >= 13 ? 1.18 : floor >= 7 ? 1.08 : 0.7;
  }

  if (score >= 5) return floor >= 7 ? 0.82 : 0.62;
  return 0.52;
}
