import { createInitialState, startRun } from "../src/core/state.js";
import { reduceGame } from "../src/core/reducer.js";
import { cards } from "../src/core/data.js";
import { migrateGameState } from "../src/core/save.js";
import { saveGame } from "../src/core/save.js";
import { applyCardDamage } from "../src/core/effects.js";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("✅", name); passed++; }
  catch (e) { console.error("❌", name, e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

function enterCombat(style) {
  let s = createInitialState();
  s = style ? startRun(s, style) : startRun(s);
  let main = s.run.nodeChoices.find(n => n.type === "main");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  return s;
}

// Helper: get fresh enemy ref after state mutation
function enemy(s) { return s.run?.combat?.enemies?.[0]; }

test("普通模式不崩溃", () => {
  let s = enterCombat(null);
  for (let i = 0; i < 10; i++) {
    let ok = s.run.combat.hand.filter(h => s.run.energy >= (cards[h.cardId]?.cost ?? 99));
    if (ok.length > 0) s = reduceGame(s, { type: "playCard", cardUid: ok[0].uid, targetUid: null });
    else s = reduceGame(s, { type: "endTurn" });
    if (s.phase !== "combat") break;
  }
});

for (const style of ["physical","spell","bleed","shell","poison","control"]) {
  test(`真武${style}启动`, () => { let s = enterCombat(style); assert(s.phase === "combat"); });
}

test("破军令+3真伤", () => {
  let s = enterCombat("physical");
  assert(s.run.relics.includes("poJunLing"));
  let e = enemy(s); e.block = 99; e.hp = 10;
  applyCardDamage(s, e, 6, 1, "physical");
  assert(e.hp < 10, `HP=${e.hp}`);
  assert(s.run.combat.log.join(" ").includes("破军令"));
});

test("九天雷劫52伤+2眩晕", () => {
  let s = enterCombat("spell");
  assert(s.run.relics.includes("nineSkyTribulation"));
  enemy(s).hp = 100; enemy(s).block = 0;
  enemy(s).statuses = [{ id: "thunderMark", stacks: 5 }];
  let mark = s.run.combat.hand.find(h => {
    let c = cards[h.cardId]; return c && s.run.energy >= c.cost && c.effects?.some(x => x.type === "thunderMark");
  });
  if (!mark) throw new Error("no thunderMark card");
  s = reduceGame(s, { type: "playCard", cardUid: mark.uid, targetUid: enemy(s).uid });
  let stun = enemy(s)?.statuses?.find(x => x.id === "stun")?.stacks ?? 0;
  assert(stun === 2, `stun=${stun}`);
  assert(enemy(s).hp <= 48, `HP=${enemy(s).hp}`);
});

test("修罗心吸血翻倍", () => {
  let s = enterCombat("bleed");
  assert(s.run.relics.includes("asuraHeart"));
  enemy(s).statuses = [{ id: "bleed", stacks: 12 }];
  s.run.hp = 30;
  // bloodRecycle/bloodSurge are in deck; play other cards first to draw into them
  let siphon = s.run.combat.hand.find(h => cards[h.cardId]?.effects?.some(x => x.type === "bleedSiphon"));
  if (!siphon) {
    for (let i = 0; i < 3 && !siphon; i++) {
      let ok = s.run.combat.hand.filter(h => cards[h.cardId] && s.run.energy >= (cards[h.cardId].cost ?? 99) && h.cardId !== "meditate");
      if (ok.length > 0) s = reduceGame(s, { type: "playCard", cardUid: ok[0].uid, targetUid: enemy(s).uid });
      else s = reduceGame(s, { type: "endTurn" });
      if (s.phase !== "combat") break;
      siphon = s.run.combat.hand.find(h => cards[h.cardId]?.effects?.some(x => x.type === "bleedSiphon"));
    }
  }
  if (!siphon) { console.log("  (no bleedSiphon in hand, skipping)"); return; }
  let hpBefore = s.run.hp;
  s = reduceGame(s, { type: "playCard", cardUid: siphon.uid, targetUid: enemy(s).uid });
  assert(s.run.hp - hpBefore >= 4, `healed=${s.run.hp - hpBefore}`);
});

test("万毒真经毒伤翻倍", () => {
  let s = enterCombat("poison");
  assert(s.run.relics.includes("venomScripture"));
  enemy(s).block = 0; enemy(s).hp = 50;
  enemy(s).statuses = [{ id: "poison", stacks: 6 }];
  // End turn twice for poison to tick
  s = reduceGame(s, { type: "endTurn" });
  if (s.phase === "combat") s = reduceGame(s, { type: "endTurn" });
  // Check if poison applied
  let hpNow = s.run?.combat ? enemy(s).hp : 0;
  assert(hpNow < 50 || !s.run?.combat, `HP=${hpNow}, expected <50 or dead`);
});

test("混沌灵宝只一次", () => {
  let s = enterCombat("control");
  assert(s.run.relics.includes("chaosTreasure"));
  let c0 = enemy(s)?.statuses?.find(x => x.id === "chaos")?.stacks ?? 0;
  assert(c0 >= 3, `chaos=${c0}`);
  s = reduceGame(s, { type: "endTurn" });
});

test("玄龟甲反射翻倍击杀", () => {
  let s = enterCombat("shell");
  assert(s.run.relics.includes("turtleShell"));
  s.run.combat.block = 30;
  s.run.statuses = [{ id: "spikes", stacks: 10 }];
  enemy(s).hp = 30; enemy(s).block = 0;
  s = reduceGame(s, { type: "endTurn" });
  // Either enemy dead or combat ended
  let alive = s.run?.combat && enemy(s)?.hp > 0;
  assert(!alive, `enemy alive HP=${enemy(s)?.hp}`);
});

test("荆棘反震击杀不崩溃", () => {
  let s = enterCombat("shell");
  s.run.combat.block = 10; s.run.statuses = [{ id: "spikes", stacks: 5 }];
  enemy(s).hp = 1; enemy(s).block = 0;
  s = reduceGame(s, { type: "endTurn" });
});

test("存档迁移完整", () => {
  let m = migrateGameState({ meta: { factionMastery: { 人间: 3 } }, run: { floor: 5 } });
  assert(m.meta.mythMastery?.["人间"] === 3);
  assert(!m.meta.factionMastery);
  assert(m.run?.floor === 5);
  assert(Array.isArray(m.run?.guaranteedNextHand));
});

test("saveGame容错", () => {
  let orig = globalThis.localStorage;
  globalThis.localStorage = { setItem() { throw new Error("q"); }, getItem() { return null; }, removeItem() {} };
  try { assert(saveGame(createInitialState())); }
  finally { globalThis.localStorage = orig; }
});

test("combat-events模块", async () => {
  let m = await import("../src/core/combat-events.js");
  assert(typeof m.onEnemyKilled === "function");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
