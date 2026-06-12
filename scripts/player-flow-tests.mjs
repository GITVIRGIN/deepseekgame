// V2.5: Player experience flow tests — simulate real player action sequences
import { createInitialState, isTrueMartialUnlocked, canShowTrueMartialEntry, startRun, normalUnlockRelics } from "../src/core/state.js";
import { reduceGame } from "../src/core/reducer.js";
import { relics, cards } from "../src/core/data.js";
import { migrateGameState } from "../src/core/save.js";
import { completeRunVictory } from "../src/core/goals.js";
import { DIFFICULTY_TRUE_MARTIAL } from "../src/core/types.js";

let passed = 0, failed = 0;
const tests = [];

function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(`FAIL: ${msg}`); }

// V2.6: realistic unlock helper — uses normalUnlockRelics, not all relic IDs
function grantRealisticTrueMartialUnlock(meta) {
  meta.collectedRelics = normalUnlockRelics().map(r => r.id);
  meta.mythMastery = { 天庭: 3, 妖: 3, 幽冥: 3 };
  return meta;
}

// ---- 3.1: unblocked martialSelect ----
test("玩家未解锁时不能通过 martialSelect 进入真武选择", () => {
  let s = createInitialState();
  s.meta.wins = 0;
  s = reduceGame(s, { type: "martialSelect" });
  assert(s.phase !== "martialSelect", `should not enter martialSelect, got ${s.phase}`);
  assert((s.message || "").includes("尚"), "message should indicate not unlocked");
});

// ---- 3.2: unblocked startTrueMartial ----
test("玩家未解锁时不能直接 startTrueMartial", () => {
  let s = createInitialState();
  s.meta.wins = 0;
  s = reduceGame(s, { type: "startTrueMartial", style: "physical" });
  assert(!s.run, "should not create run");
  assert(s.phase !== "route" && s.phase !== "combat", `should not enter gameplay, got ${s.phase}`);
  assert((s.message || "").includes("尚"), "message should say not unlocked");
});

// ---- 3.3: illegal TM style ----
test("非法真武流派不会 fallback 启动", () => {
  let s = createInitialState();
  s.meta.wins = 10;
  grantRealisticTrueMartialUnlock(s.meta);
  s = reduceGame(s, { type: "martialSelect" });
  assert(s.phase === "martialSelect", "should enter martialSelect");
  s = reduceGame(s, { type: "startTrueMartial", style: "badstyle" });
  assert(!s.run, "should not create run with bad style");
  assert((s.message || "").includes("未知"), "message should say unknown style");
});

// ---- 3.4: cancelMartial from gameOver ----
test("结算页进入真武选择后返回仍回到结算页", () => {
  let s = createInitialState();
  s.meta.wins = 10;
  grantRealisticTrueMartialUnlock(s.meta);
  s.phase = "gameOver";
  s.run = { finished: true, seed: 1, floor: 18, deck: [], relics: [], hp: 30, maxHp: 30, maxEnergy: 3, gold: 0,
    archetypeAffinity: {}, rollsUsed: 0, rollsMax: 3, goal: { main: { text: "" }, special: {} } };
  s = reduceGame(s, { type: "martialSelect" });
  assert(s.phase === "martialSelect", "should enter martialSelect from gameOver");
  s = reduceGame(s, { type: "cancelMartial" });
  assert(s.phase === "gameOver", "should return to gameOver");
  assert(s.run.finished === true, "run should still be finished");
});

// ---- 3.5: double abandon ----
test("玩家连点放弃不会重复结算", () => {
  let s = createInitialState();
  s = startRun(s);
  s.run.floor = 10;
  s.run.relics.push("bloodGourd");
  s.run.combat = { enemies: [], hand: [], drawPile: [], discardPile: [], log: [], block: 0, flags: {} };
  let soul1 = s.meta.soul;
  let streak1 = s.meta.lossStreak;
  s = reduceGame(s, { type: "abandonRun" });
  let soul2 = s.meta.soul;
  let streak2 = s.meta.lossStreak;
  s = reduceGame(s, { type: "abandonRun" });
  assert(s.meta.soul === soul2, "second abandon should not add more soul");
  assert(s.meta.lossStreak === streak2, "second abandon should not increase lossStreak");
});

// ---- 3.6: clean new run after gameOver ----
test("结算页点击新开局不会污染上一局状态", () => {
  let s = createInitialState();
  s = startRun(s);
  s.run.floor = 18;
  s.run.finished = true;
  s.phase = "gameOver";
  s.run.pendingPurge = { source: "shop", filter: "any", remaining: 1, addCurseOnComplete: false, removedNames: [] };
  s.run.pendingChoice = "test";
  s.run.rewards = [{ id: "x", type: "card", value: "strike" }];
  s.run.combat = { enemies: [{ hp: 0, name: "Boss" }], hand: [], drawPile: [], discardPile: [], log: [], block: 0, flags: {} };
  let runsBefore = s.meta.totalRuns;
  s = reduceGame(s, { type: "startRun" });
  assert(s.phase === "route", `should be route, got ${s.phase}`);
  assert(s.run.finished !== true, "new run should not be finished");
  assert(!s.run.pendingPurge, "pendingPurge should be cleared");
  assert(!s.run.pendingChoice, "pendingChoice should be cleared");
  assert(s.run.rewards.length === 0, "rewards should be empty");
  assert(s.run.combat === null, "combat should be null");
  assert(s.meta.totalRuns === runsBefore + 1, "totalRuns should increment by 1");
});

// ---- 3.7: old TM save migration ----
test("旧真武存档迁移后仍是 25 层虚渊主宰", () => {
  let s = createInitialState();
  s.meta.wins = 10;
  s.run = {
    trueMartial: true,
    difficulty: "trueMartial",
    seed: 123,
    floor: 1,
    deck: [], relics: [], hp: 30, maxHp: 30, maxEnergy: 3, gold: 0,
    archetypeAffinity: {}, rollsUsed: 0, rollsMax: 3,
    combat: null, rewards: [], finished: false,
  };
  s = migrateGameState(s);
  assert(s.run.goal, "goal should exist after migration");
  const mainText = s.run.goal.main?.text || "";
  assert(mainText.includes("25"), `goal should mention 25, got: ${mainText.slice(0, 50)}`);
  assert(mainText.includes("虚渊主宰"), `goal should mention 虚渊主宰, got: ${mainText.slice(0, 50)}`);
});

// ---- 3.8: TM relic grant excludes unimplemented ----
test("真武通关馈赠不会给未实现遗物", () => {
  let s = createInitialState();
  s.meta.wins = 10;
  s.run = {
    trueMartial: true, seed: 42, floor: 25, finished: false,
    deck: [], relics: [], hp: 30, maxHp: 30, maxEnergy: 3, gold: 0,
    archetypeAffinity: {}, combat: null, rewards: [],
    goal: { main: { text: "25" }, special: {} },
  };
  s.meta.collectedRelics = Object.values(relics)
    .filter(r => r.trueMartialOnly || (r.text || "").includes("真武专属"))
    .filter(r => r.implemented !== false)
    .map(r => r.id);
  s = completeRunVictory(s, "boss", "test victory");
  const unimplemented = Object.values(relics)
    .filter(r => r.implemented === false)
    .map(r => r.id);
  for (const uid of unimplemented) {
    assert(!s.meta.collectedRelics.includes(uid), `should not grant unimplemented relic ${uid}`);
  }
});

// ---- 3.9: gameOver purge ----
test("结算页残留 pendingPurge 时 confirmPurge 不会改牌组", () => {
  let s = createInitialState();
  s = startRun(s);
  s.run.finished = true;
  s.phase = "gameOver";
  s.run.pendingPurge = { source: "shop", filter: "any", remaining: 1, addCurseOnComplete: false, removedNames: [] };
  let deckLen = s.run.deck.length;
  s = reduceGame(s, { type: "confirmPurge", cardUid: s.run.deck[0].uid });
  assert(s.run.deck.length === deckLen, "deck should not change");
  assert(s.phase === "gameOver", "should stay gameOver");
});

// ---- V2.6: new realistic unlock tests ----

test("真实普通遗物全收集后可以解锁真武", () => {
  let s = createInitialState();
  grantRealisticTrueMartialUnlock(s.meta);
  assert(isTrueMartialUnlocked(s.meta) === true, "should be unlocked with real relics");
  assert(canShowTrueMartialEntry({ phase: "home", meta: s.meta }) === true, "entry should be shown");
});

test("真武专属遗物不是解锁前置", () => {
  let s = createInitialState();
  // Only normal unlock relics, no bloodContract/cursedMirror/etc., no TM relics
  s.meta.collectedRelics = normalUnlockRelics().map(r => r.id);
  s.meta.mythMastery = { 天庭: 3, 妖: 3, 幽冥: 3 };
  assert(isTrueMartialUnlocked(s.meta) === true, "should unlock without TM-only relics");
});

test("直接调用 startRun 的非法真武流派不会 fallback", () => {
  let s = createInitialState();
  grantRealisticTrueMartialUnlock(s.meta);
  const before = s.meta.totalRuns;
  const next = startRun(s, "badstyle");
  assert(!next.run, "should not create run with bad style");
  assert(next.meta.totalRuns === before, "totalRuns should not increment");
  assert((next.message || "").includes("未知真武流派"), "message should say unknown style");
});

// ====== RUNNER ======
for (const t of tests) {
  try { t.fn(); console.log(`✅ ${t.name}`); passed++; }
  catch (e) { console.log(`❌ ${t.name}\n   ${e.message}`); failed++; }
}
console.log(`\n${passed + failed} total, ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
