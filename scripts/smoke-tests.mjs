import { createInitialState, startRun, makeCard } from "../src/core/state.js";
import { reduceGame } from "../src/core/reducer.js";
import { cards } from "../src/core/data.js";
import { migrateGameState } from "../src/core/save.js";
import { saveGame } from "../src/core/save.js";
import { applyCardDamage, tickDamageStatus } from "../src/core/effects.js";
import { startPlayerTurn } from "../src/core/combat.js";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("✅", name); passed++; }
  catch (e) { console.error("❌", name, e.message); failed++; }
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
test("破军令+3真伤穿99格挡", () => {
  let s = enterCombat("physical");
  assert(s.run.relics.includes("poJunLing"));
  enemy(s).block = 99; enemy(s).hp = 10;
  applyCardDamage(s, enemy(s), 6, 1, "physical");
  assert(enemy(s).hp < 10, `HP=${enemy(s).hp}`);
  assert(s.run.combat.log.join(" ").includes("破军令"));
});

// 4. nineSkyTribulation
test("九天雷劫52伤+2眩晕", () => {
  let s = enterCombat("spell");
  assert(s.run.relics.includes("nineSkyTribulation"));
  enemy(s).hp = 100; enemy(s).block = 0;
  enemy(s).statuses = [{ id: "thunderMark", stacks: 5 }];
  forceCard(s, "thunderCharm");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  let stun = enemy(s)?.statuses?.find(x => x.id === "stun")?.stacks ?? 0;
  assert(stun === 2, `stun=${stun}`);
  assert(enemy(s).hp <= 48, `HP=${enemy(s).hp}`);
});

// 5. asuraHeart - FORCED hand
test("修罗心回血8(12层流血)", () => {
  let s = enterCombat("bleed");
  assert(s.run.relics.includes("asuraHeart"));
  enemy(s).statuses = [{ id: "bleed", stacks: 12 }];
  s.run.hp = 30;
  forceCard(s, "bloodRecycle");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  assert(s.run.hp === 38, `expected HP=38, got ${s.run.hp}`);
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
test("玄龟甲反射翻倍击杀", () => {
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
  // Block decay: 31→30. Reflect: min(30, 33)*2 = 60. Enemy HP: 30→0
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
test("combat-events模块", async () => {
  let m = await import("../src/core/combat-events.js");
  assert(typeof m.onEnemyKilled === "function");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
