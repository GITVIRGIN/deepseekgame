import { createInitialState, startRun } from "../src/core/state.js";
import { prepareRouteChoice } from "../src/core/nodes.js";
import { reduceGame } from "../src/core/reducer.js";
import { cards } from "../src/core/data.js";
import { migrateGameState } from "../src/core/save.js";
import { saveGame, loadGame } from "../src/core/save.js";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("✅", name); passed++; }
  catch (e) { console.error("❌", name, e.message); failed++; }
}

// 1. Normal mode start and enter combat
test("普通模式启动并进入战斗", () => {
  let s = createInitialState(); s = startRun(s);
  let main = s.run.nodeChoices.find(n => n.type === "main");
  if (!main) throw new Error("no main node");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  if (s.phase !== "combat") throw new Error("phase is " + s.phase);
  if (!s.run.combat?.enemies?.length) throw new Error("no enemies");
  // Play a few steps
  for (let i = 0; i < 3; i++) {
    let hand = s.run.combat?.hand ?? [];
    let ok = hand.filter(h => s.run.energy >= (cards[h.cardId]?.cost ?? 99));
    if (ok.length > 0) s = reduceGame(s, { type: "playCard", cardUid: ok[0].uid, targetUid: null });
    else s = reduceGame(s, { type: "endTurn" });
    if (s.phase !== "combat") break;
  }
});

// 2. TM physical start
test("真武物理启动并进入战斗", () => {
  let s = createInitialState(); s = startRun(s, "physical");
  if (s.phase !== "route") throw new Error("wrong phase: " + s.phase);
  let main = s.run.nodeChoices.find(n => n.type === "main");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  if (s.phase !== "combat") throw new Error("not in combat: " + s.phase);
});

// 3. TM spell start with thunderMark
test("真武法术启动，触发雷印不崩溃", () => {
  let s = createInitialState(); s = startRun(s, "spell");
  let main = s.run.nodeChoices.find(n => n.type === "main");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  let hand = s.run.combat?.hand ?? [];
  let thunder = hand.filter(h => {
    let c = cards[h.cardId]; return c && s.run.energy >= c.cost && c.effects?.some(e => e.type === "thunderMark");
  });
  if (thunder.length > 0) {
    let enemy = s.run.combat.enemies[0];
    // Apply marks manually to trigger tribulation
    enemy.statuses = enemy.statuses ?? [];
    let tm = enemy.statuses.find(s => s.id === "thunderMark");
    if (!tm) { tm = { id: "thunderMark", stacks: 0 }; enemy.statuses.push(tm); }
    tm.stacks = 5;
    s = reduceGame(s, { type: "playCard", cardUid: thunder[0].uid, targetUid: enemy.uid });
    // Should not crash with triggerNineSkyTribulation
  }
});

// 4. TM shell start
test("真武龟壳启动并进入战斗", () => {
  let s = createInitialState(); s = startRun(s, "shell");
  let main = s.run.nodeChoices.find(n => n.type === "main");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  if (s.phase !== "combat") throw new Error("not in combat: " + s.phase);
});

// 5. Spikes reflect kill
test("荆棘反震击杀不崩溃", () => {
  let s = createInitialState(); s = startRun(s, "shell");
  let main = s.run.nodeChoices.find(n => n.type === "main");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  // Give spikes and block, make enemy almost dead
  s.run.combat.block = 30;
  s.run.statuses = s.run.statuses ?? [];
  let sp = s.run.statuses.find(x => x.id === "spikes");
  if (!sp) { sp = { id: "spikes", stacks: 0 }; s.run.statuses.push(sp); }
  sp.stacks = 20;
  let enemy = s.run.combat.enemies[0];
  enemy.hp = 1; enemy.block = 0;
  // End turn to trigger spikes reflect  
  s = reduceGame(s, { type: "endTurn" });
});

// 6. Migration
test("存档迁移 factionMastery→mythMastery", () => {
  let old = { meta: { factionMastery: { 人间: 3, 昆仑: 1 }, soul: 10 } };
  let migrated = migrateGameState(old);
  if (!migrated.meta.mythMastery) throw new Error("no mythMastery");
  if (migrated.meta.mythMastery["人间"] !== 3) throw new Error("value lost");
  if (migrated.meta.factionMastery) throw new Error("factionMastery not deleted");
});

// 7. saveGame crash resilience
test("saveGame 崩溃不影响程序", () => {
  let orig = globalThis.localStorage;
  globalThis.localStorage = { setItem() { throw new Error("quota exceeded"); }, getItem() { return null; }, removeItem() {} };
  try {
    let s = createInitialState();
    let result = saveGame(s);
    if (!result) throw new Error("saveGame returned falsy");
  } finally {
    globalThis.localStorage = orig;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
