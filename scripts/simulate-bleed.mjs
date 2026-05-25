/**
 * 血魔流模拟器 — 100 局战斗评估
 * 用法: node scripts/simulate-bleed.mjs
 */
const RUNS = 100;

function nextSeed(s) { return (s * 1664525 + 1013904223) >>> 0; }
function rand(s) { const ns = nextSeed(s); return { seed: ns, value: ns / 2 ** 32 }; }

function createFighter(name, maxHp) {
  return { uid: name, name, hp: maxHp, maxHp, block: 0, statuses: [], fresh: {} };
}

function addStatus(f, id, stacks) {
  const existing = f.statuses.find(s => s.id === id);
  if (existing) { existing.stacks += stacks; return; }
  f.statuses.push({ id, stacks });
}

function statusStacks(f, id) { return f.statuses.find(s => s.id === id)?.stacks ?? 0; }

/* 模拟一次 4 回合战斗 */
function simulateFight(seed, deck, enemyHp, playerMaxHp = 60) {
  let s = seed;
  const enemy = createFighter("boss", enemyHp);
  const player = createFighter("player", playerMaxHp);
  let bleed = 0;
  let totalDmg = 0, totalHeal = 0, totalCost = 0, cardsPlayed = 0;
  let diedToSelf = false;

  for (let t = 0; t < 4 && enemy.hp > 0 && player.hp > 0; t++) {
    // Play all cards each turn (simplified: no energy limit)
    for (const card of deck) {
      if (enemy.hp <= 0 || player.hp <= 0) break;

      // Apply HP cost
      if (card.loseHp) {
        player.hp -= card.loseHp;
        totalCost += card.loseHp;
        if (player.hp <= 0) { diedToSelf = true; break; }
      }

      // Apply damage
      if (card.damage) {
        let dmg = card.damage;
        if (enemy.block > 0) { const b = Math.min(enemy.block, dmg); enemy.block -= b; dmg -= b; }
        enemy.hp = Math.max(0, enemy.hp - dmg);
        totalDmg += card.damage;
        // Bleed proc on attack
        if (bleed > 0 && enemy.hp > 0) {
          let bdmg = bleed;
          if (enemy.block > 0) { const b = Math.min(enemy.block, bdmg); enemy.block -= b; bdmg -= b; }
          enemy.hp = Math.max(0, enemy.hp - bdmg);
          bleed -= 1;
        }
      }

      // Apply bleed
      if (card.bleed) {
        bleed += card.bleed;
      }

      // Apply leech
      if (card.leech && bleed > 0) {
        const heal = Math.floor(bleed * card.leech);
        player.hp = Math.min(playerMaxHp, player.hp + heal);
        totalHeal += heal;
      }

      cardsPlayed++;
    }

    // Turn end: bleed tick
    if (enemy.hp > 0 && bleed > 0) {
      let bdmg = bleed;
      if (enemy.block > 0) { const b = Math.min(enemy.block, bdmg); enemy.block -= b; bdmg -= b; }
      enemy.hp = Math.max(0, enemy.hp - bdmg);
      bleed = Math.max(0, bleed - 1);
    }
  }

  return {
    win: enemy.hp <= 0 && player.hp > 0,
    diedToSelf,
    enemyHp: enemy.hp,
    playerHp: player.hp,
    totalDmg, totalHeal, totalCost,
    netHp: totalHeal - totalCost,
    bleed,
    cardsPlayed,
  };
}

/* 基础流血牌组 (旧版) */
const oldBleedDeck = [
  { name: "血针", damage: 3, bleed: 4, loseHp: 0, leech: 0 },
  { name: "血网", damage: 0, bleed: 5, loseHp: 0, leech: 0 },
  { name: "血河倒卷", damage: 12, bleed: 10, loseHp: 0, leech: 0 },
  { name: "阿修罗血誓", damage: 10, bleed: 12, loseHp: 4, leech: 0 },
];

/* 血魔流牌组 (新版) */
const newBleedDeck = [
  { name: "血针", damage: 3, bleed: 4, loseHp: 0, leech: 0 },
  { name: "血网", damage: 0, bleed: 5, loseHp: 2, leech: 0.25 },
  { name: "血河倒卷", damage: 12, bleed: 10, loseHp: 4, leech: 0.4 },
  { name: "阿修罗血誓", damage: 10, bleed: 12, loseHp: 6, leech: 0.5 },
];

console.log("=".repeat(60));
console.log("血魔流改造评估 — 流血牌组 100 局模拟");
console.log("=".repeat(60));

const enemies = [
  { name: "中期山魈", hp: 34 },
  { name: "中期铁尸", hp: 45 },
  { name: "后期精英", hp: 80 },
  { name: "黑山老妖", hp: 160 },
];

let seed = 42;
for (const enemy of enemies) {
  const old = [], neo = [];
  for (let i = 0; i < RUNS; i++) {
    seed = nextSeed(seed);
    old.push(simulateFight(seed, oldBleedDeck, enemy.hp, 60));
    seed = nextSeed(seed);
    neo.push(simulateFight(seed, newBleedDeck, enemy.hp, 60));
  }

  const oldWin = old.filter(r => r.win).length;
  const newWin = neo.filter(r => r.win).length;
  const oldSelfDeath = old.filter(r => r.diedToSelf).length;
  const newSelfDeath = neo.filter(r => r.diedToSelf).length;
  const newNetHp = neo.reduce((s, r) => s + r.netHp, 0) / RUNS;
  const newHeal = neo.reduce((s, r) => s + r.totalHeal, 0) / RUNS;
  const newCost = neo.reduce((s, r) => s + r.totalCost, 0) / RUNS;
  const positiveRuns = neo.filter(r => r.netHp > 0).length;

  console.log(`\n--- ${enemy.name} (${enemy.hp} HP) ---`);
  console.log(`  旧版胜率: ${(oldWin/RUNS*100).toFixed(0)}% | 自鲨: ${oldSelfDeath}`);
  console.log(`  新版胜率: ${(newWin/RUNS*100).toFixed(0)}% | 自鲨: ${newSelfDeath}`);
  console.log(`  新版均HP消耗: ${newCost.toFixed(1)} | 均吸血: ${newHeal.toFixed(1)} | 净HP: ${newNetHp.toFixed(1)}`);
  console.log(`  净正收益局: ${positiveRuns}/${RUNS} (${(positiveRuns/RUNS*100).toFixed(0)}%)`);
  if (newSelfDeath > 0) console.log(`  ⚠ 自鲨而死 ${newSelfDeath} 局 — 血魔的高风险`);
}

/* 流血阈值分析 */
console.log("\n" + "=".repeat(60));
console.log("吸血盈亏阈值分析");
console.log("=".repeat(60));

const thresholds = [
  { card: "血网", cost: 2, leech: 0.25 },
  { card: "凝血成碑", cost: 3, leech: 0.3 },
  { card: "血河倒卷", cost: 4, leech: 0.4 },
  { card: "阿修罗血誓", cost: 6, leech: 0.5 },
];

for (const t of thresholds) {
  const breakEven = Math.ceil(t.cost / t.leech);
  const cycle = Math.ceil(t.cost * 2 / t.leech);
  console.log(`  ${t.card}: 消耗${t.cost}HP ×${t.leech} → 回本@${breakEven}层流血 | 循环@${cycle}层流血`);
}
