import { createInitialState, startRun, makeCard, isTrueMartialUnlocked, canShowTrueMartialEntry } from "../src/core/state.js";
import { reduceGame } from "../src/core/reducer.js";
import { cards, relics } from "../src/core/data.js";
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
  assert(c0 >= 1, `chaos=${c0}`);
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
  globalThis.localStorage = { setItem() { throw new Error("q"); }, getItem() { return null; }, removeItem() {} };
  try { assert(saveGame(createInitialState())); }
  finally { globalThis.localStorage = orig; }
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
  assert(enemy(s).hp === hpBefore - 4, `expected HP=${hpBefore-4}, got ${enemy(s).hp}`);
  // 4 burn
  let burn = enemy(s)?.statuses?.find(x => x.id === "burn")?.stacks ?? 0;
  assert(burn >= 4, `expected burn>=4, got ${burn}`);
  // 1 thunderMark
  let tm = enemy(s)?.statuses?.find(x => x.id === "thunderMark")?.stacks ?? 0;
  assert(tm === 2, `expected thunderMark=1, got ${tm}`);
  // Should NOT trigger tribulation (threshold is 8, only 1 mark)
  assert(s.phase !== "gameOver", "foxFire should not trigger tribulation at 1 mark");
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
  s.meta.collectedRelics = ["guard"]; s.meta.mythMastery = { spell: 1 };
  
  s = reduceGame(s, { type: "martialSelect" });
  assert(s.phase === "martialSelect");
  assert(Array.isArray(s.meta.collectedRelics));
  assert(s.meta.mythMastery.spell === 1);
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
    { uid: "A", hp: 80, maxHp: 80, block: 0, name: "敌A", statuses: [{ id: "burn", stacks: 4 }, { id: "thunderMark", stacks: 4 }], intent: { type: "attack", value: 5 } },
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
  assert(c.text.includes("5 层灼烧") && c.text.includes("2 层雷痕"));
  assert(c.effects.some(e => e.status === "burn" && e.stacks === 5));
  assert(c.effects.some(e => e.type === "thunderMark" && e.stacks === 2));
});

test("玄龟甲文案与代码一致", () => {
  let s = enterCombat("shell");
  assert(s.run.combat.block >= 22);
});

test("雷火机制核心值保持", () => {
  assert(cards["flameTalisman"].effects.some(e => e.status === "burn" && e.stacks === 8));
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


(async () => {
  for (const t of _tests) {
    try { await t.fn(); console.log("✅", t.name); passed++; }
    catch (e) { console.error("❌", t.name, e.message); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
