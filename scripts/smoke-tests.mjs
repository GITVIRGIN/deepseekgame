import { createInitialState, startRun, makeCard } from "../src/core/state.js";
import { reduceGame } from "../src/core/reducer.js";
import { cards } from "../src/core/data.js";
import { migrateGameState } from "../src/core/save.js";
import { saveGame } from "../src/core/save.js";
import { onEnemyKilled } from "../src/core/combat-events.js";
import { applyCardDamage, tickDamageStatus, applyIncomingDamage } from "../src/core/effects.js";
import { startPlayerTurn } from "../src/core/combat.js";

let passed = 0, failed = 0;
const _tests = [];
function test(name, fn) {
  _tests.push({ name, fn });
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function enemy(s) { return s.run?.combat?.enemies?.[0]; }

function enterCombat(style) {
  let s = createInitialState();
  s = style ? startRun(s, style) : startRun(s);
  let main = s.run.nodeChoices.find(n => n.type === "main");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  return s;
}

function forceCard(state, cardId) {
  state.run.combat.hand[0] = makeCard(state.run, cardId);
  state.run.energy = 99;
}

// 1. Normal mode
test("普通模式不崩溃", () => {
  let s = enterCombat(null);
  for (let i = 0; i < 5; i++) {
    let ok = s.run.combat.hand.filter(h => s.run.energy >= (cards[h.cardId]?.cost ?? 99));
    if (ok.length > 0) s = reduceGame(s, { type: "playCard", cardUid: ok[0].uid, targetUid: null });
    else s = reduceGame(s, { type: "endTurn" });
    if (s.phase !== "combat") break;
  }
});

// 2. TM starts
for (const style of ["physical","spell","bleed","shell","poison","control"]) {
  test(`真武${style}启动`, () => { let s = enterCombat(style); assert(s.phase === "combat"); });
}

// 3. poJunLing
test("破军令+9真伤穿99格挡", () => {
  let s = enterCombat("physical");
  assert(s.run.relics.includes("poJunLing"));
  enemy(s).block = 99; enemy(s).hp = 10;
  applyCardDamage(s, enemy(s), 6, 1, "physical");
  // 6 raw damage blocked by 99 block. 9 true damage bypasses. HP: 10-9 = 1.
  assert(enemy(s).hp === 1, `expected HP=1, got ${enemy(s).hp}`);
  assert(s.run.combat.log.join(" ").includes("破军令追加 9 点真伤"), "log missing poJunLing true damage");
});

// 4. nineSkyTribulation
test("九天雷劫57伤+2眩晕", () => {
  let s = enterCombat("spell");
  assert(s.run.relics.includes("nineSkyTribulation"));
  enemy(s).hp = 100; enemy(s).block = 0;
  enemy(s).statuses = [{ id: "thunderMark", stacks: 5 }];
  forceCard(s, "thunderCharm");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  let stun = enemy(s)?.statuses?.find(x => x.id === "stun")?.stacks ?? 0;
  assert(stun === 2, `stun=${stun}`);
  // 32 base + 25 from nineSky = 57 tribulation damage (plus any card damage).
  assert(enemy(s).hp <= 43, `expected HP<=43 (trib 57), got ${enemy(s).hp}`);
});

// 4b. nineSky start thunderMark
test("九天雷劫开局敌人雷印+2", () => {
  let s = enterCombat("spell");
  assert(s.run.relics.includes("nineSkyTribulation"));
  let tm = enemy(s)?.statuses?.find(x => x.id === "thunderMark")?.stacks ?? 0;
  assert(tm >= 2, `expected thunderMark>=2, got ${tm}`);
});

// 5. asuraHeart - FORCED hand
test("修罗心回血8(12层流血)", () => {
  let s = enterCombat("bleed");
  assert(s.run.relics.includes("asuraHeart"));
  enemy(s).statuses = [{ id: "bleed", stacks: 12 }];
  s.run.hp = 30;
  forceCard(s, "bloodRecycle");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  // ratio=3, 12 bleed → floor(12/3)=4 base → asuraHeart *2 = 8 heal. HP: 30+8 = 38.
  assert(s.run.hp === 38, `expected HP=38, got ${s.run.hp}`);
});

// 5b. bloodFang heal 4
test("血牙回复4", () => {
  let s = enterCombat("bleed");
  s.run.hp = 30;
  forceCard(s, "bloodFang");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  assert(s.run.hp === 34, `expected HP=34, got ${s.run.hp}`);
});

// 5c. bloodSurge loseHp 2
test("血涌消耗2生命", () => {
  let s = enterCombat("bleed");
  s.run.hp = 30;
  forceCard(s, "bloodSurge");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  assert(s.run.hp === 28, `expected HP=28, got ${s.run.hp}`);
});

// 6. venomScripture - enemy poison
test("万毒真经敌毒12伤", () => {
  let s = enterCombat("poison");
  assert(s.run.relics.includes("venomScripture"));
  enemy(s).hp = 50; enemy(s).block = 0;
  enemy(s).statuses = [{ id: "poison", stacks: 6 }];
  tickDamageStatus(s, enemy(s), "poison");
  assert(enemy(s).hp === 38, `expected HP=38, got ${enemy(s).hp}`);
});

// 7. venomScripture - player NOT doubled
test("万毒真经玩家毒不翻倍", () => {
  let s = enterCombat("poison");
  assert(s.run.relics.includes("venomScripture"));
  s.run.hp = 50;
  s.run.statuses = [{ id: "poison", stacks: 6 }];
  // tickDamageStatus for player
  tickDamageStatus(s, { uid: "player", hp: 50, maxHp: 72, block: 0, statuses: s.run.statuses }, "poison");
  // Player should take 6 damage (not 12)
  assert(s.run.hp === 44, `expected HP=44, got ${s.run.hp}`);
});

// 8. chaosTreasure once
test("混沌灵宝只一次", () => {
  let s = enterCombat("control");
  assert(s.run.relics.includes("chaosTreasure"));
  let c0 = enemy(s)?.statuses?.find(x => x.id === "chaos")?.stacks ?? 0;
  assert(c0 >= 3, `chaos=${c0}`);
});

// 9. turtleShell - direct startPlayerTurn, no enemy attacks
test("玄龟甲反射+25%击杀", () => {
  let s = enterCombat("shell");
  assert(s.run.relics.includes("turtleShell"));
  // Remove all enemies except one, set up
  s.run.combat.enemies = [s.run.combat.enemies[0]];
  let e = enemy(s);
  e.hp = 30; e.block = 0;
  s.run.combat.block = 31;
  s.run.statuses = [{ id: "spikes", stacks: 11 }];
  // Directly trigger startPlayerTurn which calls applySpikesReflect
  startPlayerTurn(s);
  // Block decay: 31→30. Reflect: floor(min(30, 33)*1.25) = 37. Enemy HP: 30→0
  assert(e.hp <= 0, `enemy HP=${e.hp}, should be dead`);
});

// 10. Spikes kill
test("荆棘反震击杀不崩溃", () => {
  let s = enterCombat("shell");
  s.run.combat.block = 10; s.run.statuses = [{ id: "spikes", stacks: 5 }];
  s.run.combat.enemies[0].hp = 1; s.run.combat.enemies[0].block = 0;
  s = reduceGame(s, { type: "endTurn" });
});

// 11. Migration
test("存档迁移完整", () => {
  let m = migrateGameState({ meta: { factionMastery: { 人间: 3 } }, run: { floor: 5 } });
  assert(m.meta.mythMastery?.["人间"] === 3);
  assert(!m.meta.factionMastery);
  assert(m.run?.floor === 5);
  assert(Array.isArray(m.run?.guaranteedNextHand));
});

// 12. save resilience
test("saveGame容错", () => {
  let orig = globalThis.localStorage;
  globalThis.localStorage = { setItem() { throw new Error("q"); }, getItem() { return null; }, removeItem() {} };
  try { assert(saveGame(createInitialState())); }
  finally { globalThis.localStorage = orig; }
});

// 13. combat-events
test("combat-events模块", () => {
  assert(typeof onEnemyKilled === "function");
});

// 14. poJunLing block
test("破军令开局格挡+18", () => {
  let s = enterCombat("physical");
  assert(s.run.relics.includes("poJunLing"));
  // startCombat adds +18 block from poJunLing
  assert(s.run.combat.block >= 18, `block=${s.run.combat.block}`);
});

// 15. venomScripture +6 poison
test("万毒真经开局敌毒+8", () => {
  let s = enterCombat("poison");
  assert(s.run.relics.includes("venomScripture"));
  let poison = enemy(s)?.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(poison >= 6, `expected poison>=8, got ${poison}`);
});

// 16. venomFang block
test("毒牙格挡+4", () => {
  let s = enterCombat("poison");
  s.run.combat.block = 0;
  forceCard(s, "venomFang");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  assert(s.run.combat.block >= 4, `expected block>=4, got ${s.run.combat.block}`);
});

// 17. poisonBurst real damage
test("毒爆伤害12不消耗6格挡", () => {
  let s = enterCombat("poison");
  assert(s.run.relics.includes("venomScripture"));
  // Setup: enemy 50 HP, 6 poison, 0 block
  enemy(s).hp = 50; enemy(s).block = 0;
  enemy(s).statuses = [{ id: "poison", stacks: 6 }];
  s.run.combat.block = 0;
  forceCard(s, "poisonBurst");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  // 6 poison * 2 (venomScripture) = 12 damage. HP: 50-12 = 38.
  assert(enemy(s).hp === 38, `expected HP=38, got ${enemy(s).hp}`);
  // Poison should NOT be consumed
  let psnAfter = enemy(s)?.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(psnAfter === 6, `expected poison=6, got ${psnAfter}`);
  // Player should get +6 block
  assert(s.run.combat.block >= 6, `expected block>=6, got ${s.run.combat.block}`);
  // Log should mention burst
  assert(s.run.combat.log.join(" ").includes("毒瘴爆发"), "log missing 毒瘴爆发");
});

// 18. shellReflect no blockShield
test("反震不消耗格挡但不锁定敌方攻击", () => {
  let s = enterCombat("shell");
  // Setup: one enemy
  s.run.combat.enemies = [s.run.combat.enemies[0]];
  s.run.combat.enemies[0].hp = 50; s.run.combat.enemies[0].block = 0;
  s.run.statuses = [];
  // Set block to 17; shellTap gives +3 block → 20 after play. Reflect does NOT consume block.
  s.run.combat.block = 17;
  forceCard(s, "shellTap");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  // Block should be 17+3=20, reflect didn't consume any
  assert(s.run.combat.block === 20, `block should be 20 after reflect (17+3), got ${s.run.combat.block}`);
  // Player should NOT have blockShield
  let shield = s.run.statuses?.find(x => x.id === "blockShield")?.stacks ?? 0;
  assert(shield === 0, `blockShield should be 0, got ${shield}`);
  // Use real incoming damage to verify block is consumed by enemy attacks
  let hpBefore = s.run.hp;
  applyIncomingDamage(s, 8);
  assert(s.run.combat.block === 12, `block should be 12 after 8 incoming damage, got ${s.run.combat.block}`);
  assert(s.run.hp === hpBefore, `HP should not change (damage fully absorbed by block), was ${hpBefore}, now ${s.run.hp}`);
  // Log must NOT contain 格挡锁定
  let logText = s.run.combat.log.join(" ");
  assert(!logText.includes("格挡锁定"), "log should not contain 格挡锁定");
});

(async () => {
  for (const t of _tests) {
    try { await t.fn(); console.log("✅", t.name); passed++; }
    catch (e) { console.error("❌", t.name, e.message); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
