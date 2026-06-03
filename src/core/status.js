import { statusInfo } from "./data.js";

const STATUS_CAPS = {
  spirit: 12,
  battleIntent: 36,
  thunderFireMark: 3,
  bind: 18,
  brittle: 6,
  controlResist: 2,
  clearMind: 1,
};

export function statusLabel(statusId) {
  return statusInfo[statusId]?.label ?? statusId;
}

export function getStatus(fighter, statusId) {
  return fighter.statuses.find((status) => status.id === statusId);
}

export function statusStacks(fighter, statusId) {
  return getStatus(fighter, statusId)?.stacks ?? 0;
}

export function addStatus(fighter, statusId, stacks) {
  const existing = getStatus(fighter, statusId);
  if (existing) {
    existing.stacks += stacks;
    existing.fresh = (existing.fresh ?? 0) + stacks;
    clampStatus(existing);
    return;
  }

  const status = { id: statusId, stacks, fresh: stacks };
  clampStatus(status);
  fighter.statuses.push(status);
}

export function reduceStatus(fighter, statusId, stacks) {
  const existing = getStatus(fighter, statusId);
  if (!existing) return;

  existing.stacks -= stacks;
  existing.fresh = Math.min(existing.fresh ?? 0, Math.max(0, existing.stacks));
  if (existing.stacks <= 0) {
    fighter.statuses = fighter.statuses.filter((status) => status.id !== statusId);
  }
}

export function clearStatus(fighter, statusId) {
  fighter.statuses = fighter.statuses.filter((status) => status.id !== statusId);
}

export function reduceNaturalStatus(fighter, statusId, stacks = 1) {
  const existing = getStatus(fighter, statusId);
  if (!existing) return false;

  const protectedStacks = Math.min(existing.fresh ?? 0, existing.stacks);
  const decayableStacks = Math.max(0, existing.stacks - protectedStacks);
  existing.fresh = 0;

  if (decayableStacks <= 0) return false;

  reduceStatus(fighter, statusId, Math.min(stacks, decayableStacks));
  return true;
}

export function reduceNaturalConsumableDebuff(fighter, statusId, stacks = 1) {
  const existing = getStatus(fighter, statusId);
  if (!existing) return false;

  const protectedStacks = Math.min(existing.fresh ?? 0, existing.stacks);
  const decayableStacks = Math.max(0, existing.stacks - protectedStacks);
  existing.fresh = 0;

  if (decayableStacks <= 0) return false;

  return reduceConsumableDebuff(fighter, statusId, Math.min(stacks, decayableStacks));
}

export function reduceConsumableDebuff(fighter, statusId, stacks = 1) {
  if (["bleed", "poison", "chaos"].includes(statusId) && statusStacks(fighter, "stasis") > 0) {
    reduceStatus(fighter, "stasis", 1);
    return false;
  }

  reduceStatus(fighter, statusId, stacks);
  return true;
}

export function formatStatuses(statuses) {
  return statuses
    .filter((status) => status.stacks > 0)
    .map((status) => `${statusLabel(status.id)} ${status.stacks}`);
}

function clampStatus(status) {
  const cap = STATUS_CAPS[status.id];
  if (!cap) return;

  status.stacks = Math.min(status.stacks, cap);
  status.fresh = Math.min(status.fresh ?? 0, status.stacks);
}
