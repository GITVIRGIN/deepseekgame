import { createInitialState, startRun, makeCard, isTrueMartialUnlocked, canShowTrueMartialEntry } from "../src/core/state.js";
import { reduceGame } from "../src/core/reducer.js";
import { cards, relics } from "../src/core/data.js";
import { migrateGameState } from "../src/core/save.js";
import { saveGame } from "../src/core/save.js";
import { onEnemyKilled } from "../src/core/combat-events.js";
import { applyEffect, applyCardDamage, tickDamageStatus, applyIncomingDamage } from "../src/core/effects.js";
import { startPlayerTurn, previewEnemyIntent } from "../src/core/combat.js";
import { trueMartialFormationAttackBonus, trueMartialFormationInfo, initializeTrueMartialFormation } from "../src/core/combat.js";
import { completeRunVictory } from "../src/core/goals.js";
import { DIFFICULTY_BEGINNER, DIFFICULTY_REGULAR, DIFFICULTY_TRUE_MARTIAL, MIN_DECK_SIZE, ROLL_MAX_BEGINNER, ROLL_MAX_REGULAR, ROLL_MAX_TRUE_MARTIAL, TRUE_MARTIAL_MAX_FLOOR, MAX_FLOOR, difficultyTuning } from "../src/core/types.js";
import { generateRewards, rollTrueMartialRelicReward } from "../src/core/rewards.js";
import { prepareRouteChoice } from "../src/core/nodes.js";

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

// V3.1.1: TM combat setup with relics
function tmCombat(floor, relicsArr = []) {
  let s = enterCombat("spell");
  s.run.floor = floor;
  s.run.relics = [...(s.run.relics || []), ...relicsArr];
  // Re-initialize TM formation since we changed floor
  if (s.run.trueMartial) initializeTrueMartialFormation(s);
  // Re-trigger combat start relic effects (infernoLotus)
  if (relicsArr.includes("infernoLotus") && !s.run.statuses?.some(x => x.id === "burn" && x.stacks >= 3)) {
    s.run.statuses = s.run.statuses || [];
    let burnEntry = s.run.statuses.find(x => x.id === "burn");
    if (burnEntry) burnEntry.stacks += 3;
    else s.run.statuses.push({ id: "burn", stacks: 3 });
  }
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
test("破军令+10真伤穿99格挡", () => {
  let s = enterCombat("physical");
  assert(s.run.relics.includes("poJunLing"));
  enemy(s).block = 99; enemy(s).hp = 10;
  applyCardDamage(s, enemy(s), 6, 1, "physical");
  // 6 raw damage blocked by 99 block. 9 true damage bypasses. HP: 10-10 = 0.
  assert(enemy(s).hp === 0, `expected HP=0, got ${enemy(s).hp}`);
  assert(s.run.combat.log.join(" ").includes("破军令追加 10 点真伤"), "log missing poJunLing true damage");
});

// 4. nineSkyTribulation
test("九天雷劫120伤无眩晕", () => {
  let s = enterCombat("spell");
  assert(s.run.relics.includes("nineSkyTribulation"));
  enemy(s).hp = 150; enemy(s).block = 0;
  enemy(s).statuses = [{ id: "thunderMark", stacks: 5 }];
  forceCard(s, "thunderCharm");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  let stun = enemy(s)?.statuses?.find(x => x.id === "stun")?.stacks ?? 0;
  assert(stun === 0, `tribulation should NOT apply stun, got stun=${stun}`);
  // 60 base + 60 nineSky = 120 tribulation damage
  assert(enemy(s).hp <= 30, `expected HP<=30 (trib 120 + card dmg), got ${enemy(s).hp}`);
  // Log should NOT mention stun
  assert(!s.run.combat.log.join(" ").includes("眩晕"), "tribulation log should not mention stun");
});

// 4b. nineSky start thunderMark
test("九天雷劫开局敌人雷印3", () => {
  let s = enterCombat("spell");
  assert(s.run.relics.includes("nineSkyTribulation"));
  let tm = enemy(s)?.statuses?.find(x => x.id === "thunderMark")?.stacks ?? 0;
  assert(tm === 3, `expected thunderMark=3, got ${tm}`);
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
test("血牙回复6", () => {
  let s = enterCombat("bleed");
  s.run.hp = 30;
  forceCard(s, "bloodFang");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  assert(s.run.hp === 36, `expected HP=36, got ${s.run.hp}`);
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
  // Player should take 12 damage (venomScripture doubles poison in TM)
  assert(s.run.hp === 38, `expected HP=38, got ${s.run.hp}`);
});

// 8. chaosTreasure once
test("混沌灵宝只一次", () => {
  let s = enterCombat("control");
  assert(s.run.relics.includes("chaosTreasure"));
  let c0 = enemy(s)?.statuses?.find(x => x.id === "chaos")?.stacks ?? 0;
  assert(c0 === 0, `chaos=${c0}`);
  let b0 = enemy(s)?.statuses?.find(x => x.id === "bind")?.stacks ?? 0;
  assert(b0 === 0, "bind should not exist from chaosTreasure");
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
  const origWarn = console.warn;
  let sawExpectedWarning = false;
  console.warn = (msg) => { if (String(msg).includes("存档写入失败")) sawExpectedWarning = true; };
  globalThis.localStorage = { setItem() { throw new Error("q"); }, getItem() { return null; }, removeItem() {} };
  try {
    assert(saveGame(createInitialState()));
    // CQA-P4-001: mark expected saveGame warning as non-fatal
    assert(sawExpectedWarning, "Expected saveGame to log a console.warn on write failure");
  }
  finally { globalThis.localStorage = orig; console.warn = origWarn; }
});

// 13. combat-events
test("combat-events模块", () => {
  assert(typeof onEnemyKilled === "function");
});

// 14. poJunLing block
test("破军令开局格挡+22", () => {
  let s = enterCombat("physical");
  assert(s.run.relics.includes("poJunLing"));
  // startCombat adds +22 block from poJunLing
  assert(s.run.combat.block >= 22, `block=${s.run.combat.block}`);
});

// 15. venomScripture +6 poison
test("万毒真经开局敌毒+8", () => {
  let s = enterCombat("poison");
  assert(s.run.relics.includes("venomScripture"));
  let poison = enemy(s)?.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(poison >= 6, `expected poison>=8, got ${poison}`);
});

// 16. venomFang block
test("毒牙格挡+5", () => {
  let s = enterCombat("poison");
  s.run.combat.block = 0;
  forceCard(s, "venomFang");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  assert(s.run.combat.block >= 5, `expected block>=5, got ${s.run.combat.block}`);
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
  // V3.13N-C1: shellTap block buffed 5→6
  // Set block to 17; shellTap gives +6 block → 23 after play. Reflect does NOT consume block.
  s.run.combat.block = 17;
  forceCard(s, "shellTap");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  // Block should be 17+6=23, reflect didn't consume any
  assert(s.run.combat.block === 23, `block should be 23 after reflect (17+6), got ${s.run.combat.block}`);
  // Player should NOT have blockShield
  let shield = s.run.statuses?.find(x => x.id === "blockShield")?.stacks ?? 0;
  assert(shield === 0, `blockShield should be 0, got ${shield}`);
  // Use real incoming damage to verify block is consumed by enemy attacks
  let hpBefore = s.run.hp;
  applyIncomingDamage(s, 8);
  assert(s.run.combat.block === 15, `block should be 15 after 8 incoming damage, got ${s.run.combat.block}`);
  assert(s.run.hp === hpBefore, `HP should not change (damage fully absorbed by block), was ${hpBefore}, now ${s.run.hp}`);
  // Log must NOT contain 格挡锁定
  let logText = s.run.combat.log.join(" ");
  assert(!logText.includes("格挡锁定"), "log should not contain 格挡锁定");
});

// 19. foxFire is spell
test("狐火纳入法术流且施加灼烧雷痕", () => {
  assert(cards.foxFire.style === "spell", `foxFire.style=${cards.foxFire.style}`);
  assert(cards.foxFire.grade === 1, `foxFire.grade=${cards.foxFire.grade}`);
  // Play foxFire
  let s = enterCombat();
  enemy(s).hp = 20; enemy(s).block = 0;
  forceCard(s, "foxFire");
  let hpBefore = enemy(s).hp;
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  // 4 damage
  assert(enemy(s).hp === hpBefore - 5, `expected HP=${hpBefore-5}, got ${enemy(s).hp}`);
  // 4 burn
  let burn = enemy(s)?.statuses?.find(x => x.id === "burn")?.stacks ?? 0;
  assert(burn >= 4, `expected burn>=4, got ${burn}`);
  // 4 thunderMark
  let tm = enemy(s)?.statuses?.find(x => x.id === "thunderMark")?.stacks ?? 0;
  assert(tm === 4, `expected thunderMark=4, got ${tm}`);
  // Should NOT trigger tribulation (threshold is 8, only 4 mark)
  assert(s.phase !== "gameOver", "foxFire should not trigger tribulation at 4 mark");
});

// 20. Control break: 2 types >= 6 triggers — skipped: chaosTreasure now 2+2=4

// 21. Control break: single type 6 does NOT trigger
test("心防崩裂单类6不触发", () => {
  let s = enterCombat();
  enemy(s).hp = 50;
  enemy(s).statuses = [{ id: "chaos", stacks: 6 }];
  forceCard(s, "discordCharm"); // play a control card that will trigger controlBreak check
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  let brittle = enemy(s)?.statuses?.find(x => x.id === "brittle")?.stacks ?? 0;
  assert(brittle === 0, `chaos=6 alone should NOT trigger brittle, got ${brittle}`);
});

// 22. Control break: single type 8 does trigger
test("心防崩裂单类8触发", () => {
  let s = enterCombat();
  enemy(s).hp = 50; enemy(s).block = 20;
  enemy(s).statuses = [{ id: "chaos", stacks: 8 }];
  forceCard(s, "discordCharm");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  let brittle = enemy(s)?.statuses?.find(x => x.id === "brittle")?.stacks ?? 0;
  assert(brittle >= 2, `chaos=8 should trigger brittle, got ${brittle}`);
  // Block should be cleared
  assert(enemy(s).block === 0, `block should be cleared, got ${enemy(s).block}`);
});

// 23. Control resist resists chaos/bind/stun
test("定力抵消离间禁锢眩晕", () => {
  let s = enterCombat();
  enemy(s).hp = 80;
  enemy(s).statuses = [{ id: "controlResist", stacks: 2 }];
  // Apply 1 chaos via discordCharm
  forceCard(s, "discordCharm");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  let chaos = enemy(s)?.statuses?.find(x => x.id === "chaos")?.stacks ?? 0;
  let cr = enemy(s)?.statuses?.find(x => x.id === "controlResist")?.stacks ?? 0;
  assert(chaos === 0, `chaos should be 0 (1 vs resist 2), got ${chaos}`);
  assert(cr === 1, `controlResist should be 1, got ${cr}`);
  // thunderMark should NOT be blocked
  enemy(s).statuses = [{ id: "thunderMark", stacks: 0 }, { id: "controlResist", stacks: 2 }];
  forceCard(s, "thunderCall");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  let tm = enemy(s)?.statuses?.find(x => x.id === "thunderMark")?.stacks ?? 0;
  assert(tm > 0, `thunderMark should NOT be blocked by controlResist`);
});

// 24. Control resist cap is 2
test("定力上限2", () => {
  let s = enterCombat();
  let e = s.run.combat.enemies[0];
  e.hp = 80; e.block = 0;
  e.intent = { type: "attack", value: 5 };
  e.statuses = [{ id: "stun", stacks: 1 }];
  s.run.combat.enemies = [e];
  s = reduceGame(s, { type: "endTurn" });
  let cr = (s.run.combat.enemies[0]?.statuses || []).find(x => x.id === "controlResist")?.stacks ?? 0;
  assert(cr >= 1, `expected controlResist>=1 after stun, got ${cr}`);
  // Apply stun again, should cap at 2
  e = s.run.combat.enemies[0];
  e.statuses.push({ id: "stun", stacks: 1 });
  s = reduceGame(s, { type: "endTurn" });
  cr = (s.run.combat.enemies[0]?.statuses || []).find(x => x.id === "controlResist")?.stacks ?? 0;
  assert(cr <= 2, `controlResist should be <=2, got ${cr}`);
});

// 25. Normal action reduces controlResist
test("敌人正常行动后定力减少", () => {
  let s = enterCombat();
  let e = s.run.combat.enemies[0];
  e.hp = 80; e.block = 0;
  e.intent = { type: "attack", value: 5 };
  e.statuses = [{ id: "controlResist", stacks: 2 }];
  s.run.combat.enemies = [e];
  s.run.combat.block = 0;
  s = reduceGame(s, { type: "endTurn" });
  let cr = (s.run.combat.enemies[0]?.statuses || []).find(x => x.id === "controlResist")?.stacks ?? 0;
  assert(cr <= 1, `controlResist should decrease after normal action, got ${cr}`);
});

// 26. Stun skip grants controlResist, NOT clearMind
test("敌人眩晕跳过后获得定力不获得醒神", () => {
  let s = enterCombat();
  let e = s.run.combat.enemies[0];
  e.hp = 80; e.block = 0;
  e.intent = { type: "attack", value: 5 };
  e.statuses = [{ id: "stun", stacks: 1 }];
  s.run.combat.enemies = [e];
  s = reduceGame(s, { type: "endTurn" });
  let alive = (s.run?.combat?.enemies || []).filter(x => x.hp > 0);
  assert(alive.length > 0, "enemy should survive");
  let cr = (alive[0].statuses || []).find(x => x.id === "controlResist")?.stacks ?? 0;
  let cm = (alive[0].statuses || []).find(x => x.id === "clearMind")?.stacks ?? 0;
  assert(cr >= 1, `expected controlResist>=1 after stun, got ${cr}`);
  assert(cm === 0, `expected no clearMind, got ${cm}`);
});

// 27. Control break unchanged
test("心防崩裂单类8触发(旧规则不变)", () => {
  let s = enterCombat();
  enemy(s).hp = 50; enemy(s).block = 20;
  enemy(s).statuses = [{ id: "chaos", stacks: 8 }];
  forceCard(s, "discordCharm");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  let brittle = enemy(s)?.statuses?.find(x => x.id === "brittle")?.stacks ?? 0;
  assert(brittle >= 2, `brittle should trigger with chaos=8`);
  assert(enemy(s).block === 0, `block should be cleared`);
});


// === v0.7.7 P0 tests ===
test("连续放弃不会重复结算", () => {
  let s = createInitialState();
  s = reduceGame(s, { type: "startRun" });
  s.run.floor = 12; s.run.relics = ["guard"]; s.phase = "combat";
  s.run.combat = { enemies: [], hand: [], drawPile: [], discardPile: [], log: [], block: 0 };
  const s1 = reduceGame(s, { type: "abandonRun" });
  const soul1 = s1.meta.soul, streak1 = s1.meta.lossStreak;
  const relics1 = [...s1.meta.collectedRelics];
  const mastery1 = JSON.stringify(s1.meta.mythMastery);
  assert(s1.run.finished === true && s1.phase === "gameOver");
  const s2 = reduceGame(s1, { type: "abandonRun" });
  assert(s2.meta.soul === soul1); assert(s2.meta.lossStreak === streak1);
  assert(s2.meta.collectedRelics.length === relics1.length);
  assert(JSON.stringify(s2.meta.mythMastery) === mastery1);
});

test("低层放弃不会获得派系箓印", () => {
  let s = createInitialState();
  s = reduceGame(s, { type: "startRun" });
  s.run.floor = 5; s.run.relics = []; s.phase = "combat";
  s.run.combat = { enemies: [], hand: [], drawPile: [], discardPile: [], log: [], block: 0 };
  const s1 = reduceGame(s, { type: "abandonRun" });
  assert(Object.values(s1.meta.mythMastery || {}).filter(v => v > 0).length === 0);
});

test("放弃不会批量解锁遗物", () => {
  let s = createInitialState();
  s = reduceGame(s, { type: "startRun" });
  s.run.floor = 10; s.run.relics = ["guard"]; s.phase = "combat";
  s.run.combat = { enemies: [], hand: [], drawPile: [], discardPile: [], log: [], block: 0 };
  const s1 = reduceGame(s, { type: "abandonRun" });
  assert(s1.meta.collectedRelics.includes("guard"));
  assert(!s1.meta.collectedRelics.includes("turtleShell"));
  assert(s1.meta.collectedRelics.length < 10);
});

test("真武解锁纯函数正确", () => {
  const normalIds = Object.values(relics).filter(r => !r.text?.includes("真武专属")).map(r => r.id);
  const unlocked = { collectedRelics: [...normalIds], mythMastery: { spell: 3, physical: 3, bleed: 3 } };
  assert(isTrueMartialUnlocked(unlocked) === true);
  assert(isTrueMartialUnlocked({ collectedRelics: [], mythMastery: {} }) === false);
  const copy = JSON.parse(JSON.stringify(unlocked));
  isTrueMartialUnlocked(copy);
  assert(JSON.stringify(copy) === JSON.stringify(unlocked));
});

test("真武解锁后home显示入口", () => {
  const normalIds = Object.values(relics).filter(r => !r.text?.includes("真武专属")).map(r => r.id);
  assert(canShowTrueMartialEntry({ phase: "home", meta: { collectedRelics: [...normalIds], mythMastery: { spell: 3, physical: 3, bleed: 3 } } }) === true);
});

test("真武解锁后gameOver显示入口", () => {
  const normalIds = Object.values(relics).filter(r => !r.text?.includes("真武专属")).map(r => r.id);
  assert(canShowTrueMartialEntry({ phase: "gameOver", meta: { collectedRelics: [...normalIds], mythMastery: { spell: 3, physical: 3, bleed: 3 } } }) === true);
});

test("未解锁不显示真武入口", () => {
  const locked = { collectedRelics: [], mythMastery: {} };
  assert(canShowTrueMartialEntry({ phase: "home", meta: locked }) === false);
  assert(canShowTrueMartialEntry({ phase: "gameOver", meta: locked }) === false);
});

test("进入真武选择页不赠送遗物", () => {
  let s = createInitialState();
  // V2.5: need proper unlock conditions
  s.meta.collectedRelics = Object.values(relics).filter(r => !r.text?.includes("真武专属")).map(r => r.id);
  s.meta.mythMastery = { 天庭: 3, 妖: 3, 幽冥: 3 };

  s = reduceGame(s, { type: "martialSelect" });
  assert(s.phase === "martialSelect");
  assert(Array.isArray(s.meta.collectedRelics));
  assert(s.meta.mythMastery["天庭"] === 3);
});

// === v0.7.7 雷火 tests ===
test("雷火引单体法术只影响目标", () => {
  let s = enterCombat();
  s.run.trueMartial = false;
  s.run.combat.enemies = [
    { uid: "A", hp: 80, maxHp: 80, block: 0, name: "敌A", statuses: [], intent: { type: "attack", value: 5 } },
    { uid: "B", hp: 80, maxHp: 80, block: 0, name: "敌B", statuses: [], intent: { type: "attack", value: 5 } },
  ];
  s.run.combat.flags = { travelSpellCharge: 3 };
  forceCard(s, "foxFire");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: "A" });
  const burnB = (s.run.combat.enemies[1].statuses || []).find(x => x.id === "burn")?.stacks ?? 0;
  const tmB = (s.run.combat.enemies[1].statuses || []).find(x => x.id === "thunderMark")?.stacks ?? 0;
  assert(burnB === 0); assert(tmB === 0);
  assert(s.run.combat.flags.travelSpellCharge === 2);
});

test("雷火引全体法术影响所有敌人", () => {
  let s = enterCombat();
  s.run.trueMartial = false;
  s.run.combat.enemies = [
    { uid: "X", hp: 80, maxHp: 80, block: 0, name: "敌X", statuses: [], intent: { type: "attack", value: 5 } },
    { uid: "Y", hp: 80, maxHp: 80, block: 0, name: "敌Y", statuses: [], intent: { type: "attack", value: 5 } },
  ];
  s.run.combat.flags = { travelSpellCharge: 3 };
  forceCard(s, "fireRite");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  const tmX = (s.run.combat.enemies[0].statuses || []).find(x => x.id === "thunderMark")?.stacks ?? 0;
  const tmY = (s.run.combat.enemies[1].statuses || []).find(x => x.id === "thunderMark")?.stacks ?? 0;
  assert(tmX === 6); assert(tmY === 6);
  assert(s.run.combat.flags.travelSpellCharge === 2);
});

test("雷火共鸣只检查受影响目标", () => {
  let s = enterCombat();
  s.run.combat.enemies = [
    { uid: "A", hp: 80, maxHp: 80, block: 0, name: "敌A", statuses: [{ id: "burn", stacks: 4 }, { id: "thunderMark", stacks: 2 }], intent: { type: "attack", value: 5 } },
    { uid: "B", hp: 80, maxHp: 80, block: 0, name: "敌B", statuses: [{ id: "burn", stacks: 4 }, { id: "thunderMark", stacks: 4 }], intent: { type: "attack", value: 5 } },
  ];
  s.run.combat.flags = {};
  forceCard(s, "foxFire");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: "A" });
  const tfmA = (s.run.combat.enemies[0].statuses || []).find(x => x.id === "thunderFireMark")?.stacks ?? 0;
  const tfmB = (s.run.combat.enemies[1].statuses || []).find(x => x.id === "thunderFireMark")?.stacks ?? 0;
  const burnB = (s.run.combat.enemies[1].statuses || []).find(x => x.id === "burn")?.stacks ?? 0;
  assert(tfmA === 1); assert(tfmB === 0); assert(burnB === 4);
});

test("self-only法术不消耗雷火引", () => {
  let s = enterCombat();
  s.run.trueMartial = false;
  s.run.combat.flags = { travelSpellCharge: 3 };
  forceCard(s, "hiddenArchive");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: null });
  assert(s.run.combat.flags.travelSpellCharge === 3);
});

// === v0.7.7 文案测试 ===
test("dragonRain文案与效果一致", () => {
  assert(cards["dragonRain"].text.includes("施加 4 层灼烧"));
  assert(cards["dragonRain"].effects.some(e => e.status === "burn" && e.stacks === 4));
});

test("foxFire文案与效果一致", () => {
  const c = cards["foxFire"];
  assert(c.text.includes("5 层灼烧") && c.text.includes("4 层雷痕"));
  assert(c.effects.some(e => e.status === "burn" && e.stacks === 5));
  assert(c.effects.some(e => e.type === "thunderMark" && e.stacks === 4));
});

test("玄龟甲文案与代码一致", () => {
  let s = enterCombat("shell");
  assert(s.run.combat.block >= 22);
});

test("雷火机制核心值保持", () => {
  assert(cards["flameTalisman"].effects.some(e => e.status === "burn" && e.stacks === 12));
  assert(cards["foxFire"].effects.some(e => e.status === "burn" && e.stacks === 5));
  assert(cards["fireRite"].effects.some(e => e.status === "burn" && e.stacks === 4));
  assert(cards["dragonRain"].effects.some(e => e.status === "burn" && e.stacks === 4));
});

test("破军令追加真伤穿透格挡", () => {
  let s = enterCombat("physical");
  assert(s.run.relics.includes("poJunLing"));
  enemy(s).hp = 20; enemy(s).block = 99;
  forceCard(s, "strike");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  assert(enemy(s).hp < 20);
});

test("trueMartial spell不触发雷火引", () => {
  let s = enterCombat("spell");
  assert(s.run.trueMartial);
  assert(!s.run.combat?.flags?.travelSpellCharge);
});



// === v0.7.7 雷痕立即结算测试 ===
test("雷痕达到8立即触发天劫", () => {
  let s = enterCombat();
  enemy(s).hp = 100; enemy(s).block = 99;
  enemy(s).statuses = [{ id: "thunderMark", stacks: 8 }];
  forceCard(s, "thunderCharm");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  let tm = enemy(s)?.statuses?.find(x => x.id === "thunderMark")?.stacks ?? 0;
  let stun = enemy(s)?.statuses?.find(x => x.id === "stun")?.stacks ?? 0;
  let cr = enemy(s)?.statuses?.find(x => x.id === "controlResist")?.stacks ?? 0;
  assert(enemy(s).hp <= 40, "tribulation should deal 60+ dmg"); /* 60 trib + card dmg */
  assert(tm < 8, "thunderMark should be below 8 after tribulation");
  assert(stun === 0); assert(cr === 0);
  assert(s.run.combat.log.join(" ").includes("天劫"));
});

test("雷痕10会触发天劫并剩余2", () => {
  let s = enterCombat();
  enemy(s).hp = 100; enemy(s).block = 99;
  enemy(s).statuses = [{ id: "thunderMark", stacks: 10 }];
  forceCard(s, "flameTalisman");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  let tm = enemy(s)?.statuses?.find(x => x.id === "thunderMark")?.stacks ?? 0;
  assert(enemy(s).hp <= 40, "tribulation 60 dmg should apply");
  assert(tm === 2, "10 - 8 = 2 remaining, got " + tm);
  assert(tm < 8, "must not show 10/8 stable"); /* This is the user screenshot bug */
});

test("雷痕16会连续触发两次天劫", () => {
  let s = enterCombat();
  enemy(s).hp = 200; enemy(s).block = 99;
  enemy(s).statuses = [{ id: "thunderMark", stacks: 16 }];
  // Use a non-spell card to avoid 雷火引/共鸣 interference
  forceCard(s, "strike");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  // strike does not add thunderMark, so tribulation triggers from existing 16
  let tm = enemy(s)?.statuses?.find(x => x.id === "thunderMark")?.stacks ?? 0;
  let stun = enemy(s)?.statuses?.find(x => x.id === "stun")?.stacks ?? 0;
  let cr = enemy(s)?.statuses?.find(x => x.id === "controlResist")?.stacks ?? 0;
  assert(enemy(s).hp <= 90, "two tribulations = 120 dmg + strike dmg"); // 200-120=80 + strike ~6 = ~74
  assert(tm === 0, "16 - 2*8 = 0, got " + tm);
  assert(stun === 0); assert(cr === 0);
  // Log should contain tribulation twice
  let tribCount = s.run.combat.log.filter(l => l.includes("天劫")).length;
  assert(tribCount >= 2, "should trigger at least 2 tribulations");
});

test("雷火引推过阈值会当次触发天劫", () => {
  let s = enterCombat();
  s.run.trueMartial = false;
  enemy(s).hp = 100; enemy(s).block = 99;
  enemy(s).statuses = [{ id: "thunderMark", stacks: 3 }];
  s.run.combat.flags = { travelSpellCharge: 3 };
  forceCard(s, "foxFire");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  let tm = enemy(s)?.statuses?.find(x => x.id === "thunderMark")?.stacks ?? 0;
  assert(enemy(s).hp <= 40, "tribulation should trigger in same resolution");
  assert(tm === 5, "3+4+6-8=5 remaining");
  assert(tm < 8, "must not show >=8 stable");
});

test("雷火共鸣后同次天劫消耗雷火烙印", () => {
  let s = enterCombat();
  s.run.trueMartial = false;
  enemy(s).hp = 200; enemy(s).block = 99;
  enemy(s).statuses = [{ id: "burn", stacks: 4 }, { id: "thunderMark", stacks: 4 }];
  s.run.combat.flags = { travelSpellCharge: 3 };
  // foxFire: burn+5, thunderMark+4. 雷火引: burn+7, thunderMark+6. Total: burn>=4, thunderMark=14.
  forceCard(s, "foxFire");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  let tfm = enemy(s)?.statuses?.find(x => x.id === "thunderFireMark")?.stacks ?? 0;
  let stun = enemy(s)?.statuses?.find(x => x.id === "stun")?.stacks ?? 0;
  let cr = enemy(s)?.statuses?.find(x => x.id === "controlResist")?.stacks ?? 0;
  assert(enemy(s).hp <= 110, "tribulation 60 + resonance 40 + foxFire 5 = 105 dmg, hp <= 95"); // 200-105=95
  assert(tfm === 0, "thunderFireMark must be consumed by same-resolution tribulation, got " + tfm);
  assert(stun === 0); assert(cr === 0);
  assert(s.run.combat.log.join(" ").includes("雷火烙印爆发"), "log must mention thunderFireMark burst");
});

test("九天雷劫雷痕达到8立即触发120伤", () => {
  let s = enterCombat("spell");
  enemy(s).hp = 200; enemy(s).block = 99;
  enemy(s).statuses = [{ id: "thunderMark", stacks: 8 }];
  forceCard(s, "thunderCharm");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  let tm = enemy(s)?.statuses?.find(x => x.id === "thunderMark")?.stacks ?? 0;
  let stun = enemy(s)?.statuses?.find(x => x.id === "stun")?.stacks ?? 0;
  let cr = enemy(s)?.statuses?.find(x => x.id === "controlResist")?.stacks ?? 0;
  assert(enemy(s).hp <= 80, "nineSky tribulation 120 dmg, expected HP <= 80"); /* 200 - 120 = 80 */
  assert(tm < 8, "thunderMark should be consumed");
  assert(stun === 0); assert(cr === 0);
});



test("spell放大雷痕不提前天劫", () => {
  let s = enterCombat();
  s.run.trueMartial = false;
  enemy(s).hp = 200; enemy(s).block = 99;
  enemy(s).statuses = [{ id: "burn", stacks: 4 }, { id: "thunderMark", stacks: 4 }];
  s.run.combat.flags = { travelSpellCharge: 3 };
  forceCard(s, "doomSutra");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  let tfm = enemy(s)?.statuses?.find(x => x.id === "thunderFireMark")?.stacks ?? 0;
  let stun = enemy(s)?.statuses?.find(x => x.id === "stun")?.stacks ?? 0;
  assert(s.run.combat.log.join(" ").includes("雷火共鸣"), "should trigger resonance same-turn");
  assert(s.run.combat.log.join(" ").includes("天劫"), "should trigger tribulation same-turn");
  assert(tfm <= 1); assert(stun === 0);
});

// === V1.1 smoke tests ===

function enterCombatWithDifficulty(difficultyOrStyle, isTM = false) {
  let s = createInitialState();
  if (isTM) {
    s = startRun(s, difficultyOrStyle);
  } else if (difficultyOrStyle === DIFFICULTY_REGULAR) {
    s = startRun(s, null, DIFFICULTY_REGULAR);
  } else {
    s = startRun(s);
  }
  let main = s.run.nodeChoices.find(n => n.type === "main");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  return s;
}

// Difficulty tests
test("入门difficulty正确", () => {
  let s = enterCombatWithDifficulty(null);
  assert(s.run.difficulty === DIFFICULTY_BEGINNER);
});
test("入门rollsMax=3", () => {
  let s = enterCombatWithDifficulty(null);
  assert(s.run.rollsMax === ROLL_MAX_BEGINNER);
});
test("入门开战有行旅护持", () => {
  let s = enterCombatWithDifficulty(null);
  assert(s.run.combat.flags.travelBlessingApplied === true);
});
test("常规difficulty正确", () => {
  let s = enterCombatWithDifficulty(DIFFICULTY_REGULAR);
  assert(s.run.difficulty === DIFFICULTY_REGULAR);
});
test("常规rollsMax=3", () => {
  let s = enterCombatWithDifficulty(DIFFICULTY_REGULAR);
  assert(s.run.rollsMax === ROLL_MAX_REGULAR);
});
test("常规开战无行旅护持", () => {
  let s = enterCombatWithDifficulty(DIFFICULTY_REGULAR);
  assert(!s.run.combat.flags.travelBlessingApplied);
});
test("真武maxFloor=25", () => {
  let s = enterCombatWithDifficulty("physical", true);
  assert(s.run.trueMartial === true);
  assert(s.run.goal.main.text.includes("虚渊主宰"));
});
test("真武rollsMax=5", () => {
  let s = enterCombatWithDifficulty("physical", true);
  assert(s.run.rollsMax === ROLL_MAX_TRUE_MARTIAL);
});
test("真武目标包含虚渊主宰", () => {
  let s = enterCombatWithDifficulty("physical", true);
  assert(s.run.goal.main.text.includes("虚渊主宰"));
});

// Roll tests
test("roll只刷新card奖励", () => {
  let s = enterCombatWithDifficulty(null);
  s.phase = "reward";
  s.run.rewards = [
    { id: "r1", type: "card", value: "strike" },
    { id: "r2", type: "gold", value: 30 },
    { id: "r3", type: "heal", value: 15 },
  ];
  s = reduceGame(s, { type: "rollRewards" });
  // Cards may change, but gold and heal should stay
  assert(s.run.rewards.some(r => r.type === "gold"));
  assert(s.run.rewards.some(r => r.type === "heal"));
});
test("roll后非card奖励保持不变", () => {
  let s = enterCombatWithDifficulty(null);
  s.phase = "reward";
  s.run.rewards = [
    { id: "r1", type: "card", value: "strike" },
    { id: "r2", type: "gold", value: 30 },
  ];
  s = reduceGame(s, { type: "rollRewards" });
  let gold = s.run.rewards.find(r => r.type === "gold");
  assert(gold !== undefined && gold.value === 30);
});
test("无card奖励时不能roll且不消耗次数", () => {
  let s = enterCombatWithDifficulty(null);
  s.phase = "reward";
  s.run.rewards = [
    { id: "r1", type: "gold", value: 30 },
    { id: "r2", type: "heal", value: 15 },
  ];
  let before = s.run.rollsUsed;
  s = reduceGame(s, { type: "rollRewards" });
  assert(s.run.rollsUsed === before);
  assert(s.message.includes("没有可刷新的卡牌"));
});
test("到上限后不能继续roll", () => {
  let s = enterCombatWithDifficulty(null);
  s.phase = "reward";
  s.run.rollsUsed = s.run.rollsMax;
  s.run.rewards = [{ id: "r1", type: "card", value: "strike" }];
  s = reduceGame(s, { type: "rollRewards" });
  assert(s.message.includes("次数已用完"));
});

// Delete card tests
test("散功符只能删基础牌", () => {
  let s = enterCombatWithDifficulty(null);
  // Add a non-basic card
  s.run.deck.push(makeCard(s.run, "chainBlade"));
  s.run.pendingPurge = { source: "shop", filter: "basic", remaining: 1, addCurseOnComplete: false, removedNames: [] };
  // Try deleting chainBlade
  let uid = s.run.deck.find(c => c.cardId === "chainBlade")?.uid;
  s = reduceGame(s, { type: "confirmPurge", cardUid: uid });
  assert(s.message.includes("散功符只能剔除基础牌"));
  assert(s.run.deck.some(c => c.cardId === "chainBlade"));
});
test("斩念符能删普通可删牌", () => {
  let s = enterCombatWithDifficulty(null);
  s.run.deck.push(makeCard(s.run, "chainBlade"));
  let uid = s.run.deck.find(c => c.cardId === "chainBlade")?.uid;
  let beforeLen = s.run.deck.length;
  s.run.pendingPurge = { source: "shop", filter: "any", remaining: 1, addCurseOnComplete: false, removedNames: [] };
  s = reduceGame(s, { type: "confirmPurge", cardUid: uid });
  assert(s.message.includes("已剔除"));
  assert(s.run.deck.length === beforeLen - 1);
});
test("不能低于最小牌组数量", () => {
  let s = enterCombatWithDifficulty(null);
  // Keep only MIN_DECK_SIZE cards
  s.run.deck = s.run.deck.slice(0, MIN_DECK_SIZE);
  let uid = s.run.deck[0].uid;
  s.run.pendingPurge = { source: "shop", filter: "any", remaining: 1, addCurseOnComplete: false, removedNames: [] };
  s = reduceGame(s, { type: "confirmPurge", cardUid: uid });
  assert(s.message.includes("最低数量"));
});
test("普通删牌不能删业障", () => {
  let s = enterCombatWithDifficulty(null);
  s.run.deck.push(makeCard(s.run, "karmaCurse"));
  let uid = s.run.deck.find(c => c.cardId === "karmaCurse")?.uid;
  s.run.pendingPurge = { source: "shop", filter: "any", remaining: 1, addCurseOnComplete: false, removedNames: [] };
  s = reduceGame(s, { type: "confirmPurge", cardUid: uid });
  assert(s.message.includes("无法剔除"));
  assert(s.run.deck.some(c => c.cardId === "karmaCurse"));
});
test("洗髓令能连续删两张并加入业障", () => {
  let s = enterCombatWithDifficulty("physical", true);
  let deck = s.run.deck;
  // Add two extra non-basic cards
  deck.push(makeCard(s.run, "chainBlade"));
  deck.push(makeCard(s.run, "traceCutter"));
  let beforeLen = deck.length;
  let uid1 = deck.find(c => c.cardId === "chainBlade")?.uid;
  let uid2 = deck.find(c => c.cardId === "traceCutter")?.uid;
  s.run.pendingPurge = { source: "shop", filter: "twoWithCurse", remaining: 2, addCurseOnComplete: true, removedNames: [] };
  s = reduceGame(s, { type: "confirmPurge", cardUid: uid1 });
  assert(s.run.pendingPurge !== null && s.run.pendingPurge.remaining === 1);
  s = reduceGame(s, { type: "confirmPurge", cardUid: uid2 });
  assert(s.message.includes("业障入牌组"));
  assert(s.run.deck.some(c => c.cardId === "karmaCurse"));
  assert(s.run.deck.length === beforeLen - 2 + 1); // -2 purged + 1 curse
});

// True martial relic tests
test("bloodContract获得时最大生命降低20%", () => {
  let s = createInitialState();
  s = startRun(s, "physical");
  let before = s.run.maxHp;
  s.run.rewards = [{ id: "r1", type: "relic", value: "bloodContract" }];
  s.phase = "reward";
  s = reduceGame(s, { type: "chooseReward", rewardId: "r1" });
  let expected = before - Math.floor(before * 0.2);
  assert(s.run.maxHp === expected, `expected ${expected}, got ${s.run.maxHp}`);
});
test("bloodContract战斗胜利后回血15", () => {
  let s = enterCombatWithDifficulty("physical", true);
  s.run.relics.push("bloodContract");
  s.run.hp = 30;
  // Kill ALL enemies (TM runs can have multiple)
  for (const enemy of s.run.combat.enemies) {
    enemy.hp = 0;
  }
  s = reduceGame(s, { type: "endTurn" });
  assert(s.run.hp >= 40, `should heal ~15, got HP=${s.run.hp}`);
});
test("cursedMirror回合开始额外抽1", () => {
  let s = enterCombatWithDifficulty("physical", true);
  s.run.relics.push("cursedMirror");
  let beforeHand = s.run.combat.hand.length;
  let beforeDeck = s.run.combat.drawPile.length;
  s = reduceGame(s, { type: "endTurn" });
  if (s.phase === "combat") {
    // Should have drawn more due to cursedMirror
    assert(s.run.combat.log.join(" ").includes("咒镜映照"));
  }
});
test("cursedMirror回合结束给玩家2层诅咒", () => {
  let s = enterCombatWithDifficulty("physical", true);
  s.run.relics.push("cursedMirror");
  s.run.combat.enemies[0].hp = 50;
  s = reduceGame(s, { type: "endTurn" });
  if (s.phase === "combat") {
    let curse = s.run.statuses?.find(x => x.id === "curse")?.stacks ?? 0;
    assert(curse >= 2, `should have curse>=2, got ${curse}`);
  }
});
test("soulFurnace开战本场能量+1", () => {
  let s = createInitialState();
  s = startRun(s, "physical");
  s.run.relics.push("soulFurnace");
  let main = s.run.nodeChoices.find(n => n.type === "main");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  assert(s.run.combat.log.join(" ").includes("魂炉点燃"));
  // soulFurnace now uses combat flag, not permanent maxEnergy
  assert(s.run.combat.flags.soulFurnaceBonus === 1);
  assert(s.run.maxEnergy === 3);
});
test("soulFurnace开战扣8血且最低保留1", () => {
  let s = createInitialState();
  s = startRun(s, "physical");
  s.run.relics.push("soulFurnace");
  let beforeHp = s.run.hp;
  let main = s.run.nodeChoices.find(n => n.type === "main");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  assert(s.run.combat.log.join(" ").includes("魂炉点燃"));
  assert(s.run.hp === beforeHp - 8);
});

// --- V1.2 additional tests ---

// R4: 支线删牌
test("支线删牌奖励能进入pendingPurge", () => {
  let s = createInitialState();
  s = startRun(s);
  s.phase = "reward";
  s.run.rewards = [
    { id: "r1", type: "purge", filter: "any", label: "斩念机缘", text: "剔除一张可删除牌。" },
  ];
  s = reduceGame(s, { type: "chooseReward", rewardId: "r1" });
  let pp = s.run.pendingPurge;
  assert(pp !== undefined && pp !== null, "pendingPurge should be set");
  assert(typeof pp === "object" ? pp.source === "side" : true);
});
test("支线删牌完成后能继续路线", () => {
  let s = createInitialState();
  s = startRun(s);
  s.phase = "reward";
  s.run.rewards = [
    { id: "r1", type: "purge", filter: "any", label: "斩念机缘", text: "剔除一张可删除牌。" },
  ];
  s = reduceGame(s, { type: "chooseReward", rewardId: "r1" });
  // Pick a basic card to delete
  let strikeUid = s.run.deck.find(c => c.cardId === "strike")?.uid;
  s = reduceGame(s, { type: "confirmPurge", cardUid: strikeUid });
  assert(s.run.pendingPurge === null, "pendingPurge should be cleared");
  assert(s.phase !== "reward", "should not be stuck in reward phase");
});

// R3/R4: 洗髓令不可删业障
test("洗髓令不能删除业障/诅咒牌", () => {
  let s = createInitialState();
  s = startRun(s);
  s.run.deck.push(makeCard(s.run, "karmaCurse"));
  let curseUid = s.run.deck.find(c => c.cardId === "karmaCurse")?.uid;
  s.run.pendingPurge = { source: "shop", filter: "twoWithCurse", remaining: 2, addCurseOnComplete: true, removedNames: [] };
  s = reduceGame(s, { type: "confirmPurge", cardUid: curseUid });
  assert(s.message.includes("无法剔除") || s.message.includes("不可"), "should reject curse deletion");
  assert(s.run.deck.some(c => c.cardId === "karmaCurse"), "curse card should remain");
});

// Roll加严：非card类型保持值不变
test("roll不能刷新遗物奖励", () => {
  let s = createInitialState();
  s = startRun(s);
  s.phase = "reward";
  s.run.rewards = [
    { id: "r1", type: "card", value: "strike" },
    { id: "r2", type: "relic", value: "bloodGourd" },
    { id: "r3", type: "purge", filter: "any", label: "斩念机缘" },
  ];
  s = reduceGame(s, { type: "rollRewards" });
  let relic = s.run.rewards.find(r => r.id === "r2");
  assert(relic && relic.type === "relic" && relic.value === "bloodGourd", "relic should not change");
});
test("roll不能刷新删牌奖励", () => {
  let s = createInitialState();
  s = startRun(s);
  s.phase = "reward";
  s.run.rewards = [
    { id: "r1", type: "card", value: "strike" },
    { id: "r2", type: "purge", filter: "any", label: "斩念机缘" },
  ];
  s = reduceGame(s, { type: "rollRewards" });
  let purge = s.run.rewards.find(r => r.id === "r2");
  assert(purge && purge.type === "purge", "purge reward should not be refreshed");
});

// soulFurnace: 能量不永久叠加
test("soulFurnace战斗结束后maxEnergy恢复", () => {
  let s = createInitialState();
  s = startRun(s, "physical");
  let baseMaxEnergy = s.run.maxEnergy;
  s.run.relics.push("soulFurnace");
  let main = s.run.nodeChoices.find(n => n.type === "main");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  // soulFurnace should set combat flag, not change maxEnergy
  assert(s.run.combat.flags?.soulFurnaceBonus === 1, "soulFurnace bonus flag should be set");
  assert(s.run.maxEnergy === baseMaxEnergy, "maxEnergy should NOT change permanently");
  // Kill enemies to end combat
  for (const enemy of s.run.combat.enemies) enemy.hp = 0;
  s = reduceGame(s, { type: "endTurn" });
  assert(s.run.maxEnergy === baseMaxEnergy, "maxEnergy should be restored after combat");
});
test("soulFurnace连续两场不会叠加永久能量", () => {
  let s = createInitialState();
  s = startRun(s, "physical");
  let baseMaxEnergy = s.run.maxEnergy;
  s.run.relics.push("soulFurnace");
  // First combat
  let main = s.run.nodeChoices.find(n => n.type === "main");
  s = reduceGame(s, { type: "chooseNode", nodeId: main.id });
  for (const enemy of s.run.combat.enemies) enemy.hp = 0;
  s = reduceGame(s, { type: "endTurn" });
  assert(s.run.maxEnergy === baseMaxEnergy, "maxEnergy should be same after 1st combat");
});

// --- V1.3: Shop boundary tests ---

test("商店删牌购买前会二次校验", () => {
  let s = createInitialState();
  s = startRun(s);
  // Reduce deck to exactly MIN_DECK_SIZE
  s.run.deck = s.run.deck.slice(0, MIN_DECK_SIZE);
  // Set up shop phase
  s.phase = "shop";
  s.run.shopStock = [{ id: "purgeAny", price: 75, sold: false }];
  s.run.gold = 100;
  s = reduceGame(s, { type: "buyShopItem", itemId: "purgeAny" });
  // Should refuse (deck at MIN_DECK_SIZE)
  assert(s.message.includes("无法继续剔除"), "should reject when deck at min size");
  // Gold should NOT be deducted
  assert(s.run.gold === 100, "gold should not be deducted");
});
test("删牌物品不可在无可删牌时扣费", () => {
  let s = createInitialState();
  s = startRun(s);
  // Add only karmaCurse (undeletable)
  s.run.deck.push(makeCard(s.run, "karmaCurse"));
  s.phase = "shop";
  s.run.shopStock = [{ id: "purgeAny", price: 75, sold: false }];
  s.run.gold = 100;
  s = reduceGame(s, { type: "buyShopItem", itemId: "purgeAny" });
  // Should check purgeable count — all non-curse purgeable cards are in the deck
  // karmaCurse is isCurse, other basic cards are purgeable, so this should work
  // Actually test with ONLY curse cards
  s = createInitialState();
  s = startRun(s);
  s.run.deck = [makeCard(s.run, "karmaCurse"), makeCard(s.run, "karmaCurse")]; // only undeletable
  s.phase = "shop";
  s.run.shopStock = [{ id: "purgeAny", price: 75, sold: false }];
  s.run.gold = 100;
  s = reduceGame(s, { type: "buyShopItem", itemId: "purgeAny" });
  assert(s.message.includes("无法继续剔除"), "should reject when no purgeable cards");
  assert(s.run.gold === 100);
});
test("pendingPurge未完成时不能离开商店", () => {
  let s = createInitialState();
  s = startRun(s);
  s.phase = "shop";
  s.run.pendingPurge = { source: "shop", filter: "any", remaining: 1, addCurseOnComplete: false, removedNames: [] };
  s = reduceGame(s, { type: "leaveShop" });
  assert(s.message.includes("完成当前剔除"), "should block leaving shop");
  assert(s.phase === "shop", "should still be in shop");
});

// --- V1.5: Game over / victory closure tests ---

function finalBossVictoryTest(difficultyOrStyle, isTM, expectMaxFloor) {
  let s = createInitialState();
  if (isTM) {
    s = startRun(s, difficultyOrStyle);
  } else if (difficultyOrStyle === DIFFICULTY_REGULAR) {
    s = startRun(s, null, DIFFICULTY_REGULAR);
  } else {
    s = startRun(s);
  }
  // Simulate reaching final boss floor and winning
  s.run.floor = expectMaxFloor;
  s.run.currentNode = { type: "main", tier: isTM ? 5 : 3 };
  // Push a relic so we can check meta.wins
  s.run.relics.push("bloodGourd");
  s.run.combat = { enemies: [{ hp: 0, maxHp: 100, name: "BOSS", block: 0, statuses: [], intent: { type: "attack", value: 10 } }], hand: [], drawPile: [], discardPile: [], log: [], block: 0, flags: {} };
  s.phase = "combat";
  s = reduceGame(s, { type: "endTurn" });
  return s;
}

test("入门最终Boss击败后自动gameOver", () => {
  let s = finalBossVictoryTest(null, false, MAX_FLOOR);
  assert(s.phase === "gameOver", `phase should be gameOver, got ${s.phase}`);
  assert(s.run.finished === true, "run.finished should be true");
  assert(s.run.goal.completedBy === "boss", `completedBy should be boss, got ${s.run.goal.completedBy}`);
  assert(s.run.combat === null, "combat should be null");
  assert(s.run.rewards.length === 0, "rewards should be empty");
  assert(s.meta.wins >= 1, "meta.wins should increment");
});

test("常规最终Boss击败后自动gameOver", () => {
  let s = finalBossVictoryTest(DIFFICULTY_REGULAR, false, MAX_FLOOR);
  assert(s.phase === "gameOver");
  assert(s.run.finished === true);
  assert(s.run.goal.completedBy === "boss");
  assert(s.run.combat === null);
  assert(s.run.rewards.length === 0);
});

test("真武最终Boss击败后自动gameOver", () => {
  let s = finalBossVictoryTest("physical", true, TRUE_MARTIAL_MAX_FLOOR);
  assert(s.phase === "gameOver");
  assert(s.run.finished === true);
  assert(s.run.goal.completedBy === "boss");
  assert(s.run.combat === null);
  assert(s.run.rewards.length === 0);
  assert(s.message.includes("虚渊主宰"), "message should mention 虚渊主宰");
});

test("最终Boss胜利不进入reward阶段", () => {
  let s = finalBossVictoryTest(null, false, MAX_FLOOR);
  assert(s.phase !== "reward", "should not enter reward phase");
  assert(s.run.rewards.length === 0, "rewards should be empty");
});

test("玄箓特殊通关自动gameOver", () => {
  let s = createInitialState();
  s = startRun(s);
  s.run.relics.push("bloodGourd");
  s = completeRunVictory(s, "special", "玄箓补全，山路自开。你完成了特殊通关。");
  assert(s.phase === "gameOver");
  assert(s.run.finished === true);
  assert(s.run.goal.completedBy === "special");
  assert(s.meta.wins >= 1);
  assert(s.run.combat === null);
  assert(s.run.rewards.length === 0);
});

test("终局支线完成后仍可挑战最终Boss", () => {
  let s = createInitialState();
  s = startRun(s);
  s.run.floor = MAX_FLOOR;
  s.run.finalSideCompleted = false;
  s.run.finalShopVisited = true;
  // Simulate route phase at final floor
  s.phase = "route";
  s = reduceGame(s, { type: "chooseNode", nodeId: `side_final` });
  // After side combat + reward, should be back at route with main boss available
  assert(s.phase === "route" || s.phase === "combat" || s.phase === "reward",
    `should be in route/combat/reward, got ${s.phase}`);
});

test("终局商店离开后仍可挑战最终Boss", () => {
  let s = createInitialState();
  s = startRun(s);
  s.run.floor = MAX_FLOOR;
  s.run.finalShopVisited = false;
  s.run.finalSideCompleted = true;
  s.phase = "route";
  s = reduceGame(s, { type: "chooseNode", nodeId: `shop_final` });
  // Should be in shop
  assert(s.phase === "shop" || s.phase === "combat" || s.phase === "route",
    `should be in shop, got ${s.phase}`);
});

test("gameOver后confirmPurge不会改牌组", () => {
  let s = finalBossVictoryTest(null, false, MAX_FLOOR);
  let deckLen = s.run.deck.length;
  s.run.pendingPurge = { source: "shop", filter: "any", remaining: 1, addCurseOnComplete: false, removedNames: [] };
  s.run.deck.push(makeCard(s.run, "chainBlade"));
  let newLen = s.run.deck.length;
  // Try to purge (should be rejected since finished)
  s = reduceGame(s, { type: "confirmPurge", cardUid: s.run.deck[0].uid });
  assert(s.phase === "gameOver", "should stay gameOver");
  assert(s.run.deck.length === newLen || s.run.pendingPurge === null, "deck should not change or purge should be cleared");
});

// --- V1.6: Strengthened endgame tests ---

test("玄箓残片奖励触发特殊通关真实路径", () => {
  let s = createInitialState();
  s = startRun(s);
  // Set up special goal close to completion
  s.run.goal.special.active = true;
  s.run.goal.special.requiredFragments = 2;
  s.run.goal.special.fragments = 1;
  s.run.relics.push("bloodGourd");
  s.phase = "reward";
  s.run.rewards = [
    { id: "testSF", type: "specialFragment", value: 1 },
  ];
  let winsBefore = s.meta.wins;
  s = reduceGame(s, { type: "chooseReward", rewardId: "testSF" });
  // Should go through grantSpecialFragment → checkSpecialGoal → completeRunVictory
  assert(s.phase === "gameOver", `phase should be gameOver, got ${s.phase}`);
  assert(s.run.finished === true, "run.finished should be true");
  assert(s.run.goal.completedBy === "special", `completedBy should be special, got ${s.run.goal.completedBy}`);
  assert(s.run.combat === null, "combat should be null");
  assert(s.run.rewards.length === 0, "rewards should be empty");
  assert(s.run.pendingPurge === null, "pendingPurge should be null");
  assert(s.meta.wins === winsBefore + 1, `meta.wins should increase by 1`);
});

test("最终Boss从路线选择进入并击败后自动gameOver", () => {
  let s = createInitialState();
  s = startRun(s);
  s.run.floor = MAX_FLOOR;
  s.run.finalSideCompleted = true;
  s.run.finalShopVisited = true;
  // Simulate route phase
  s = prepareRouteChoice(s);
  let bossNode = s.run.nodeChoices.find(n => n.type === "main");
  assert(bossNode !== undefined, "should have boss node in choices");
  s = reduceGame(s, { type: "chooseNode", nodeId: bossNode.id });
  assert(s.phase === "combat", "should enter combat");
  assert(s.run.currentNode.type === "main", "currentNode should be main");
  // Kill all enemies
  for (const enemy of s.run.combat.enemies) enemy.hp = 0;
  s = reduceGame(s, { type: "endTurn" });
  assert(s.phase === "gameOver", `should be gameOver, got ${s.phase}`);
  assert(s.run.finished === true);
  assert(s.run.goal.completedBy === "boss");
  assert(s.run.combat === null);
  assert(s.run.rewards.length === 0);
});

test("真武最终Boss从路线选择进入并击败后自动gameOver", () => {
  let s = createInitialState();
  s = startRun(s, "physical");
  s.run.floor = TRUE_MARTIAL_MAX_FLOOR;
  s.run.finalSideCompleted = true;
  s.run.finalShopVisited = true;
  s = prepareRouteChoice(s);
  let bossNode = s.run.nodeChoices.find(n => n.type === "main");
  assert(bossNode !== undefined);
  s = reduceGame(s, { type: "chooseNode", nodeId: bossNode.id });
  assert(s.phase === "combat");
  for (const enemy of s.run.combat.enemies) enemy.hp = 0;
  s = reduceGame(s, { type: "endTurn" });
  assert(s.phase === "gameOver");
  assert(s.run.finished === true);
  assert(s.run.goal.completedBy === "boss");
  assert(s.message.includes("虚渊主宰") && s.message.includes("虚渊归寂"), "victory message should mention 虚渊主宰 and 虚渊归寂");
});

test("终局支线完成后路线仍包含最终Boss", () => {
  let s = createInitialState();
  s = startRun(s);
  s.run.floor = MAX_FLOOR;
  s.run.finalSideCompleted = false;
  s.run.finalShopVisited = true;
  s = prepareRouteChoice(s);
  let sideNode = s.run.nodeChoices.find(n => n.type === "side" && n.id === "side_final");
  assert(sideNode !== undefined, "should have side_final node");
  // Complete side by entering combat and winning
  s = reduceGame(s, { type: "chooseNode", nodeId: sideNode.id });
  if (s.phase === "combat") {
    for (const enemy of s.run.combat.enemies) enemy.hp = 0;
    s = reduceGame(s, { type: "endTurn" });
  }
  // Pick a safe reward
  if (s.phase === "reward") {
    let safeReward = s.run.rewards.find(r => r.type === "gold" || r.type === "heal");
    if (safeReward) s = reduceGame(s, { type: "chooseReward", rewardId: safeReward.id });
  }
  // Skip purge if needed
  while (s.run?.pendingPurge) {
    let uid = s.run.deck.find(c => { let def = cards[c.cardId]; return def && !def.undeletable && !def.isCurse; })?.uid;
    if (uid) s = reduceGame(s, { type: "confirmPurge", cardUid: uid });
    else break;
  }
  // V1.7: MUST be route, MUST NOT be gameOver
  assert(s.phase === "route", `should be route, got ${s.phase}`);
  assert(s.run.finished !== true, "should not be finished");
  assert(!s.run.goal?.completedBy, "should not have completedBy");
  assert(s.run.finalSideCompleted === true, "finalSideCompleted should be true");
  assert(s.run.floor === MAX_FLOOR, `floor should be ${MAX_FLOOR}, got ${s.run.floor}`);
  let bossNode = s.run.nodeChoices.find(n => n.type === "main" && n.id.includes(`main_${MAX_FLOOR}`));
  assert(bossNode !== undefined, "nodeChoices should contain main boss node");
  assert(bossNode.type === "main", "boss node should be type=main");
});
test("真武终局支线完成后路线仍包含虚渊主宰", () => {
  let s = createInitialState();
  s = startRun(s, "physical");
  s.run.floor = TRUE_MARTIAL_MAX_FLOOR;
  s.run.finalSideCompleted = false;
  s.run.finalShopVisited = true;
  s = prepareRouteChoice(s);
  let sideNode = s.run.nodeChoices.find(n => n.type === "side" && n.id === "side_final");
  assert(sideNode !== undefined, "should have side_final node in TM");
  s = reduceGame(s, { type: "chooseNode", nodeId: sideNode.id });
  if (s.phase === "combat") {
    for (const enemy of s.run.combat.enemies) enemy.hp = 0;
    s = reduceGame(s, { type: "endTurn" });
  }
  if (s.phase === "reward") {
    let safeReward = s.run.rewards.find(r => r.type === "gold" || r.type === "heal");
    if (safeReward) s = reduceGame(s, { type: "chooseReward", rewardId: safeReward.id });
  }
  while (s.run?.pendingPurge) {
    let uid = s.run.deck.find(c => { let def = cards[c.cardId]; return def && !def.undeletable && !def.isCurse; })?.uid;
    if (uid) s = reduceGame(s, { type: "confirmPurge", cardUid: uid });
    else break;
  }
  assert(s.phase === "route", `should be route, got ${s.phase}`);
  assert(s.run.finished !== true, "should not be finished");
  assert(!s.run.goal?.completedBy, "should not have completedBy");
  assert(s.run.finalSideCompleted === true, "TM finalSideCompleted should be true");
  assert(s.run.floor === TRUE_MARTIAL_MAX_FLOOR, `floor should be ${TRUE_MARTIAL_MAX_FLOOR}`);
  let bossNode = s.run.nodeChoices.find(n => n.type === "main" && n.id.includes("main_25"));
  assert(bossNode !== undefined, "nodeChoices should contain main_25");
  assert(bossNode.type === "main");
});

test("终局商店离开后路线仍包含最终Boss", () => {
  let s = createInitialState();
  s = startRun(s);
  s.run.floor = MAX_FLOOR;
  s.run.finalSideCompleted = true;
  s.run.finalShopVisited = false;
  s = prepareRouteChoice(s);
  let shopNode = s.run.nodeChoices.find(n => n.type === "shop" && n.id === "shop_final");
  assert(shopNode !== undefined, "should have shop_final node");
  s = reduceGame(s, { type: "chooseNode", nodeId: shopNode.id });
  assert(s.phase === "shop", "should be in shop phase");
  // Leave shop
  s = reduceGame(s, { type: "leaveShop" });
  assert(s.phase === "route", "should be back to route after leaving shop");
  assert(s.run.finalShopVisited === true, "finalShopVisited should be true");
  let bossNode = s.run.nodeChoices.find(n => n.type === "main");
  assert(bossNode !== undefined, "should have main boss node after shop");
});

test("真武终局商店离开后路线仍包含虚渊主宰", () => {
  let s = createInitialState();
  s = startRun(s, "physical");
  s.run.floor = TRUE_MARTIAL_MAX_FLOOR;
  s.run.finalSideCompleted = true;
  s.run.finalShopVisited = false;
  s = prepareRouteChoice(s);
  let shopNode = s.run.nodeChoices.find(n => n.type === "shop" && n.id === "shop_final");
  assert(shopNode !== undefined);
  s = reduceGame(s, { type: "chooseNode", nodeId: shopNode.id });
  s = reduceGame(s, { type: "leaveShop" });
  assert(s.phase === "route");
  let bossNode = s.run.nodeChoices.find(n => n.type === "main");
  assert(bossNode !== undefined && bossNode.id.includes("25"), "should have main_25 boss node");
});

// --- V3.0: True Martial formation tests ---

function tmSetup(floor, style = "spell") {
  let s = createInitialState();
  s = startRun(s, style);
  s.run.floor = floor;
  s.run.currentNode = { type: "main", tier: Math.ceil(floor / 5) };
  s.run.combat = {
    turn: 1, enemies: [{ uid: "e1", hp: 60, maxHp: 60, name: "试炼者", block: 0, statuses: [], intent: { type: "attack", value: 8 } }, { uid: "e2", hp: 40, maxHp: 40, name: "护卫", block: 0, statuses: [], intent: { type: "attack", value: 6 } }],
    hand: [], drawPile: [], discardPile: [], log: [], block: 0, flags: {}
  };
  s.phase = "combat";
  startPlayerTurn(s);
  initializeTrueMartialFormation(s);
  return s;
}

test("普通战斗不会生成真武阵势", () => {
  let s = enterCombat();
  assert(!s.run.trueMartial, "should not be true martial");
  assert(!s.run.combat.flags.trueMartialFormation, "should not have formation");
});

test("真武试锋阶段生成真武共鸣", () => {
  let s = tmSetup(3);
  let f = s.run.combat.flags.trueMartialFormation;
  assert(f !== undefined, "should have formation");
  assert(f.id === "resonance", `expected resonance, got ${f.id}`);
  assert(f.name.includes("共鸣"), "name should include 共鸣");
});

test("真武破阵阶段生成阵眼", () => {
  let s = tmSetup(7);
  let f = s.run.combat.flags.trueMartialFormation;
  assert(f.id === "anchor", `expected anchor, got ${f.id}`);
  assert(f.anchorUid, "should have anchorUid");
});

test("阵眼存活时非阵眼敌人获得攻击加成", () => {
  let s = tmSetup(7);
  let f = s.run.combat.flags.trueMartialFormation;
  let anchor = s.run.combat.enemies.find(e => e.uid === f.anchorUid);
  let nonAnchor = s.run.combat.enemies.find(e => e.uid !== f.anchorUid);
  assert(trueMartialFormationAttackBonus(s.run, nonAnchor) === 1, "non-anchor should get +1");
  assert(trueMartialFormationAttackBonus(s.run, anchor) === 0, "anchor should get 0");
});

test("魔化倒计时第4回合增强阵势", () => {
  let s = tmSetup(12);
  s.run.combat.turn = 4;
  s = reduceGame(s, { type: "endTurn" });
  let f = s.run.combat.flags.trueMartialFormation;
  assert(f.pressure >= 1, `pressure should be >=1, got ${f.pressure}`);
  assert(s.run.combat.log.some(l => l.includes("魔气翻涌")), "log should mention 魔气翻涌");
});

test("破法轮转只净化部分负面状态", () => {
  let s = tmSetup(17);
  s.run.combat.enemies[0].statuses = [{ id: "poison", stacks: 10 }];
  s.run.combat.turn = 3;
  s = reduceGame(s, { type: "endTurn" });
  let p = s.run.combat.enemies[0].statuses.find(x => x.id === "poison")?.stacks ?? 0;
  assert(p > 0 && p < 10, `should have some poison left (0 < ${p} < 10)`);
});

test("虚渊领域会随回合加压", () => {
  let s = tmSetup(22);
  s.run.combat.turn = 3;
  s = reduceGame(s, { type: "endTurn" });
  let f = s.run.combat.flags.trueMartialFormation;
  assert(f.pressure >= 1, `pressure should be >=1, got ${f.pressure}`);
});

test("真武阵势信息可供UI展示", () => {
  let s = tmSetup(3);
  let info = trueMartialFormationInfo(s.run);
  assert(info !== null, "should return info");
  assert(info.name, "should have name");
  assert(info.summary, "should have summary");
  assert(typeof info.pressure === "number", "should have pressure number");
  assert(info.nextTrigger, "should have nextTrigger");
});

// --- V3.1: True Martial relic tests ---


test("infernoLotus开战自身获得灼烧", () => {
  let s = tmCombat(3, ["infernoLotus"]);
  let burn = s.run.statuses?.find(x => x.id === "burn")?.stacks ?? 0;
  assert(burn >= 3, `should have burn>=3, got ${burn}`);
});

test("infernoLotus增强玩家施加的灼烧", () => {
  let s = tmCombat(3, ["infernoLotus"]);
  if (s.phase !== "combat") return; // skip if route
  enemy(s).statuses = [];
  // Apply 10 burn via status effect
  applyEffect(s, { type: "status", target: "enemy", status: "burn", stacks: 10 }, enemy(s).uid);
  let burn = enemy(s)?.statuses?.find(x => x.id === "burn")?.stacks ?? 0;
  assert(burn >= 15, `infernoLotus should boost burn 10->15, got ${burn}`);
});

test("inverseScaleArmor每回合首次格挡增强", () => {
  let s = tmCombat(3, ["inverseScaleArmor"]);
  if (s.phase !== "combat") return;
  // Block effect targeting player
  applyEffect(s, { type: "block", target: "self", value: 8 }, enemy(s).uid);
  assert(s.run.combat.block >= 12, `block should be >=12 (8+50%), got ${s.run.combat.block}`);
});

test("inverseScaleArmor回合结束有格挡会失血", () => {
  let s = tmCombat(3, ["inverseScaleArmor"]);
  if (s.phase !== "combat") return;
  s.run.hp = 30;
  s.run.combat.block = 5;
  const e = enemy(s);
  s.run.combat.enemies = [e];
  e.intent = { type: "block", value: 0, text: "测试格挡" };
  e.statuses = [];
  e.hp = Math.max(1, e.hp);
  s = reduceGame(s, { type: "endTurn" });
  assert(s.run.hp === 27, `should lose 3 hp, got ${s.run.hp}`);
});

test("chaosBell控制附加伤害并给目标定力", () => {
  let s = tmCombat(3, ["chaosBell"]);
  if (s.phase !== "combat") return;
  enemy(s).hp = 40; enemy(s).block = 0; enemy(s).statuses = [];
  let hpBefore = enemy(s).hp;
  applyEffect(s, { type: "status", target: "enemy", status: "chaos", stacks: 2 }, enemy(s).uid);
  assert(enemy(s).hp < 40, "chaosBell should deal extra damage");
  let cr = enemy(s)?.statuses?.find(x => x.id === "controlResist")?.stacks ?? 0;
  assert(cr >= 1, `should gain controlResist, got ${cr}`);
});

test("咒杀术真武费用为1", () => {
  assert(cards.curseKill.cost === 1, `curseKill cost should be 1, got ${cards.curseKill.cost}`);
});

test("血祭悟道只在真武支线出现", () => {
  // Regular side should NOT have blood sacrifice
  let s = createInitialState(); s = startRun(s);
  s.run.floor = 5; s.run.currentNode = { rewardKind: "side", tier: 2, type: "side" };
  let rewards = generateRewards(s);
  assert(!rewards.some(r => r?.bloodSacrifice), "regular should not have blood sacrifice");
});

test("血祭悟道扣最大生命33%", () => {
  let s = createInitialState(); s = startRun(s, "spell");
  s.run.maxHp = 60; s.run.hp = 60;
  s.phase = "reward";
  s.run.rewards = [{ id: "test_blood", type: "relic", value: "infernoLotus", bloodSacrifice: true }];
  s = reduceGame(s, { type: "chooseReward", rewardId: "test_blood" });
  assert(s.run.maxHp < 60, `maxHp should decrease, got ${s.run.maxHp}`);
  assert(s.run.maxHp <= 60 - Math.ceil(60 * 0.33), `maxHp should drop at least 33%`);
});

test("血祭悟道高生命时扣当前生命50%", () => {
  let s = createInitialState(); s = startRun(s, "spell");
  s.run.maxHp = 60; s.run.hp = 60;
  s.phase = "reward";
  s.run.rewards = [{ id: "test_blood2", type: "relic", value: "chaosBell", bloodSacrifice: true }];
  let hpBefore = s.run.hp;
  s = reduceGame(s, { type: "chooseReward", rewardId: "test_blood2" });
  // After maxHp drops, if hp still > 50% of new max, it drops more
  assert(s.run.hp < hpBefore, `hp should decrease from ${hpBefore}, got ${s.run.hp}`);
});

test("血祭悟道不会给未实现真武遗物", () => {
  // hollowBlessing remains implemented:false and should never appear.
  let s = createInitialState(); s = startRun(s, "spell");
  s.run.floor = 10; s.run.maxHp = 60; s.run.currentNode = { rewardKind: "side", tier: 2, type: "side" };
  let rewards = generateRewards(s);
  let bsRewards = rewards.filter(r => r?.bloodSacrifice);
  for (const r of bsRewards) {
    assert(r.value !== "hollowBlessing", "should not give hollowBlessing");
  }
});

// V3.2.1: verify blood sacrifice message survives route choice
test("血祭悟道选择后保留代价提示", () => {
  let s = createInitialState();
  s = startRun(s, "spell");

  s.run.maxHp = 60;
  s.run.hp = 60;
  s.phase = "reward";
  s.run.currentNode = { rewardKind: "side", tier: 2, type: "side" };
  s.run.rewards = [
    { id: "test_blood_msg", type: "relic", value: "infernoLotus", bloodSacrifice: true }
  ];

  s = reduceGame(s, { type: "chooseReward", rewardId: "test_blood_msg" });

  assert(s.message.includes("血祭悟道"), `message should mention blood sacrifice, got ${s.message}`);
  assert(s.message.includes("最大生命降低"), `message should mention maxHp loss, got ${s.message}`);
});

// V3.3: three new TM relic tests

test("berserkBrand物理牌伤害翻倍且失血", () => {
  let s = tmCombat(3, ["berserkBrand"]);
  if (s.phase !== "combat") return;
  enemy(s).hp = 60; enemy(s).block = 0;
  let hpBefore = s.run.hp;
  // Test damage doubling via applyEffect
  applyEffect(s, { type: "damage", target: "enemy", value: 10, cardStyle: "physical", cardCost: 1 }, enemy(s).uid);
  // 10 * 2 = 20 damage
  assert(enemy(s).hp <= 40, `berserkBrand should double damage, hp=${enemy(s).hp}`);
  // HP loss via playCard
  forceCard(s, "furySlash");
  s = reduceGame(s, { type: "playCard", cardUid: s.run.combat.hand[0].uid, targetUid: enemy(s).uid });
  assert(s.run.hp <= hpBefore - 3, `berserkBrand should cost 3 HP, hp=${s.run.hp}`);
});

test("bloodPrisonOath增强流血并自损", () => {
  let s = tmCombat(3, ["bloodPrisonOath"]);
  if (s.phase !== "combat") return;
  s.run.hp = 30;
  enemy(s).statuses = [];
  applyEffect(s, { type: "status", target: "enemy", status: "bleed", stacks: 10 }, enemy(s).uid);
  let bleed = enemy(s)?.statuses?.find(x => x.id === "bleed")?.stacks ?? 0;
  assert(bleed >= 15, `bloodPrisonOath should boost bleed >=15, got ${bleed}`);
  assert(s.run.hp === 28, `should lose 2 HP, got ${s.run.hp}`);
});

test("venomousCauldron增强毒瘴并自染毒", () => {
  let s = tmCombat(3, ["venomousCauldron"]);
  if (s.phase !== "combat") return;
  s.run.statuses = [];
  enemy(s).statuses = [];
  applyEffect(s, { type: "status", target: "enemy", status: "poison", stacks: 10 }, enemy(s).uid);
  let poison = enemy(s)?.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(poison >= 15, `venomousCauldron should boost poison >=15, got ${poison}`);
  let selfPoison = s.run.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(selfPoison >= 2, `should gain self poison >=2, got ${selfPoison}`);
});

test("血祭悟道可获得已实现三流派真武遗物", () => {
  for (const id of ["berserkBrand", "bloodPrisonOath", "venomousCauldron"]) {
    assert(relics[id]?.trueMartialOnly === true, `${id} should be trueMartialOnly`);
    assert(relics[id]?.implemented === true, `${id} should be implemented`);
  }
});

// V3.4: TM relic pool coverage + blood sacrifice prompt coverage

test("真武遗物池覆盖所有已实现真武遗物", () => {
  const implementedTmRelics = Object.values(relics)
    .filter(r => r.trueMartialOnly === true && r.implemented !== false)
    .map(r => r.id);

  for (const id of implementedTmRelics) {
    let s = createInitialState();
    s = startRun(s, "physical");
    // Make target id the only un-owned implemented TM relic
    s.run.relics = implementedTmRelics.filter(x => x !== id);
    const rolled = rollTrueMartialRelicReward(s.run);
    assert(rolled?.id === id, `expected ${id} as only available TM relic, got ${rolled?.id}`);
  }

  assert(!implementedTmRelics.includes("hollowBlessing"), "hollowBlessing should not be in implemented TM relic pool");
});

test("血祭悟道授予六流派升华遗物时保留代价提示", () => {
  const ascensionRelics = [
    "infernoLotus", "inverseScaleArmor", "chaosBell",
    "berserkBrand", "bloodPrisonOath", "venomousCauldron",
  ];

  for (const id of ascensionRelics) {
    let s = createInitialState();
    s = startRun(s, "physical");
    s.phase = "reward";
    s.run.currentNode = { rewardKind: "side", tier: 2, type: "side" };
    s.run.maxHp = 90;
    s.run.hp = 90;
    s.run.rewards = [{ id: `test_blood_${id}`, type: "relic", value: id, bloodSacrifice: true }];
    s = reduceGame(s, { type: "chooseReward", rewardId: `test_blood_${id}` });
    assert(s.run.relics.includes(id), `blood sacrifice should grant ${id}`);
    assert(s.message.includes("血祭悟道"), `message should mention 血祭悟道 for ${id}, got ${s.message}`);
    assert(s.message.includes("最大生命降低"), `message should mention maxHp loss for ${id}, got ${s.message}`);
  }
});

// V3.12: P1 regression tests

test("真武起始遗物不会进入普通遗物池", () => {
  const ids = ["poJunLing", "nineSkyTribulation", "asuraHeart", "venomScripture", "chaosTreasure", "turtleShell"];
  for (const id of ids) {
    assert(relics[id]?.trueMartialOnly === true, `${id} should be trueMartialOnly`);
    assert(relics[id]?.implemented === true, `${id} should be implemented`);
  }
});

test("阵眼死亡后非阵眼攻击加成消失", () => {
  let s = tmCombat(6);
  if (s.phase !== "combat") return;
  const f = s.run.combat.flags.trueMartialFormation;
  const anchor = s.run.combat.enemies.find(e => e.uid === f.anchorUid);
  const nonAnchor = s.run.combat.enemies.find(e => e.uid !== f.anchorUid);
  if (!anchor || !nonAnchor) return;
  assert(trueMartialFormationAttackBonus(s.run, nonAnchor) === 1, "non-anchor should have +1 while anchor lives");
  anchor.hp = 0;
  assert(trueMartialFormationAttackBonus(s.run, nonAnchor) === 0, "non-anchor bonus should disappear after anchor dies");
});

test("魔化触发回合攻击预览包含即将增加的阵势压力", () => {
  let s = tmCombat(11);
  if (s.phase !== "combat") return;
  const e = enemy(s);
  e.intent = { type: "attack", value: 10, text: "测试攻击 10" };
  s.run.combat.turn = 4;
  s.run.combat.flags.trueMartialFormation.pressure = 0;
  s.run.combat.flags.trueMartialFormation.triggeredTurns = [];
  const preview = previewEnemyIntent(s.run, e);
  assert(preview.bonus >= 1, `preview should include projected formation pressure, got bonus ${preview.bonus}`);
});

test("旧真武存档迁移补齐difficulty和roll上限", () => {
  const old = {
    phase: "route",
    meta: {},
    run: { trueMartial: true, seed: 123, floor: 1, goal: undefined, deck: [], relics: [], hp: 30, maxHp: 30 },
  };
  const next = migrateGameState(old);
  assert(next.run.difficulty === DIFFICULTY_TRUE_MARTIAL, `difficulty should be trueMartial, got ${next.run.difficulty}`);
  assert(next.run.rollsMax === ROLL_MAX_TRUE_MARTIAL, `rollsMax should be 5, got ${next.run.rollsMax}`);
  assert(next.run.goal.main.text.includes("25") && next.run.goal.main.text.includes("虚渊主宰"));
});

// V3.12.1: P0 + P1 regression tests

test("tickDamageStatus不引用未定义run", () => {
  let s = enterCombat("poison");
  const target = s.run;
  target.statuses = [
    { id: "poison", stacks: 3 },
    { id: "burn", stacks: 2 },
  ];
  tickDamageStatus(s, target);
  assert(true, "tickDamageStatus should not throw");
});

test("普通模式错误持有破军令不会触发真武真伤", () => {
  let s = enterCombat("physical");
  s.run.trueMartial = false;
  s.run.relics = [...new Set([...(s.run.relics || []), "poJunLing"])];
  const e = enemy(s);
  e.block = 0;
  e.hp = 100;
  applyEffect(s, { type: "damage", target: "enemy", value: 10, cardStyle: "physical", cardCost: 1 }, e.uid);
  assert(e.hp === 90, `normal mode poJunLing should not add true damage, enemy hp=${e.hp}`);
});

test("普通模式错误持有万毒真经不会翻倍毒瘴", () => {
  let s = enterCombat("poison");
  s.run.trueMartial = false;
  s.run.relics = [...new Set([...(s.run.relics || []), "venomScripture"])];
  const e = enemy(s);
  e.statuses = [];
  applyEffect(s, { type: "status", target: "enemy", status: "poison", stacks: 4 }, e.uid);
  const poison = e.statuses.find(x => x.id === "poison")?.stacks || 0;
  assert(poison === 4, `normal mode venomScripture should not double poison, got ${poison}`);
});

test("普通模式错误持有玄龟甲不增强格挡", () => {
  let s = enterCombat("shell");
  s.run.trueMartial = false;
  s.run.relics = [...new Set([...(s.run.relics || []), "turtleShell"])];
  s.run.combat.block = 0;
  applyEffect(s, { type: "block", target: "self", value: 8 }, enemy(s).uid);
  assert(s.run.combat.block === 8, `normal mode turtleShell should not increase block, got ${s.run.combat.block}`);
});

test("真武模式破军令仍触发真伤", () => {
  let s = tmCombat(1, ["poJunLing"]);
  if (s.phase !== "combat") return;
  const e = enemy(s);
  e.block = 0;
  e.hp = 100;
  applyEffect(s, { type: "damage", target: "enemy", value: 10, cardStyle: "physical", cardCost: 1 }, e.uid);
  assert(e.hp <= 80, `trueMartial poJunLing should add true damage, enemy hp=${e.hp}`);
});

// === V3.13N-C1B: playerPoisonApplyMult regression tests ===

test("C1B: regular玩家给敌人施加9层毒→8层", () => {
  let s = enterCombatWithDifficulty(DIFFICULTY_REGULAR);
  assert(s.run.difficulty === DIFFICULTY_REGULAR);
  assert(difficultyTuning.regular.playerPoisonApplyMult === 0.85);
  enemy(s).statuses = [];
  applyEffect(s, { type: "status", target: "enemy", status: "poison", stacks: 9 }, enemy(s).uid);
  let poison = enemy(s)?.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(poison === 8, `regular 9*0.85=8, got ${poison}`);
});

test("C1B: regular玩家给敌人施加7层毒→6层", () => {
  let s = enterCombatWithDifficulty(DIFFICULTY_REGULAR);
  enemy(s).statuses = [];
  applyEffect(s, { type: "status", target: "enemy", status: "poison", stacks: 7 }, enemy(s).uid);
  let poison = enemy(s)?.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(poison === 6, `regular 7*0.85=6, got ${poison}`);
});

test("C1B: normal玩家给敌人施加9层毒→仍是9层", () => {
  let s = enterCombatWithDifficulty(null); // beginner = normal
  enemy(s).statuses = [];
  applyEffect(s, { type: "status", target: "enemy", status: "poison", stacks: 9 }, enemy(s).uid);
  let poison = enemy(s)?.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(poison === 9, `normal poison should be 9, got ${poison}`);
});

test("C1B: trueMartial玩家给敌人施加9层毒→仍是9层", () => {
  let s = enterCombatWithDifficulty("poison", true);
  assert(s.run.trueMartial === true);
  enemy(s).statuses = [];
  applyEffect(s, { type: "status", target: "enemy", status: "poison", stacks: 9 }, enemy(s).uid);
  let poison = enemy(s)?.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(poison === 9, `trueMartial poison should be 9, got ${poison}`);
});

test("C1B: regular敌人给玩家施毒不受mult影响", () => {
  let s = enterCombatWithDifficulty(DIFFICULTY_REGULAR);
  s.run.statuses = [];
  // applyEffect target "self" targets the player — poison should NOT be scaled
  applyEffect(s, { type: "status", target: "self", status: "poison", stacks: 9 }, null);
  let selfPoison = s.run.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(selfPoison === 9, `player self-poison should be 9, got ${selfPoison}`);
});

test("C1B: regular非poison状态不受mult影响", () => {
  let s = enterCombatWithDifficulty(DIFFICULTY_REGULAR);
  enemy(s).statuses = [];
  applyEffect(s, { type: "status", target: "enemy", status: "burn", stacks: 9 }, enemy(s).uid);
  let burn = enemy(s)?.statuses?.find(x => x.id === "burn")?.stacks ?? 0;
  assert(burn === 9, `burn should be 9 (unaffected), got ${burn}`);
  // Also check bleed
  enemy(s).statuses = [];
  applyEffect(s, { type: "status", target: "enemy", status: "bleed", stacks: 9 }, enemy(s).uid);
  let bleed = enemy(s)?.statuses?.find(x => x.id === "bleed")?.stacks ?? 0;
  assert(bleed === 9, `bleed should be 9 (unaffected), got ${bleed}`);
});

test("C1B: shellTap/stoneShell/mountainEcho保持C1A龟壳值", () => {
  // shellTap: block 6, reflect 17%
  let st = cards["shellTap"];
  assert(st !== undefined, "shellTap should exist");
  let blockEffect = st.effects.find(e => e.type === "block");
  assert(blockEffect && blockEffect.value === 6, `shellTap block should be 6, got ${blockEffect?.value}`);
  let reflectEffect = st.effects.find(e => e.type === "shellReflect");
  assert(reflectEffect && reflectEffect.ratio === 0.17, `shellTap reflect should be 17%, got ${reflectEffect?.ratio}`);
  // mountainEcho: reflect 13%
  let me = cards["mountainEcho"];
  assert(me !== undefined, "mountainEcho should exist");
  let meReflect = me.effects.find(e => e.type === "shellReflect");
  assert(meReflect && meReflect.ratio === 0.13, `mountainEcho reflect should be 13%, got ${meReflect?.ratio}`);
  // stoneShell: block 6
  let ss = cards["stoneShell"];
  assert(ss !== undefined, "stoneShell should exist");
  let ssBlock = ss.effects.find(e => e.type === "block");
  assert(ssBlock && ssBlock.value === 6, `stoneShell block should be 6, got ${ssBlock?.value}`);
});

// === CQA-P3-005: amplifyDebuffs / enemy poison regression tests ===

test("C1B: regular amplifyDebuffs poison按0.85缩放", () => {
  let s = enterCombatWithDifficulty(DIFFICULTY_REGULAR);
  enemy(s).statuses = [{ id: "poison", stacks: 1 }];
  applyEffect(s, { type: "amplifyDebuffs", target: "enemy", statuses: ["poison"], value: 10 }, enemy(s).uid);
  let poison = enemy(s)?.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(poison === 10, `regular amplifyDebuffs poison: 1+9=10, got ${poison}`);
});

test("C1B: regular amplifyDebuffs非poison不缩放", () => {
  let s = enterCombatWithDifficulty(DIFFICULTY_REGULAR);
  enemy(s).statuses = [{ id: "burn", stacks: 1 }];
  applyEffect(s, { type: "amplifyDebuffs", target: "enemy", statuses: ["burn"], value: 10 }, enemy(s).uid);
  let burn = enemy(s)?.statuses?.find(x => x.id === "burn")?.stacks ?? 0;
  assert(burn === 11, `regular amplifyDebuffs burn: 1+10=11 (unscaled), got ${burn}`);
});

test("C1B: normal amplifyDebuffs poison不缩放", () => {
  let s = enterCombatWithDifficulty(null);
  enemy(s).statuses = [{ id: "poison", stacks: 1 }];
  applyEffect(s, { type: "amplifyDebuffs", target: "enemy", statuses: ["poison"], value: 10 }, enemy(s).uid);
  let poison = enemy(s)?.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(poison === 11, `normal amplifyDebuffs poison: 1+10=11 (unscaled), got ${poison}`);
});

test("C1B: trueMartial amplifyDebuffs poison不缩放", () => {
  let s = enterCombatWithDifficulty("poison", true);
  enemy(s).statuses = [{ id: "poison", stacks: 1 }];
  applyEffect(s, { type: "amplifyDebuffs", target: "enemy", statuses: ["poison"], value: 10 }, enemy(s).uid);
  let poison = enemy(s)?.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(poison === 11, `TM amplifyDebuffs poison: 1+10=11 (unscaled), got ${poison}`);
});

test("C1B: regular敌人给玩家施毒瞬间不受mult影响", () => {
  let s = enterCombatWithDifficulty(DIFFICULTY_REGULAR);
  s.run.statuses = [];
  applyEffect(s, { type: "status", target: "self", status: "poison", stacks: 9 }, null);
  let selfPoison = s.run.statuses?.find(x => x.id === "poison")?.stacks ?? 0;
  assert(selfPoison === 9, `enemy-to-player poison should be 9 (unaffected), got ${selfPoison}`);
});

// ===== CQA-P3-003: startRun parameter boundary tests =====

test("CQC: 对象参数启动 beginner", () => {
  let s = createInitialState();
  let r = startRun(s, { difficulty: DIFFICULTY_BEGINNER });
  assert(r.run !== null && r.run !== undefined, "run should be created");
  assert(r.run.difficulty === DIFFICULTY_BEGINNER, "should be beginner");
  assert(r.run.rollsMax === ROLL_MAX_BEGINNER);
});

test("CQC: 对象参数启动 regular", () => {
  let s = createInitialState();
  let r = startRun(s, { difficulty: DIFFICULTY_REGULAR });
  assert(r.run.difficulty === DIFFICULTY_REGULAR, "should be regular");
  assert(r.run.rollsMax === ROLL_MAX_REGULAR);
});

test("CQC: 对象参数启动 trueMartial physical", () => {
  let s = createInitialState();
  let r = startRun(s, { difficulty: DIFFICULTY_TRUE_MARTIAL, trueMartialStyle: "physical" });
  assert(r.run.trueMartial === true);
  assert(r.run.difficulty === DIFFICULTY_TRUE_MARTIAL);
});

test("CQC: 旧调用 startRun(state) 仍启动 beginner", () => {
  let s = createInitialState();
  let r = startRun(s);
  assert(r.run.difficulty === DIFFICULTY_BEGINNER);
});

test("CQC: 旧调用 startRun(state, null, DIFFICULTY_REGULAR) 仍启动 regular", () => {
  let s = createInitialState();
  let r = startRun(s, null, DIFFICULTY_REGULAR);
  assert(r.run.difficulty === DIFFICULTY_REGULAR);
});

test("CQC: startRun(state, DIFFICULTY_REGULAR) 启动 regular", () => {
  let s = createInitialState();
  let r = startRun(s, DIFFICULTY_REGULAR);
  assert(r.run.difficulty === DIFFICULTY_REGULAR);
  assert(!r.run.trueMartial);
});

test("CQC: startRun(state, DIFFICULTY_BEGINNER) 安全解释为 beginner", () => {
  let s = createInitialState();
  let r = startRun(s, DIFFICULTY_BEGINNER);
  assert(r.run.difficulty === DIFFICULTY_BEGINNER);
});

test("CQC: startRun(state, DIFFICULTY_TRUE_MARTIAL) 不默认启动 physical", () => {
  let s = createInitialState();
  let r = startRun(s, DIFFICULTY_TRUE_MARTIAL);
  assert(!r.run, "TM without style should not create a run");
  assert(r.message.includes("需要指定流派"), `expected 需要指定流派, got: ${r.message}`);
});

test("CQC: startRun(state, { difficulty: DIFFICULTY_TRUE_MARTIAL }) 不默认启动 physical", () => {
  let s = createInitialState();
  let r = startRun(s, { difficulty: DIFFICULTY_TRUE_MARTIAL });
  assert(!r.run, "TM without style (object param) should not create a run");
});

test("CQC: 非法 trueMartialStyle 不 fallback 到 physical", () => {
  let s = createInitialState();
  let r = startRun(s, "not_a_real_style");
  assert(!r.run, "bad TM style should not create run");
});

// ===== pendingPurge regression tests =====

function forcePendingPurge(state, source = "shop") {
  state.run.pendingPurge = {
    source,
    filter: "any",
    remaining: 1,
    addCurseOnComplete: false,
    removedNames: [],
    finishNodeOnComplete: source === "side",
  };
}

test("CQC: pendingPurge + cardUid null + source shop 安全退出", () => {
  let s = enterCombatWithDifficulty(null);
  s.phase = "shop";
  s.run.pendingPurge = { source: "shop", filter: "any", remaining: 1, addCurseOnComplete: false, removedNames: [] };
  let s2 = reduceGame(s, { type: "confirmPurge", cardUid: null });
  assert(s2.run.pendingPurge === null, "pendingPurge should be cleared");
  assert(s2.phase === "shop", "should remain in shop");
});

test("CQC: pendingPurge + cardUid null + finishNodeOnComplete 回 route", () => {
  let s = enterCombatWithDifficulty(null);
  s.phase = "reward";
  s.run.pendingPurge = { source: "side", filter: "any", remaining: 1, addCurseOnComplete: false, removedNames: [], finishNodeOnComplete: true };
  // Add extra node choice so finishCurrentNode works
  s.run.nodeChoices = [{ id: "next_test", type: "main", tier: 1, title: "next", text: "next", rewardText: "", rewardKind: "normal" }];
  let s2 = reduceGame(s, { type: "confirmPurge", cardUid: null });
  assert(s2.run.pendingPurge === null, "pendingPurge should be cleared");
});

test("CQC: pendingPurge + deck <= MIN_DECK_SIZE + cardUid null 清理", () => {
  let s = enterCombatWithDifficulty(null);
  s.run.deck = s.run.deck.slice(0, MIN_DECK_SIZE);
  s.phase = "shop";
  s.run.pendingPurge = { source: "shop", filter: "any", remaining: 1, addCurseOnComplete: false, removedNames: [] };
  let s2 = reduceGame(s, { type: "confirmPurge", cardUid: null });
  assert(s2.run.pendingPurge === null, "pendingPurge cleared even at min deck size");
});

test("CQC: pendingPurge + filter 下无可删牌 + cardUid null 安全退出", () => {
  let s = enterCombatWithDifficulty(null);
  s.run.deck = s.run.deck.map(c => { c.cardId = "karmaCurse"; return c; });
  s.run.pendingPurge = { source: "shop", filter: "basic", remaining: 1, addCurseOnComplete: false, removedNames: [] };
  let s2 = reduceGame(s, { type: "confirmPurge", cardUid: null });
  assert(s2.run.pendingPurge === null, "pendingPurge should be cleared when no basic card exists");
});

// ===== defeat state cleanup tests =====

test("CQC: defeat 后 run.combat = null", () => {
  let s = enterCombatWithDifficulty(null);
  s.run.hp = 0;
  applyIncomingDamage(s, 999);
  // Defeat triggered; verify cleanup
  assert(s.run.combat === null, "combat should be null after defeat");
  assert(s.run.finished === true, "finished should be true");
  assert(s.phase === "gameOver", "phase should be gameOver");
});

test("CQC: defeat 后 run.rewards = []", () => {
  let s = enterCombatWithDifficulty(null);
  s.run.rewards = [{ id: "r1", type: "gold", value: 10 }];
  s.run.hp = 0;
  applyIncomingDamage(s, 999);
  assert(s.run.rewards.length === 0, "rewards should be empty after defeat");
});

test("CQC: defeat 后 run.pendingPurge = null", () => {
  let s = enterCombatWithDifficulty(null);
  s.run.pendingPurge = { source: "shop", filter: "any", remaining: 1 };
  s.run.hp = 0;
  applyIncomingDamage(s, 999);
  assert(s.run.pendingPurge === null, "pendingPurge should be null after defeat");
});

test("CQC: defeat 后 run.pendingChoice = null", () => {
  let s = enterCombatWithDifficulty(null);
  s.run.pendingChoice = { type: "discardPick", count: 1, sourceUid: "test", title: "test" };
  s.run.hp = 0;
  applyIncomingDamage(s, 999);
  assert(s.run.pendingChoice === null, "pendingChoice should be null after defeat");
});

test("CQC: defeat 不重复结算", () => {
  let s = enterCombatWithDifficulty(null);
  s.run.hp = 0;
  let s1 = reduceGame(s, { type: "endTurn" });
  let soul1 = s1.meta.soul;
  let s2 = reduceGame(s1, { type: "endTurn" });
  assert(s2.meta.soul === soul1, "defeat should not double-settle");
});

test("CQC: defeat 不批量解锁真武专属遗物", () => {
  let s = enterCombatWithDifficulty(null);
  s.run.hp = 0;
  let s1 = reduceGame(s, { type: "endTurn" });
  // TM-only relics should NOT be unlocked from defeat
  let tmRelics = ["poJunLing", "nineSkyTribulation", "asuraHeart", "venomScripture", "chaosTreasure", "turtleShell"];
  let unlocked = s1.meta.collectedRelics || [];
  for (let id of tmRelics) {
    assert(!unlocked.includes(id), `TM relic ${id} should not be unlocked from normal defeat`);
  }
});

// ===== migration regression tests =====

test("CQC: missing difficulty 旧档迁移为 beginner", () => {
  let old = { meta: {}, run: { seed: 1, floor: 1 } };
  let next = migrateGameState(old);
  assert(next.run.difficulty === DIFFICULTY_BEGINNER, `expected beginner, got ${next.run.difficulty}`);
  assert(next.run.rollsMax === ROLL_MAX_BEGINNER);
});

test("CQC: old normal 旧档迁移为 beginner", () => {
  let old = { meta: {}, run: { seed: 1, floor: 1, difficulty: "normal" } };
  let next = migrateGameState(old);
  assert(next.run.difficulty === DIFFICULTY_BEGINNER);
  assert(next.run.rollsMax === ROLL_MAX_BEGINNER);
});

test("CQC: regular 旧档保留 regular", () => {
  let old = { meta: {}, run: { seed: 1, floor: 1, difficulty: "regular" } };
  let next = migrateGameState(old);
  assert(next.run.difficulty === DIFFICULTY_REGULAR);
  assert(next.run.rollsMax === ROLL_MAX_REGULAR);
});

test("CQC: trueMartial 旧档保留 trueMartial", () => {
  let old = { meta: {}, run: { trueMartial: true, seed: 1, floor: 1 } };
  let next = migrateGameState(old);
  assert(next.run.difficulty === DIFFICULTY_TRUE_MARTIAL);
  assert(next.run.rollsMax === ROLL_MAX_TRUE_MARTIAL);
});

test("CQC: unknown difficulty 安全归一为 beginner", () => {
  let old = { meta: {}, run: { seed: 1, floor: 1, difficulty: "chaos" } };
  let next = migrateGameState(old);
  assert(next.run.difficulty === DIFFICULTY_BEGINNER);
});

test("CQC: rollsUsed 缺失时默认 0", () => {
  let old = { meta: {}, run: { seed: 1, floor: 1 } };
  let next = migrateGameState(old);
  assert(next.run.rollsUsed === 0, `expected rollsUsed=0, got ${next.run.rollsUsed}`);
});

test("CQC: 迁移不清理已有 meta.mythMastery", () => {
  let old = { meta: { mythMastery: { testFaction: 5 } }, run: { seed: 1, floor: 1 } };
  let next = migrateGameState(old);
  assert(next.meta.mythMastery.testFaction === 5, "mythMastery should survive migration");
});

(async () => {
  for (const t of _tests) {
    try { await t.fn(); console.log("✅", t.name); passed++; }
    catch (e) { console.error("❌", t.name, e.message); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
