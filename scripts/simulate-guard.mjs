/**
 * 龟壳流模拟器 — 100 局
 */
const RUNS = 100;
function nextSeed(s) { return (s * 1664525 + 1013904223) >>> 0; }
function rand(s) { const ns = nextSeed(s); return { seed: ns, value: ns / 2 ** 32 }; }

function simulate(seed, deck, enemyHp, playerHp = 60) {
  let s = seed;
  let block = 0, spikes = 0, enemy = { hp: enemyHp, maxHp: enemyHp, block: 0 };
  let player = { hp: playerHp, maxHp: playerHp };
  let totalReflect = 0, totalBlock = 0, cardsPlayed = 0;
  let died = false;

  for (let t = 0; t < 4 && enemy.hp > 0 && player.hp > 0; t++) {
    // Enemy attacks first (simplified: 5-15 damage)
    const atk = 5 + Math.floor((({seed:s, value:rand(s).value}).value) * 11);
    s = rand(s).seed;
    let dmg = atk;
    if (block > 0) { const b = Math.min(block, dmg); block -= b; dmg -= b; }
    player.hp = Math.max(0, player.hp - dmg);
    if (player.hp <= 0) { died = true; break; }

    // Play all guard cards
    for (const card of deck) {
      if (enemy.hp <= 0) break;
      if (card.block) {
        block += card.block;
        totalBlock += card.block;
      }
      if (card.spikes) spikes += card.spikes;
      if (card.doubleBlock) block *= 2;
      if (card.spikeBurst && block > 0) {
        let rdmg = Math.min(block, enemy.block + enemy.hp);
        if (enemy.block > 0) { const b = Math.min(enemy.block, rdmg); enemy.block -= b; rdmg -= b; }
        enemy.hp = Math.max(0, enemy.hp - rdmg);
        totalReflect += rdmg;
      }
      cardsPlayed++;
    }

    // Spikes reflect at end of turn
    if (spikes > 0 && block > 0) {
      const reflect = Math.min(block, spikes * 3);
      if (reflect > 0 && enemy.hp > 0) {
        let rdmg = reflect;
        if (enemy.block > 0) { const b = Math.min(enemy.block, rdmg); enemy.block -= b; rdmg -= b; }
        enemy.hp = Math.max(0, enemy.hp - rdmg);
        totalReflect += rdmg;
      }
    }

    // Decay
    block = Math.max(0, block - 1);
    spikes = Math.max(0, spikes - 1);
  }

  return { win: enemy.hp <= 0 && !died, died, reflect: totalReflect, block: totalBlock };
}

const guardDeck = [
  { name: "护身咒", block: 6, spikes: 0 },
  { name: "荆棘甲", block: 5, spikes: 2 },
  { name: "蛟鳞", block: 10, spikes: 0 },
  { name: "反震诀", block: 8, spikes: 3 },
  { name: "龟甲镇岳", block: 15, spikes: 4, spikeBurst: true },
  { name: "不动明王身", block: 25, spikes: 6, doubleBlock: true },
];

const physDeck = [
  { name: "重斩", dmg: 10 },
  { name: "重斩", dmg: 10 },
  { name: "连环刃", dmg: 5 },
  { name: "战意激荡", dmg: 0 },
  { name: "破军三式", dmg: 14 },
  { name: "斩魂式", dmg: 25 },
];

// Quick physical sim
function simPhys(seed, enemyHp) {
  let s = seed, e = { hp: enemyHp }, fury = 0, dmg = 0;
  for (let t = 0; t < 4 && e.hp > 0; t++) {
    for (const c of physDeck) {
      if (e.hp <= 0) break;
      if (c.name === "战意激荡") { fury = 4; continue; }
      if (c.name === "斩魂式" && e.hp <= enemyHp * 0.25) { e.hp = 0; break; }
      let dd = c.dmg + (fury * 3);
      e.hp = Math.max(0, e.hp - dd); dmg += dd;
    }
    fury = Math.max(0, fury - 1);
  }
  return { win: e.hp <= 0, dmg };
}

console.log("=".repeat(55));
console.log("龟壳流 100 局模拟");
console.log("=".repeat(55));

const enemies = [
  { name: "中期山魈", hp: 34 },
  { name: "中期铁尸", hp: 45 },
  { name: "后期精英", hp: 80 },
  { name: "黑山老妖", hp: 160 },
];

let seed = 42;
for (const enemy of enemies) {
  const results = [], physResults = [];
  for (let i = 0; i < RUNS; i++) {
    seed = nextSeed(seed); results.push(simulate(seed, guardDeck, enemy.hp));
    physResults.push(simPhys(seed, enemy.hp));
  }
  const wins = results.filter(r => r.win).length;
  const physWins = physResults.filter(r => r.win).length;
  const deaths = results.filter(r => r.died).length;
  const avgReflect = results.reduce((s, r) => s + r.reflect, 0) / RUNS;
  const avgBlock = results.reduce((s, r) => s + r.block, 0) / RUNS;
  console.log(`\n${enemy.name} (${enemy.hp}HP):`);
  console.log(`  龟壳: ${wins}% 胜率 | 均伤(反射) ${avgReflect.toFixed(0)} | 均甲 ${avgBlock.toFixed(0)} | 阵亡 ${deaths}`);
  console.log(`  物理: ${physWins}% 胜率`);
}

console.log("\n" + "=".repeat(55));
console.log("龟壳流数值分析");
console.log("=".repeat(55));
const t = simulate(seed+1, guardDeck, 80);
console.log(`  满套对80血精英: ${t.win ? '胜' : '败'} | 反射伤 ${t.reflect} | 叠甲 ${t.block}`);
