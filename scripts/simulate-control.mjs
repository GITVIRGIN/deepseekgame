/**
 * 控制流阈值寻优 —— 200局 × 4个阈值
 */
const RUNS = 200;

function nextSeed(s) { return (s * 1664525 + 1013904223) >>> 0; }
function rand(s) { const ns = nextSeed(s); return { seed: ns, value: ns / 2 ** 32 }; }

function simFight(seed, ehp, php, threshold, energyCap = 3, maxTurns = 6) {
  let s = seed, chaos = 0, imprison = 0, curse = 0, block = 0;
  let e = ehp, p = php;

  // 控制流牌组（按费用效率排序，优先廉价控制牌）
  const deck = [
    { cost: 1, chaos: 0, imprison: 0, dmg: 7, block: 0 },  // 斩妖式 ×4
    { cost: 1, chaos: 0, imprison: 0, dmg: 7, block: 0 },
    { cost: 1, chaos: 0, imprison: 0, dmg: 7, block: 0 },
    { cost: 1, chaos: 0, imprison: 0, dmg: 7, block: 0 },
    { cost: 1, chaos: 0, imprison: 0, dmg: 0, block: 6 },  // 护身咒
    { cost: 1, chaos: 1, imprison: 0, dmg: 0, block: 0 },  // 离间符
    { cost: 1, chaos: 0, imprison: 1, dmg: 4, block: 0 },  // 缚魂索
    { cost: 2, chaos: 0, imprison: 2, dmg: 6, block: 0 },  // 锁心咒
  ];

  // 按控制效率排序
  const sorted = [...deck].sort((a, b) => (b.chaos + b.imprison) - (a.chaos + a.imprison));

  for (let t = 0; t < maxTurns; t++) {
    if (e <= 0 || p <= 0) break;

    // Soul break
    if (chaos + imprison >= threshold) { e = 0; break; }

    // Enemy intent
    const roll = ({seed: s, value: rand(s).value}).value; s = rand(s).seed;
    const intent = roll < 0.55 ? 'atk' : roll < 0.85 ? 'block' : 'status';

    // Control handling
    if (imprison > 0) {
      if (intent !== 'block') { imprison = Math.max(0, imprison - 1); continue; }
      imprison = Math.max(0, imprison - 1);
    } else if (chaos > 0) {
      chaos = Math.max(0, chaos - 1);
      continue;
    } else if (intent === 'atk') {
      let raw = 4 + Math.floor((({seed: s, value: rand(s).value}).value) * 9);
      s = rand(s).seed;
      let dmg = raw + curse;
      if (block > 0) { const b = Math.min(block, dmg); block -= b; dmg -= b; }
      p -= dmg;
      if (p <= 0) break;
    } else if (intent === 'status') {
      // enemy curses player
    }

    // Play cards: energy budget
    let energy = energyCap;
    // Try control cards first, then damage
    for (const card of [...sorted, ...deck]) {
      if (energy < card.cost || e <= 0) break;
      energy -= card.cost;
      chaos += card.chaos;
      imprison += card.imprison;
      if (card.dmg > 0) e = Math.max(0, e - (card.dmg + curse));
      if (card.block > 0) block += card.block;
    }

    // Decay
    chaos = Math.max(0, chaos - 1);
    imprison = Math.max(0, imprison - 1);
  }
  return { win: e <= 0, dead: p <= 0 };
}

function simRun(seed, threshold) {
  let s = seed;
  const floors = [22, 28, 36, 46, 58, 72, 90, 115, 150];
  let hp = 72, relics = 0;

  for (let i = 0; i < floors.length; i++) {
    const r = simFight(s, floors[i] + Math.floor((({seed: s, value: rand(s).value}).value * 4)), hp, threshold);
    s = nextSeed(s);
    if (r.dead || !r.win) return { bossKill: false, floors: i, relics };
    hp = Math.min(72, hp + 3);
    if (({seed: s, value: rand(s).value}).value < 0.25) relics++;
    s = rand(s).seed;
  }
  return { bossKill: true, floors: 9, relics };
}

// Test thresholds 4, 5, 6, 7
console.log("控制流阈值寻优 (200局 × 4阈值)");
console.log("=".repeat(50));

for (const threshold of [4, 5, 6, 7]) {
  let seed = 42 + threshold;
  let bosses = 0, specials = 0, totalFloors = 0;
  for (let i = 0; i < RUNS; i++) {
    seed = nextSeed(seed);
    const r = simRun(seed, threshold);
    if (r.bossKill) { bosses++; if (r.relics >= 2) specials++; }
    totalFloors += r.floorsCleared;
  }
  console.log(`阈值=${threshold}: Boss${(bosses/RUNS*100).toFixed(1)}% 特殊${(specials/RUNS*100).toFixed(1)}% 均层${(totalFloors/RUNS).toFixed(1)}/9`);
}
