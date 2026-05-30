import { addStatus } from "./status.js";

function combatLog(state, msg) { state.run?.combat?.log?.push(msg); }

export function onEnemyKilled(state, enemy) {
  const run = state.run;
  const combat = run?.combat;
  if (!run || !combat || combat.flags[`killed_${enemy.uid}`]) return;

  combat.flags[`killed_${enemy.uid}`] = true;
  combatLog(state, `${enemy.name} 被击败。`);

  if (run.relics.includes("bloodGourd") && !combat.flags.bloodGourdUsed) {
    run.hp = Math.min(run.maxHp, run.hp + 5);
    combat.flags.bloodGourdUsed = true;
    combatLog(state, "血葫芦回涌，回复 5 点生命。");
  }

  if (run.relics.includes("ghostLantern")) {
    for (const other of (combat.enemies ?? [])) {
      if (other.hp > 0) addStatus(other, "curse", 2);
    }
    combatLog(state, "引魂灯摇动，余敌皆染诅咒 2。");
  }
}
