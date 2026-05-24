import { tierForFloor } from "./nodes.js";

export function goldDropForNode(run) {
  const node = run.currentNode;
  const tier = node?.tier ?? tierForFloor(run.floor);

  if (node?.type === "side") {
    return 18 + tier * 9;
  }

  if (node?.rewardKind === "tierPremium") {
    return 16 + tier * 7;
  }

  return 10 + tier * 5;
}

export function grantGoldDrop(state) {
  const run = state.run;
  if (!run || run.finished) return state;

  const gold = goldDropForNode(run);
  run.gold += gold;
  run.lastGoldDrop = gold;
  run.combat?.log.push(`本关掉落 ${gold} 金。`);
  return state;
}
