/**
 * 物理流派强化模拟器 — 100 局战斗评估
 * 用法: node scripts/simulate.mjs
 */
import { cards, enemies, statusInfo } from "../src/core/data.js";
import { addStatus, clearStatus, getStatus, statusStacks } from "../src/core/status.js";

const SEED = 42;
const RUNS = 100;

/* 模拟用的简化战斗引擎 */
function nextSeed(s) { return (s * 1664525 + 1013904223) >>> 0; }
function rand(s) { const ns = nextSeed(s); return { seed: ns, value: ns / 2 ** 32 }; }

function createFighter(name, maxHp) {
  return { uid: name, name, hp: maxHp, maxHp, block: 0, statuses: [] };
}

function applyCardDamage(target, baseDamage, cardStyle, furyStacks) {
  if (target.hp <= 0) return 0;
  const fury = cardStyle === "physical" ? furyStacks : 0;
  let damage = baseDamage + fury * 3;
  const blocked = Math.min(target.block, damage);
  target.block -= blocked;
  damage -= blocked;
  target.hp = Math.max(0, target.hp - damage);
  return damage;
}

function simulateCombat(seed, deck, enemyCfg, turns = 4) {
  let s = seed;
  const enemy = createFighter(enemyCfg.name, enemyCfg.maxHp);
  const player = createFighter("player", 60);

  let fury = 0;
  let totalDamage = 0;
  let totalFuryDamage = 0;
  let executes = 0;
  let executeDidKill = 0;
  let furyRounds = 0;

  for (let turn = 1; turn <= turns; turn++) {
    if (enemy.hp <= 0) break;

    // 每回合随机打出手牌（模拟 1-3 张物理牌）
    const cardsPlayed = 1 + Math.floor((({seed:s,value:rand(s).value}).value) * 3);
    s = rand(s).seed;

    for (let i = 0; i < cardsPlayed; i++) {
      if (enemy.hp <= 0) break;
      const card = pickCard(deck, s);
      s = rand(s).seed;

      if (card.style === "physical" && card.type === "execute") {
        const threshold = card.threshold ?? 0.25;
        if (enemy.hp <= enemy.maxHp * threshold && enemy.hp > 0) {
          enemy.block = 0;
          enemy.hp = 0;
          executes++;
          executeDidKill++;
          continue;
        }
        // fallback damage
        const dmg = applyCardDamage(enemy, card.damage, card.style, fury);
        totalDamage += dmg;
        if (card.style === "physical") totalFuryDamage += Math.min(fury * 3, dmg);
        continue;
      }

      const dmg = applyCardDamage(enemy, card.damage, card.style, fury);
      totalDamage += dmg;
      if (card.style === "physical") totalFuryDamage += Math.min(fury * 3, dmg);

      // 战意激荡触发：获得 4 层杀意
      if (card.id === "battleSurge" && fury === 0) {
        fury = 4;
        furyRounds = 4;
      }
    }

    // 回合结束衰减
    if (fury > 0) {
      fury = Math.max(0, fury - 1);
      furyRounds = Math.max(0, furyRounds - 1);
    }
  }

  return {
    win: enemy.hp <= 0,
    enemyName: enemyCfg.name,
    enemyMaxHp: enemyCfg.maxHp,
    enemyRemainingHp: enemy.hp,
    totalDamage,
    totalFuryDamage,
    executes,
    executeDidKill,
    furyRounds,
    finalFury: fury,
  };
}

function pickCard(deck, seed) {
  const r = ((seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  return deck[Math.floor(r * deck.length)];
}

/* ====== 牌组定义 ====== */

// 基础物理牌组（无新牌）
const basePhysicalDeck = [
  { id: "heavySlash", name: "重斩", style: "physical", damage: 10, type: "damage" },
  { id: "heavySlash", name: "重斩", style: "physical", damage: 10, type: "damage" },
  { id: "chainBlade", name: "连环刃", style: "physical", damage: 5, type: "damage" },
  { id: "traceCutter", name: "追痕斩", style: "physical", damage: 9, type: "damage" },
  { id: "armyBreaker", name: "破军三式", style: "physical", damage: 14, type: "damage" },
];

// 强化物理牌组（含新牌）
const enhancedPhysicalDeck = [
  { id: "battleSurge", name: "战意激荡", style: "physical", damage: 0, type: "status" },
  { id: "heavySlash", name: "重斩", style: "physical", damage: 10, type: "damage" },
  { id: "heavySlash", name: "重斩", style: "physical", damage: 10, type: "damage" },
  { id: "chainBlade", name: "连环刃", style: "physical", damage: 5, type: "damage" },
  { id: "soulSever", name: "斩魂式", style: "physical", damage: 25, type: "execute", threshold: 0.25 },
];

/* ====== 测试敌人 ====== */
const testEnemies = [
  { name: "小妖(早期)", maxHp: 22 },
  { name: "狐妖(早期)", maxHp: 28 },
  { name: "山魈(中期)", maxHp: 34 },
  { name: "铁尸(中期)", maxHp: 45 },
  { name: "水鬼(中期)", maxHp: 30 },
  { name: "黑山老妖(Boss)", maxHp: 160 },
];

/* ====== 主程序 ====== */
console.log("=".repeat(60));
console.log("物理流派强化评估 — 100 局模拟");
console.log("=".repeat(60));

let seed = SEED;

for (const enemy of testEnemies) {
  const baseResults = [];
  const enhancedResults = [];
  let enemySeed = seed + enemy.maxHp * 7;

  for (let i = 0; i < RUNS; i++) {
    enemySeed = nextSeed(enemySeed);
    const r1 = simulateCombat(enemySeed, basePhysicalDeck, enemy, 4);
    enemySeed = nextSeed(enemySeed);
    const r2 = simulateCombat(enemySeed, enhancedPhysicalDeck, enemy, 4);
    baseResults.push(r1);
    enhancedResults.push(r2);
  }

  const baseWins = baseResults.filter(r => r.win).length;
  const enhWins = enhancedResults.filter(r => r.win).length;
  const baseAvgDmg = baseResults.reduce((s, r) => s + r.totalDamage, 0) / RUNS;
  const enhAvgDmg = enhancedResults.reduce((s, r) => s + r.totalDamage, 0) / RUNS;
  const enhFuryTotal = enhancedResults.reduce((s, r) => s + r.totalFuryDamage, 0);
  const enhFuryAvg = enhancedResults.filter(r => r.totalFuryDamage > 0).length;
  const enhExecTotal = enhancedResults.reduce((s, r) => s + r.executes, 0);
  const enhExecKill = enhancedResults.reduce((s, r) => s + r.executeDidKill, 0);

  console.log(`\n--- ${enemy.name} (${enemy.maxHp} HP) ---`);
  console.log(`  基础牌组: 胜率 ${(baseWins / RUNS * 100).toFixed(0)}% | 均伤 ${baseAvgDmg.toFixed(1)}`);
  console.log(`  强化牌组: 胜率 ${(enhWins / RUNS * 100).toFixed(0)}% | 均伤 ${enhAvgDmg.toFixed(1)}`);
  console.log(`  杀意触发局: ${enhFuryAvg}/${RUNS} | 杀意总额外: ${enhFuryTotal}`);
  console.log(`  斩魂式触发: ${enhExecTotal} | 斩杀成功: ${enhExecKill}`);
  console.log(`  伤害提升: ${((enhAvgDmg - baseAvgDmg) / Math.max(1, baseAvgDmg) * 100).toFixed(1)}%`);
}

/* ====== 杀意数值专项分析 ====== */
console.log("\n" + "=".repeat(60));
console.log("杀意叠层专项分析");
console.log("=".repeat(60));

// 模拟一局典型的 4 回合物理战斗，追踪杀意贡献
function furyTrace(deck, enemyHp, turns) {
  let s = SEED + 999;
  const enemy = createFighter("测试目标", enemyHp);
  let fury = 0;
  const trace = [];

  for (let turn = 1; turn <= turns; turn++) {
    if (enemy.hp <= 0) break;
    let turnDamage = 0;
    let turnFuryBonus = 0;
    const cardsThisTurn = [];

    // 模拟打出所有牌（带战意激荡优先）
    const surgeFirst = [...deck].sort((a, b) => (b.id === "battleSurge" ? 1 : 0) - (a.id === "battleSurge" ? 1 : 0));
    for (const card of surgeFirst) {
      if (enemy.hp <= 0) break;

      if (card.id === "battleSurge") {
        fury = 4;
        cardsThisTurn.push("战意激荡(+4杀意)");
        continue;
      }

      if (card.type === "execute") {
        if (enemy.hp <= enemy.maxHp * (card.threshold ?? 0.25)) {
          cardsThisTurn.push("斩魂式(斩杀!)");
          enemy.hp = 0;
          break;
        }
        cardsThisTurn.push("斩魂式(非斩杀)");
      }

      const furyPart = card.style === "physical" ? fury * 3 : 0;
      let dmg = card.damage + furyPart;
      const blocked = Math.min(enemy.block || 0, dmg);
      dmg -= blocked;
      enemy.hp = Math.max(0, enemy.hp - dmg);
      turnDamage += dmg;
      turnFuryBonus += Math.min(furyPart, dmg);
      cardsThisTurn.push(`${card.name}(${card.damage}${fury > 0 ? "+" + furyPart : ""})`);
    }

    trace.push({ turn, fury, turnDamage, turnFuryBonus, cards: cardsThisTurn.join(", "), enemyHp: enemy.hp });
    fury = Math.max(0, fury - 1);
  }

  return trace;
}

const trace = furyTrace(enhancedPhysicalDeck, 80, 4);
for (const t of trace) {
  console.log(`  回合${t.turn}: 杀意=${t.fury} | 伤害=${t.turnDamage} | 杀意贡献=${t.turnFuryBonus} | 敌血=${t.enemyHp}`);
  console.log(`    出牌: ${t.cards}`);
}

console.log("\n" + "=".repeat(60));
console.log("评估结论");
console.log("=".repeat(60));
