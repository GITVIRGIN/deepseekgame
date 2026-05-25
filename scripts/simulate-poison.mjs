/**
 * 中毒虚弱流 — 综合模拟
 * 指标：胜率 / Boss通关 / 特殊通关(2遗物) / 平均存活回合
 */
import { cards } from "../src/core/data.js";

const RUNS = 200;
function nextSeed(s) { return (s * 1664525 + 1013904223) >>> 0; }

function rand(s) { const ns = nextSeed(s); return { seed: ns, value: ns / 2 ** 32 }; }

/* 毒瘴流战斗模拟 */
function simPoisonFight(seed, enemyHp, playerHp = 60, maxTurns = 8) {
  let s = seed;
  let ehp = enemyHp, php = playerHp;
  let poison = 0, block = 0;
  let totalReflect = 0;
  let turnsSurvived = 0, dead = false;

  // 精简毒牌组（带费用）
  const deck = [
    { name: "毒粉", cost: 1, dmg: 0, poison: 5 },
    { name: "毒粉", cost: 1, dmg: 0, poison: 5 },
    { name: "蜈蚣蛊坛", cost: 1, dmg: 6, poison: 8 },
    { name: "千毒入梦", cost: 2, dmg: 0, poison: 10 },
    { name: "万蛊王令", cost: 3, dmg: 0, poison: 15 },
  ];

  for (let t = 0; t < maxTurns; t++) {
    if (ehp <= 0 || php <= 0) break;
    turnsSurvived = t + 1;

    // Enemy attacks (with poison weaken)
    const baseAtk = 5 + Math.floor((({seed: s, value: rand(s).value}).value) * 14);
    s = rand(s).seed;
    const reduction = Math.min(Math.floor(poison * 0.5), Math.floor(baseAtk * 0.7));
    const atk = Math.max(1, baseAtk - reduction);
    let dmg = atk;
    if (block > 0) { const b = Math.min(block, dmg); block -= b; dmg -= b; }
    php -= dmg;
    if (php <= 0) { dead = true; break; }

    // Play cards (energy=3)
    let energy = 3;
    for (const c of deck) {
      if (energy < c.cost || ehp <= 0) break;
      energy -= c.cost;
      if (c.dmg > 0) {
        ehp = Math.max(0, ehp - c.dmg);
      }
      poison += c.poison;
    }

    // Poison tick
    if (poison > 0 && ehp > 0) {
      ehp = Math.max(0, ehp - poison);
      poison = Math.max(0, poison - 1);
    }
  }

  return { win: ehp <= 0, dead, turnsSurvived, finalPoison: poison, ehp, php };
}

function simFullRun(seed) {
  let s = seed;
  const floors = [22, 28, 34, 45, 60, 80, 100, 120, 140, 160]; // 10 floors
  let relics = 0;
  let totalTurns = 0;

  for (let i = 0; i < floors.length; i++) {
    const enemyHp = floors[i] + Math.floor(i * 3); // difficulty scaling
    const result = simPoisonFight(s, enemyHp, 60 - totalTurns * 2, 6);
    s = nextSeed(s);
    
    if (result.dead) {
      return { 
        bossKill: false, specialClear: false,
        floorsCleared: i, turnsTotal: totalTurns + result.turnsSurvived,
        relics
      };
    }
    
    totalTurns += result.turnsSurvived;
    
    // Reward: ~30% chance for relic per floor
    const roll = ({seed: s, value: rand(s).value}).value;
    s = rand(s).seed;
    if (roll < 0.3 && relics < 5) relics++;
    
    if (i === floors.length - 1 && result.win) {
      return {
        bossKill: true, specialClear: relics >= 2,
        floorsCleared: floors.length, turnsTotal: totalTurns,
        relics
      };
    }
  }
  
  return {
    bossKill: false, specialClear: false,
    floorsCleared: floors.length - 1, turnsTotal: totalTurns, relics
  };
}

let seed = 42;
const results = [];
for (let i = 0; i < RUNS; i++) {
  seed = nextSeed(seed);
  results.push(simFullRun(seed));
}

const bossWins = results.filter(r => r.bossKill).length;
const specialWins = results.filter(r => r.specialClear).length;
const avgFloors = results.reduce((s,r) => s + r.floorsCleared, 0) / RUNS;
const avgTurns = results.reduce((s,r) => s + r.turnsTotal, 0) / RUNS;

console.log("=".repeat(55));
console.log("中毒虚弱流 综合模拟 (200局)");
console.log("=".repeat(55));
console.log(`  Boss通关率: ${bossWins}/${RUNS} = ${(bossWins/RUNS*100).toFixed(1)}%`);
console.log(`  特殊通关率: ${specialWins}/${RUNS} = ${(specialWins/RUNS*100).toFixed(1)}%`);
console.log(`  平均推进层数: ${avgFloors.toFixed(1)}/10`);
console.log(`  平均存活回合: ${avgTurns.toFixed(1)}`);

// 死因统计
const deaths = results.filter(r => !r.bossKill);
const earlyDeaths = deaths.filter(r => r.floorsCleared < 3).length;
const midDeaths = deaths.filter(r => r.floorsCleared >= 3 && r.floorsCleared < 7).length;
const lateDeaths = deaths.filter(r => r.floorsCleared >= 7).length;
console.log(`\n  死因分布: 早期${earlyDeaths} | 中期${midDeaths} | 后期${lateDeaths}`);
