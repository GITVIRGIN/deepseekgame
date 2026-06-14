import { cards, gradeInfo, rarityInfo, relics, shopItems, statusInfo, styleInfo } from "../core/data.js";
import { archetypeRanking, dominantArchetype, styleLabel } from "../core/archetypes.js";
import { previewEnemyIntent, effectiveMaxEnergy, trueMartialFormationInfo } from "../core/combat.js";
import { reduceGame } from "../core/reducer.js";
import { canShowTrueMartialEntry } from "../core/state.js";
import { clearSave, loadGame, migrateGameState, saveGame } from "../core/save.js";
import { MAX_FLOOR, TRUE_MARTIAL_MAX_FLOOR, DIFFICULTY_LABELS, DIFFICULTY_BEGINNER, MIN_DECK_SIZE } from "../core/types.js";
import { gameVersion } from "../core/version.js";
import { createRunGoal, goalProgress } from "../core/goals.js";
import { talentCost, talentDefinitions, talentLevel } from "../core/progression.js";
import { MYTH_FACTIONS, MYTH_MASTERY_MAX, MYTH_MASTERY_PERKS, cardMythBoost, effectiveCardCost, hasMythMasteryPerk } from "../core/myth.js";
import { clearCloudConfig, connectCloud, downloadCloudSave, loadCloudConfig, saveCloudConfig, uploadCloudSave } from "../core/cloud.js";

const app = document.querySelector("#app");
let state = loadGame();
let selectedTargetUid = null;
let detailInfo = null;
let pileInfo = null;
let progressionOpen = false;
let cloudOpen = false;
let cloudBusy = false;
let cloudMessage = "";
let cloudTimer = null;
let suppressCardClickUntil = 0;
let replayRecording = null;

function dispatch(action) {
  if (replayRecording && state.phase !== "gameOver") {
    replayRecording.actions.push({ phase: state.phase, action });
  }
  // V2.5: reset UI state on new game start
  const newGameActions = new Set(["startRun", "startRegular", "startTrueMartial"]);
  if (newGameActions.has(action.type)) {
    replayRecording = null;
    selectedTargetUid = null;
    detailInfo = null;
    pileInfo = null;
    progressionOpen = false;
  }
  state = reduceGame(state, action);
  if (state.run && !replayRecording) {
    replayRecording = { seed: state.run.seed, style: state.run.trueMartialStyle || null, actions: [] };
  }
  pileInfo = null;

  const alive = state.run?.combat?.enemies.filter((enemy) => enemy.hp > 0) ?? [];
  if (!alive.some((enemy) => enemy.uid === selectedTargetUid)) {
    selectedTargetUid = alive[0]?.uid ?? null;
  }

  saveGame(state);
  scheduleCloudSync();
  render();
}

function render() {
  app.innerHTML = "";
  app.append(renderShell());
}

function renderShell() {
  const shell = el("section", "shell");
  shell.append(renderHeader());

  if (state.phase === "home") {
    replayRecording = null;
    shell.append(renderHome());
  }

  if (state.phase === "route") {
    shell.append(renderRoute());
  }

  if (state.phase === "combat") {
    shell.append(renderCombat());
  }

  if (state.phase === "reward") {
    shell.append(renderReward());
  }

  if (state.phase === "shop") {
    shell.append(renderShop());
  }

  if (state.phase === "martialSelect") {
    shell.append(renderMartialSelect());
  }

  if (state.phase === "gameOver") {
    shell.append(renderGameOver());
    if (replayRecording) {
      replayRecording.result = { floor: state.run?.floor, won: !!state.run?.goal?.completedBy };
      shell.append(downloadReplayButton());
    };
  }

  if (detailInfo) {
    shell.append(renderDetailPanel(detailInfo));
  }

  if (pileInfo) {
    shell.append(renderPilePanel(pileInfo));
  }

  if (progressionOpen && !["home", "gameOver"].includes(state.phase)) {
    shell.append(renderProgressionOverlay());
  }

  if (cloudOpen) {
    shell.append(renderCloudOverlay());
  }

  if (state.run?.pendingChoice?.type === "discardPick") {
    shell.append(renderDiscardPickPanel(state.run));
  }

  // V2.5: don't show purge overlay on gameOver
  if (state.phase !== "gameOver" && state.run?.pendingPurge) {
    shell.append(renderPurgeOverlay(state.run));
  }

  return shell;
}

function renderHeader() {
  const inGame = state.phase !== "home" && state.phase !== "gameOver";
  const header = el("header", "topbar");
  header.append(
    el("div", "brand", [
      image("./assets/seal.svg", "玄箓印"),
      el("div", "", [el("h1", "", "玄箓行"), el("p", "", `v${gameVersion.app}`)]),
    ]),
    el("div", "topbar-actions", [
      el("div", "meta", [
        stat("残魂", state.meta.soul),
        stat("行旅", state.meta.totalRuns),
        stat("通关", state.meta.wins),
      ]),
      inGame ? "" : button("云存档", "ghost small cloud-shortcut", () => {
        cloudOpen = true;
        render();
      }),
    ]),
  );
  return header;
}

function renderHome() {
  const view = el("section", "home");
  view.append(
    el("div", "home-stack", [
      el("div", "intro", [
        el("h2", "", "携残箓入山"),
        el("p", "", "先做能爽起来的第一版：抽牌、叠状态、拿遗物、一路打到黑山。"),
        el("div", "difficulty-choices", [
          button("入门难度", "primary", () => dispatch({ type: "startRun" })),
          button("常规难度", "ghost", () => dispatch({ type: "startRegular" })),
          canShowTrueMartialEntry(state) ? button("真武模式", "danger", () => dispatch({ type: "martialSelect" })) : "",
        ].filter(Boolean)),
        el("div", "release-link", [
          el("a", "", { href: "release-v3.13n-tm-t2a5f.html", target: "_self" }, "📖 V3.13N 真武合流攻略 / 发布说明"),
        ]),
      ]),
      renderCloudPanel(),
      renderProgression(),
    ]),
    renderCodex(),
  );
  return view;
}



function renderMartialSelect() {
  const styles = [
    { id: "physical", name: "物理", desc: "杀意叠伤·斩杀", relic: "破军令" },
    { id: "spell", name: "法术", desc: "雷印天劫·爆发", relic: "九天雷劫" },
    { id: "bleed", name: "流血", desc: "血魔自残·吸血", relic: "修罗心" },
    { id: "poison", name: "中毒", desc: "毒瘴虚弱·消耗", relic: "万毒真经" },
    { id: "control", name: "控制", desc: "离间禁锢·脆化", relic: "混沌灵宝" },
    { id: "shell", name: "龟壳", desc: "叠甲反震·铁壁", relic: "玄龟甲" },
  ];
  const view = el("section", "martial-select");
  view.append(
    el("h2", "", "真武模式 — 选择流派"),
    el("p", "muted", "敌人大幅强化，开局获全套卡牌+专属遗物"),
    el("div", "martial-grid", styles.map(s => {
      const btn = el("button", "martial-card", [
        el("strong", "", s.name),
        el("span", "", s.desc),
        el("em", "", s.relic),
      ]);
      btn.addEventListener("click", () => dispatch({ type: "startTrueMartial", style: s.id }));
      return btn;
    })),
    button("返回", "ghost", () => dispatch({ type: "cancelMartial" })),
  );
  return view;
}

// V3.0: True Martial formation panel
function renderTrueMartialFormationPanel(run) {
  const info = trueMartialFormationInfo(run);
  if (!info) return el("div");
  const panel = el("div", "tm-formation-panel");
  const chip = el("span", "tm-formation-chip", info.name);
  panel.append(
    el("div", "tm-formation-title", [chip, ` 阵势 ${info.pressure} | ${info.stageLabel}`]),
    el("span", "tm-formation-summary", info.summary),
    button("详情", "ghost-tiny", () => {
      detailInfo = { type: "tmFormation", formation: info };
      render();
    }),
  );
  return panel;
}

function renderCombat() {
  const run = state.run;
  const combat = run.combat;
  const view = el("section", "combat-layout");

  if (!selectedTargetUid) {
    selectedTargetUid = combat.enemies.find((enemy) => enemy.hp > 0)?.uid ?? null;
  }

  view.append(
    renderRunPanel(run),
    renderMobileRunSummary(run),  // HF5: mobile-only horizontal player summary
    renderTrueMartialFormationPanel(run),
    el("section", "battlefield", [
      renderActionBanner(combat.log),
      el("div", "enemy-row", combat.enemies.map(renderEnemy)),
      renderHand(run, combat),
      el("div", "hand-swipe-hint", "← 左右滑动查看更多手牌 →"),  // HF10: mobile scroll hint
    ]),
    renderLog(combat.log),
  );

  return view;
}

function renderRoute() {
  const run = state.run;
  const view = el("section", "route-layout");
  view.append(
    renderRunPanel(run),
    el("section", "route-view", [
      el("h2", "", "选择下一步"),
      el("p", "", "主线推进通关进度；支线不推进主线层数，奖励更偏资源。"),
      el("div", "route-grid", (run.nodeChoices ?? []).map(renderRouteNode)),
    ]),
  );
  return view;
}

function renderRouteNode(node) {
  const card = el("article", `route-node route-${node.type}`);
  const actionClass = node.type === "main" ? "primary" : "ghost";
  card.append(
    el("span", "card-rarity", routeTypeLabel(node.type)),
    el("h3", "", node.title),
    el("p", "", node.text),
    el("strong", "route-reward", node.rewardText),
    button(node.type === "shop" ? "逛商店" : "进入", actionClass, () => dispatch({ type: "chooseNode", nodeId: node.id })),
  );
  return card;
}

function routeTypeLabel(type) {
  if (type === "main") return "主线";
  if (type === "side") return "支线";
  return "商店";
}

function renderShop() {
  const run = state.run;
  const view = el("section", "route-layout");
  view.append(
    renderRunPanel(run),
    el("section", "shop-view", [
      el("div", "shop-head", [
        el("div", "", [el("h2", "", "山路商店"), el("p", "", "金币来自关卡掉落，只购买本局内的成长。")]),
        stat("金", run.gold),
      ]),
      el("p", "shop-result", state.message),
      el("div", "shop-grid", (run.shopStock ?? []).map(renderShopItem)),
      button("离开商店", "primary", () => dispatch({ type: "leaveShop" })),
    ]),
  );
  return view;
}

function renderShopItem(stockItem) {
  const item = shopItems[stockItem.id];
  const canBuy = state.run.gold >= stockItem.price && !stockItem.sold;
  const node = el("article", `shop-item ${stockItem.sold ? "sold" : ""}`);
  node.append(
    el("strong", "", item.name),
    el("p", "", item.text),
    stockItem.resultText ? el("p", "shop-result", stockItem.resultText) : "",
    el("span", "shop-price", stockItem.sold ? "已售出" : `${stockItem.price} 金`),
    button(stockItem.sold ? "已售出" : canBuy ? "购买" : "金钱不足", canBuy ? "primary" : "ghost", () => {
      if (canBuy) dispatch({ type: "buyShopItem", itemId: stockItem.id });
    }),
  );
  return node;
}

function renderReward() {
  const run = state.run;
  const view = el("section", "reward-view");
  const rollRemaining = (run.rollsMax ?? 3) - (run.rollsUsed ?? 0);
  view.append(
    el("h2", "", state.message),
    el("p", "", `第 ${run.floor} 层已清净，选择一份机缘继续前行。`),
    el("strong", "gold-drop", `本关掉落 ${run.lastGoldDrop ?? 0} 金`),
  );

  const rewards = el("div", "reward-grid");
  for (const reward of run.rewards) {
    rewards.append(renderRewardChoice(reward));
  }

  view.append(rewards);
  view.append(el("div", "reward-actions", [
    button("跳过拿牌", "ghost", () => dispatch({ type: "skipReward" })),
    rollRemaining > 0
      ? button(`刷新机缘 (${rollRemaining} 次)`, "ghost", () => dispatch({ type: "rollRewards" }))
      : button("刷新已用完", "ghost disabled", null),
  ].filter(Boolean)));
  return view;
}


function downloadReplayButton() {
  const btn = el("button", "", "下载回放");
  btn.style.cssText = "display:block;margin:8px auto;padding:8px 16px;background:#e8c97a;color:#1a1a2e;border:none;border-radius:4px;cursor:pointer;font-size:14px;";
  btn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(replayRecording, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "replay_" + Date.now() + ".json"; a.click();
    URL.revokeObjectURL(url);
  });
  return btn;
}

function renderGameOver() {
  const view = el("section", "game-over-layout");
  view.append(el("section", "game-over", [
    el("h2", "", state.message),
    state.run ? renderRunSummary(state.run) : el("p", "", "旧梦已散。"),
    el("div", "actions", [
      button("入门难度", "primary", () => dispatch({ type: "startRun" })),
      button("常规难度", "ghost", () => dispatch({ type: "startRegular" })),
      canShowTrueMartialEntry(state) ? button("真武模式", "danger", () => dispatch({ type: "martialSelect" })) : "",
      button("清除存档", "ghost", () => {
        clearSave();
        state = reduceGame(state, { type: "reset" });
        render();
      }),
    ].filter(Boolean)),
  ]));
  view.append(renderProgression());
  view.append(renderCloudPanel());
  return view;
}

function renderProgressionEntry() {
  return el("section", "progression-entry", [
    el("div", "", [el("strong", "", "残魂修行"), el("span", "", `${state.meta.soul} 残魂`)]),
    button("查看", "ghost small", () => {
      progressionOpen = true;
      render();
    }),
  ]);
}

function renderProgressionOverlay() {
  return el("aside", "progression-overlay", [
    el("div", "detail-head", [
      el("div", "", [el("span", "muted", "局外成长"), el("h2", "", "残魂修行")]),
      button("关闭", "ghost small", () => {
        progressionOpen = false;
        render();
      }),
    ]),
    renderProgression({ readonly: true }),
  ]);
}

function renderProgression({ readonly = false } = {}) {
  const talents = Object.values(talentDefinitions);
  return el("section", "progression-panel", [
    el("div", "progression-head", [
      el("div", "", [
        el("h2", "", "残魂修行"),
        el("p", "muted", readonly ? "这些修行已在本局开局时生效。" : "局外成长只影响下一局开局。"),
      ]),
      stat("残魂", state.meta.soul),
    ]),
    el("div", "talent-grid", talents.map((definition) => renderTalent(definition, readonly))),
    renderMythMastery(),
  ]);
}

function renderTalent(definition, readonly = false) {
  const level = talentLevel(state.meta, definition.id);
  const cost = talentCost(definition, level);
  const maxed = cost === null;
  const canBuy = !maxed && state.meta.soul >= cost;
  const node = el("article", `talent ${maxed ? "maxed" : ""}`);
  const children = [
    el("div", "talent-title", [el("strong", "", definition.name), el("span", "", `${level}/${definition.maxLevel}`)]),
    el("p", "", definition.text),
    readonly ? el("span", "talent-cost", level > 0 ? "本局已生效" : "未点亮") : el("span", "talent-cost", maxed ? "已点满" : `消耗 ${cost} 残魂`),
  ];

  if (!readonly) {
    children.push(button(maxed ? "已满" : canBuy ? "点亮" : "残魂不足", canBuy ? "primary small" : "ghost small", () => {
      if (canBuy) dispatch({ type: "buyTalent", talentId: definition.id });
    }));
  }

  node.append(...children);

  return node;
}

function renderMythMastery() {
  return el("section", "myth-mastery-panel", [
    el("div", "progression-head slim-head", [
      el("div", "", [
        el("h2", "", "派系箓印"),
        el("p", "muted", "深入失败可获得 1 点箓印，通关获得 2 点；优先本局主修派系，溢出会补最低派系。"),
      ]),
    ]),
    el(
      "div",
      "talent-grid myth-grid",
      MYTH_FACTIONS.map((tag) => renderMythMasteryItem(tag)),
    ),
  ]);
}

function renderMythMasteryItem(tag) {
  const level = state.meta.mythMastery?.[tag] ?? 0;
  const statusBonus = Math.floor(level / 2);
  const perk = MYTH_MASTERY_PERKS[tag]?.text ?? "";
  return el("article", `talent myth-talent ${level >= MYTH_MASTERY_MAX ? "maxed" : ""}`, [
    el("div", "talent-title", [el("strong", "", `${tag}箓印`), el("span", "", `${level}/${MYTH_MASTERY_MAX}`)]),
    el("p", "", level > 0 ? `同派系牌：伤害、格挡、治疗 +${level}；状态叠层 +${statusBonus}。${perk}` : `尚未刻入。${perk}`),
    el("span", "talent-cost", level >= MYTH_MASTERY_MAX ? "满级质变已生效" : level > 0 ? "自动生效" : "通关解锁"),
  ]);
}

function renderCloudPanel() {
  const config = loadCloudConfig();
  const statusText = cloudMessage || (config.userLogin ? `已连接 ${config.userLogin} / ${config.playerId || "未设ID"}` : "未连接云存档");
  return el("section", "cloud-panel", [
    el("div", "cloud-head", [
      el("div", "", [el("h2", "", "云存档"), el("p", "muted", statusText)]),
      config.autoSync ? el("span", "cloud-badge", "自动") : el("span", "cloud-badge muted-badge", "手动"),
    ]),
    el("div", "cloud-fields", [
      field("GitHub Token", input("cloud-token", "password", "", config.token ? "已保存 Token，留空沿用" : "只填 Token，不填密码")),
      field("玩家ID", input("cloud-player", "text", config.playerId ?? "", "例如 xuanlu-main")),
      labelWrap("cloud-check", "自动上传", checkbox("cloud-auto", Boolean(config.autoSync))),
    ]),
    el("div", "cloud-actions", [
      button(cloudBusy ? "处理中" : "连接", "ghost small", () => handleCloudAction("connect")),
      button("上传本地", "primary small", () => handleCloudAction("upload")),
      button("读取云端", "ghost small", () => handleCloudAction("download")),
      button("清除连接", "ghost small", () => {
        clearCloudConfig();
        cloudMessage = "已清除云存档连接。";
        render();
      }),
    ]),
    el("p", "cloud-note", "云端使用玩家自己的 GitHub Token 和私有 Gist；不同玩家ID对应不同存档。"),
  ]);
}

function renderCloudOverlay() {
  return el("aside", "cloud-overlay", [
    el("div", "detail-head", [
      el("div", "", [el("span", "muted", "本地与云端"), el("h2", "", "云存档")]),
      button("关闭", "ghost small", () => {
        cloudOpen = false;
        render();
      }),
    ]),
    renderCloudPanel(),
  ]);
}

function renderRunPanel(run) {
  const panel = el("aside", "run-panel");
  const pChips = formatPlayerStatusChips(run, 3);

  // Difficulty badge
  const diffLabel = DIFFICULTY_LABELS[run.difficulty] || "未知";
  const diffBadge = el("span", "difficulty-badge", diffLabel);

  // 行旅符 virtual relic for beginner mode
  const travelBadge = run.difficulty === DIFFICULTY_BEGINNER
    ? el("span", "relic-badge travel-talisman", "行旅符")
    : null;
  if (travelBadge) travelBadge.title = "入门难度专属。每场战斗开始时触发行旅护持，并根据牌组倾向提供小幅扶助。";

  const maxFloor = run.trueMartial ? TRUE_MARTIAL_MAX_FLOOR : MAX_FLOOR;

  // HF6: filter nulls before native DOM append — prevents "null" text
  panel.append(...[
    el("div", "floor-head", [
      el("h2", "", `第 ${run.floor}/${maxFloor} 层`),
      el("div", "floor-actions", [
        button("修行", "ghost micro", () => { progressionOpen = true; render(); }),
        button("放弃", "danger micro", () => dispatch({ type: "abandonRun" })),
      ]),
    ]),
    el("div", "run-mode-row", [diffBadge, travelBadge].filter(Boolean)),
    el("div", "run-stats-grid", [
      stat("生命", `${run.hp}/${run.maxHp}`),
      stat("格挡", run.combat?.block ?? 0),
      stat("金", run.gold),
    ]),
    pChips.length > 0
      ? el("div", "run-status-row", [
          el("span", "run-status-label", "状态"),
          el("div", "player-status-chip-row", pChips),
        ])
      : null,
    el("div", "roll-info", [
      el("span", "", `刷新次数：${run.rollsUsed ?? 0} / ${run.rollsMax ?? 3}`),
    ]),
  ].filter(Boolean));
  return panel;
}

// HF5: mobile-only compact horizontal player summary
function renderMobileRunSummary(run) {
  const maxFloor = run.trueMartial ? TRUE_MARTIAL_MAX_FLOOR : MAX_FLOOR;
  const diffLabel = DIFFICULTY_LABELS[run.difficulty] || "未知";
  const pChips = formatPlayerStatusChips(run, 2);
  return el("div", "mobile-run-summary", [
    el("div", "ms-top", [
      el("span", "ms-floor", `第${run.floor}/${maxFloor}层`),
      el("span", "difficulty-badge", diffLabel),
    ]),
    el("div", "ms-stats", [
      el("span", "ms-stat", `❤${run.hp}/${run.maxHp}`),
      el("span", "ms-stat", `🛡${run.combat?.block ?? 0}`),
      el("span", "ms-stat", `💰${run.gold}`),
    ]),
    pChips.length > 0 ? el("div", "ms-status", pChips) : null,
    el("div", "ms-actions", [
      el("span", "ms-roll", `刷新${run.rollsUsed ?? 0}/${run.rollsMax ?? 3}`),
      button("修行", "ghost micro", () => { progressionOpen = true; render(); }),
      button("放弃", "danger micro", () => dispatch({ type: "abandonRun" })),
    ]),
  ].filter(Boolean));
}

export function formatPlayerStatusChips(run, limit = 3) {
  const statuses = (run?.statuses || []).filter(s => s.stacks > 0);
  if (statuses.length === 0) return [];
  const shown = statuses.slice(0, limit);
  const allNames = statuses.map(s => `${statusInfo[s.id]?.label ?? s.id} ${s.stacks}`).join(", ");
  const chips = shown.map(s => {
    const label = `${statusInfo[s.id]?.label ?? s.id} ${s.stacks}`;
    const node = el("span", `status-chip-inline status-${s.id}`, label);
    node.title = allNames;
    node.style.cursor = "pointer";
    node.addEventListener("click", (e) => { e.stopPropagation(); showPlayerStatusDetail(run); });
    return node;
  });
  if (statuses.length > limit) {
    const overflow = el("span", "status-chip-inline status-overflow", `+${statuses.length - limit}`);
    overflow.title = allNames;
    overflow.style.cursor = "pointer";
    overflow.addEventListener("click", (e) => { e.stopPropagation(); showPlayerStatusDetail(run); });
    chips.push(overflow);
  }
  return chips;
}

function showPlayerStatusDetail(run) {
  if (detailInfo?.type === "playerStatuses") { detailInfo = null; render(); return; }
  detailInfo = { type: "playerStatuses", run };
  render();
}

function renderArchetypePanel(run) {
  const dominant = dominantArchetype(run);
  const ranking = archetypeRanking(run).filter((item) => item.score > 0).slice(0, 3);

  return el("section", "archetype-panel", [
    el("div", "archetype-title", [
      el("strong", "", "构筑方向"),
      el("span", "", dominant ? `${styleLabel(dominant.style)} ${dominant.score}` : "未定"),
    ]),
    ranking.length
      ? el("div", "archetype-chips", ranking.map((item) => el("span", "", `${styleLabel(item.style)} ${item.score}`)))
      : el("p", "muted", "选择流派牌后，后续奖励会向它倾斜。"),
  ]);
}

function currentHandCount(run) {
  return run.combat?.hand.length ?? run.retainedHand?.length ?? 0;
}

function sortCardInstancesByFunction(cardInstances) {
  return [...cardInstances].sort((left, right) => compareCardDefinitions(cards[left.cardId], cards[right.cardId]));
}

function compareCardDefinitions(left, right) {
  return cardFunctionRank(left) - cardFunctionRank(right) || left.cost - right.cost || left.name.localeCompare(right.name, "zh-Hans");
}

function cardFunctionRank(definition) {
  const effects = definition.effects ?? [];
  if (effects.some((effect) => effect.type === "block" || effect.type === "shellReflect" || effect.status === "ward")) return 0;
  if (effects.some((effect) => effect.type === "damage" || effect.type === "execute")) return 1;
  if (effects.some((effect) => ["status", "amplifyDebuffs", "thunderMark", "bleedSiphon"].includes(effect.type))) return 2;
  if (effects.some((effect) => ["draw", "gainEnergy", "recoverDiscard"].includes(effect.type))) return 3;
  if (effects.some((effect) => ["heal", "cleanse"].includes(effect.type))) return 4;
  return 5;
}

function renderEnemy(enemy) {
  const isSelected = enemy.uid === selectedTargetUid;
  const card = el("article", `enemy ${isSelected ? "selected" : ""}`);
  const hpPercent = Math.max(0, Math.round((enemy.hp / enemy.maxHp) * 100));

  const isAnchor = state.run?.combat?.flags?.trueMartialFormation?.anchorUid === enemy.uid && enemy.hp > 0;
  // HF6: filter nulls
  card.append(...[
    el("div", "enemy-title", [el("h3", "", enemy.name), isAnchor ? el("span", "tm-anchor-badge", "阵眼") : null, renderIntentButton(enemy)].filter(Boolean)),
    meter(hpPercent, `${enemy.hp}/${enemy.maxHp}`, "hp-meter"),
    blockMeter(enemy.block),
    renderBarImpacts(enemy.statuses, "enemy"),
    renderStatusLine("状态", enemy.statuses),
    button(isSelected ? "目标" : "选中", isSelected ? "primary small" : "ghost small", () => {
      selectedTargetUid = enemy.uid;
      render();
    }),
  ].filter(Boolean));

  if (enemy.hp <= 0) {
    card.classList.add("defeated");
  }

  return card;
}

function renderHand(run, combat) {
  const area = el("section", "hand-area");
  const cardsNode = el("div", "hand");

  for (const cardInstance of sortCardInstancesByFunction(combat.hand)) {
    const definition = cards[cardInstance.cardId];
    const costInfo = effectiveCardCost(run, definition);
    const canPlay = canPlayCard(definition, run);
    const canDiscard = !combat.flags.discardedThisTurn && !run.pendingChoice;
    const play = () => {
      if (canPlay) {
        dispatch({
          type: "playCard",
          cardUid: cardInstance.uid,
          targetUid: selectedTargetUid,
        });
      }
    };
    const node = renderCard(definition, play, { costInfo });
    attachLongPressDetail(node, definition);

    if (!canPlay) {
      node.classList.add("disabled");
    }

    const slot = el("div", "hand-card-slot", [
      node,
      button(canDiscard ? "弃置+抽" : "已弃", canDiscard ? "ghost small discard-action" : "ghost small discard-action disabled", () => {
        if (canDiscard) dispatch({ type: "discardHandCard", cardUid: cardInstance.uid });
      }),
    ]);
    cardsNode.append(slot);
  }

  area.append(
    el("div", "hand-head", [
      el("div", "", [el("h2", "", `⚡${run.energy}/${effectiveMaxEnergy(run)} 手牌 ${combat.hand.length}/${run.handLimit ?? 5}`), renderPileStrip(run, combat), renderMobilePlayerStrip(run)]),
      button("结束回合", "danger", () => dispatch({ type: "endTurn" })),
    ]),
    cardsNode,
  );

  return area;
}

function attachLongPressDetail(node, definition) {
  let timer = null;
  let longPressed = false;
  const clearTimer = () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  node.addEventListener("pointerdown", () => {
    longPressed = false;
    clearTimer();
    timer = window.setTimeout(() => {
      longPressed = true;
      suppressCardClickUntil = Date.now() + 800;
      openDetail(detailForCard(definition));
    }, 520);
  });
  node.addEventListener("pointerup", clearTimer);
  node.addEventListener("pointerleave", clearTimer);
  node.addEventListener("pointercancel", clearTimer);
  node.addEventListener(
    "click",
    (event) => {
      if (!longPressed && Date.now() >= suppressCardClickUntil) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      longPressed = false;
    },
    true,
  );
  node.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openDetail(detailForCard(definition));
  });
}

function renderMobilePlayerStrip(run) {
  return el("div", "mobile-player-strip", [
    el("div", "mobile-vitals", [
      el("span", "", `命 ${run.hp}/${run.maxHp}`),
      el("span", "", `挡 ${run.combat?.block ?? 0}`),
      el("span", "", `气 ${run.energy}/${effectiveMaxEnergy(run)}`),
    ]),
    el("div", "player-status-chip-row", formatPlayerStatusChips(run, 3)),
  ]);
}

function renderCard(definition, onClick, options = {}) {
  const node = el("button", `game-card rarity-${definition.rarity}`);
  node.type = "button";
  node.addEventListener("click", (event) => {
    if (Date.now() < suppressCardClickUntil) {
      event.preventDefault();
      return;
    }
    onClick(event);
  });
  const displayCost = options.costInfo?.cost ?? definition.cost;
  const costText = options.costInfo?.firstFree ? `免/${definition.cost}` : displayCost === definition.cost ? `${definition.cost}` : `${displayCost}/${definition.cost}`;
  node.append(
    el("span", "card-rarity", rarityInfo[definition.rarity].label),
    el("strong", "", definition.name),
    el("span", "card-cost", costText),
    el("p", "card-body", definition.text),
    renderCardStyle(definition),
    renderEffectBadges(definition),
    el("span", "myth-tags", definition.mythTags.join(" / ")),
  );
  return node;
}

function detailForCard(definition) {
  const style = definition.style ? styleInfo[definition.style]?.label ?? definition.style : "通用";
  const grade = definition.grade ? gradeInfo[definition.grade] ?? `${definition.grade} 阶` : "无阶";
  const mythBoost = cardMythBoost(state.run, definition, state.meta);
  const costInfo = effectiveCardCost(state.run, definition);
  const effectiveCostLine = costInfo.firstFree
    ? `当前费用：首张洪荒牌免费（原 ${definition.cost}）`
    : costInfo.cost !== definition.cost
      ? `当前费用：${costInfo.cost}/${definition.cost}`
      : `费用：${definition.cost}`;
  const perkLines = (definition.mythTags ?? [])
    .filter((tag) => hasMythMasteryPerk(state.run ?? state.meta, tag, state.meta))
    .map((tag) => MYTH_MASTERY_PERKS[tag]?.text)
    .filter(Boolean);
  const mythLine = mythBoost.active
    ? `箓印：${mythBoost.tag} ${mythBoost.level}/${MYTH_MASTERY_MAX}，数值 +${mythBoost.numericBonus}，状态 +${mythBoost.statusBonus}`
    : mythBoost.level > 0
      ? `箓印：${mythBoost.tag} ${mythBoost.level}/${MYTH_MASTERY_MAX}，此牌没有可加成的战斗数值`
    : "箓印：当前未生效";
  return {
    key: `card:${definition.id}`,
    type: "卡牌详情",
    title: definition.name,
    main: definition.text,
    lines: [
      effectiveCostLine,
      `品级：${rarityInfo[definition.rarity].label}`,
      `流派：${style} / ${grade}`,
      `功能：${cardFunctionLabel(definition)}`,
      `效果：${cardEffectLabels(definition).join("，") || "无"}`,
      mythLine,
      ...perkLines,
      `神话标签：${definition.mythTags.join(" / ")}`,
    ],
  };
}

function renderCardStyle(definition) {
  if (!definition.style && !definition.grade) {
    return el("div", "style-badges", []);
  }

  return el("div", "style-badges", [
    definition.style ? el("span", "", styleInfo[definition.style]?.label ?? definition.style) : null,
    definition.grade ? el("span", "", gradeInfo[definition.grade] ?? `${definition.grade} 阶`) : null,
  ].filter(Boolean));
}

function canPlayCard(definition, run) {
  const costInfo = effectiveCardCost(run, definition);
  if (run.energy < costInfo.cost) return false;
  if (definition.id === "meditate" && run.energy >= effectiveMaxEnergy(run)) return false;
  return true;
}

function renderRewardChoice(reward) {
  if (reward.type === "card") {
    const definition = cards[reward.value];
    return renderCard(definition, () => dispatch({ type: "chooseReward", rewardId: reward.id }));
  }

  if (reward.type === "relic") {
    const relic = relics[reward.value];
    const node = el("button", `relic-choice rarity-${relic.rarity}`);
    node.type = "button";
    node.addEventListener("click", () => dispatch({ type: "chooseReward", rewardId: reward.id }));
    // V3.1: show blood sacrifice label/text if present
    node.append(
      el("span", "card-rarity", reward.bloodSacrifice ? "血祭" : rarityInfo[relic.rarity].label),
      el("strong", "", reward.label || relic.name),
      el("p", "", reward.text || relic.text)
    );
    return node;
  }

  if (reward.type === "specialFragment") {
    const node = el("button", "relic-choice rarity-legendary");
    node.type = "button";
    node.addEventListener("click", () => dispatch({ type: "chooseReward", rewardId: reward.id }));
    node.append(el("span", "card-rarity", "异兆"), el("strong", "", "玄箓残片"), el("p", "", "特殊通关目标进度 +1。普通遗物不会触发特殊通关。"));
    return node;
  }

  if (reward.type === "gold") {
    return button(`获得 ${reward.value} 金`, "primary", () => dispatch({ type: "chooseReward", rewardId: reward.id }));
  }

  if (reward.type === "purge") {
    const node = el("button", "relic-choice rarity-rare");
    node.type = "button";
    node.addEventListener("click", () => dispatch({ type: "chooseReward", rewardId: reward.id }));
    node.append(el("span", "card-rarity", "剔牌"), el("strong", "", reward.label || "斩念机缘"), el("p", "", reward.text || "剔除一张可删除牌。"));
    return node;
  }

  return button(`回复 ${reward.value} 点生命`, "primary", () => dispatch({ type: "chooseReward", rewardId: reward.id }));
}

function renderRelics(ids) {
  if (ids.length === 0) {
    return el("p", "muted", "尚无遗物。");
  }

  return el(
    "div",
    "relic-list",
    ids.map((id) => {
      const relic = relics[id];
      return el("div", `relic rarity-${relic.rarity}`, [el("strong", "", relic.name), el("span", "", relic.text)]);
    }),
  );
}

function renderStatusLine(label, statuses) {
  return el("div", "status-line", [el("span", "muted", label), renderStatusChips(statuses)]);
}

function renderLog(log) {
  const visible = log.slice(-12).reverse();
  return el("aside", "log", [el("h2", "", "战斗记录"), ...visible.map((line) => el("p", "", line))]);
}

function renderActionBanner(log) {
  const lines = log.slice(-3).reverse();
  return el("section", "action-banner", [el("span", "muted", "刚刚"), ...lines.map((line, index) => el("strong", index === 0 ? "latest-action" : "", line))]);
}

function renderPlayerVitals(run) {
  const hpPercent = Math.max(0, Math.round((run.hp / run.maxHp) * 100));
  return el("section", "vitals", [
    el("div", "vital-head", [el("strong", "", "自身"), el("span", "", `${run.hp}/${run.maxHp}`)]),
    meter(hpPercent, `${run.hp}/${run.maxHp}`, "hp-meter"),
    blockMeter(run.combat?.block ?? 0),
  ]);
}

function renderGoalPanel(run) {
  const progress = goalProgress(run);
  const goal = run.goal ?? createRunGoal(run.seed);
  const specialText = progress.specialActive
    ? `特殊：${goal.special.title}（残片 ${progress.special}）`
    : `特殊：${goal.special.title}（本局未显，约十局一现）`;
  return el("section", "goal-panel", [
    el("div", "goal-title", [el("strong", "", "本局目标"), el("span", "", `${progress.targetMinutes} 分钟`)]),
    el("p", "", `主线：${goal.main.title}（${progress.floor}）`),
    el("p", "", specialText),
  ]);
}

function renderPileStrip(run, combat) {
  return el("div", "pile-strip", [
    el("span", "", `牌组 ${run.deck.length}/${run.deckLimit ?? 30}`),
    button(`抽 ${combat.drawPile.length}`, "pile-button", () => showPile("抽牌堆", combat.drawPile)),
    el("span", "", `手 ${combat.hand.length}/${run.handLimit ?? 5}`),
    el("span", "", `弃/回收 ${combat.discardPile.length}`),
  ]);
}

function showPile(title, cardInstances) {
  pileInfo = {
    title,
    cards: cardInstances.map((card) => card.cardId),
  };
  render();
}

function renderPilePanel(info) {
  const grouped = groupCardIds(info.cards);
  return el("aside", "pile-panel", [
    el("div", "detail-head", [
      el("div", "", [el("span", "muted", `${info.cards.length} 张`), el("h2", "", info.title)]),
      button("关闭", "ghost small", () => {
        pileInfo = null;
        render();
      }),
    ]),
    grouped.length ? el("div", "pile-list", grouped.map(renderPileRow)) : el("p", "muted", "空"),
  ]);
}

function renderPileRow(item) {
  const definition = cards[item.cardId];
  return el("div", "pile-row", [
    el("strong", "", definition.name),
    el("span", "", `${rarityInfo[definition.rarity].label}${definition.style ? ` / ${styleInfo[definition.style]?.label ?? definition.style}` : ""}`),
    el("em", "", `x${item.count}`),
  ]);
}

function groupCardIds(cardIds) {
  const counts = new Map();
  for (const cardId of cardIds) {
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([cardId, count]) => ({ cardId, count }))
    .sort((left, right) => compareCardDefinitions(cards[left.cardId], cards[right.cardId]));
}

function renderDiscardPickPanel(run) {
  const choice = run.pendingChoice;
  const combat = run.combat;
  const options = sortCardInstancesByFunction(combat.discardPile.filter((card) => canRecoverDiscardCard(card, choice)));
  return el("aside", "discard-pick-panel", [
    el("div", "detail-head", [
      el("div", "", [el("span", "muted", "弃牌回收"), el("h2", "", choice.title)]),
      button("跳过", "ghost small", () => dispatch({ type: "cancelDiscardPick" })),
    ]),
    renderMobilePlayerStrip(run),
    el("p", "detail-main", "弃牌堆不是永久废弃，它会洗回牌库，也可以被归藏类卡牌主动取回。"),
    el(
      "div",
      "discard-pick-grid",
      options.map((cardInstance) => {
        const definition = cards[cardInstance.cardId];
        const node = renderCard(definition, () => dispatch({ type: "pickDiscardCard", cardUid: cardInstance.uid }));
        node.classList.add("pick-card");
        return node;
      }),
    ),
  ]);
}

function canRecoverDiscardCard(cardInstance, choice) {
  if (cardInstance.uid === choice.sourceUid) return false;
  const excluded = new Set(choice.excludeStyles ?? []);
  const style = cards[cardInstance.cardId]?.style;
  return !style || !excluded.has(style);
}

function renderPurgeOverlay(run) {
  const purge = run.pendingPurge;
  // Normalize: could be string (old) or object (new)
  let filter, remaining, label;
  if (typeof purge === "object" && purge !== null) {
    filter = purge.filter || "any";
    remaining = purge.remaining || 0;
    label = filter === "twoWithCurse" ? "洗髓令" : filter === "basic" ? "散功符" : "斩念符";
  } else {
    filter = typeof purge === "string" ? purge : "any";
    remaining = filter === "twoWithCurse" ? 2 : 1;
    label = filter === "twoWithCurse" ? "洗髓令" : filter === "basic" ? "散功符" : "斩念符";
  }

  const title = remaining > 0
    ? `还需剔除 ${remaining} 张`
    : `${label}`;
  const filterHint = filter === "basic" ? "只能选择基础牌（斩妖式/护身咒/黄符/调息）" : "选择任意可删除的牌";

  const deckCards = sortCardInstancesByFunction([...run.deck]);
  const canDelete = run.deck.length > MIN_DECK_SIZE;
  const basicIds = ["strike", "guard", "yellowCharm", "meditate"];

  return el("aside", "purge-overlay", [
    el("div", "detail-head", [
      el("div", "", [el("span", "muted", `剔牌 — ${label}`), el("h2", "", title)]),
    ]),
    el("p", "detail-main", canDelete
      ? `${filterHint}（牌组至少保留 ${MIN_DECK_SIZE} 张）。`
      : `牌组仅剩 ${run.deck.length} 张，无法继续剔除。`),
    el("div", "purge-grid",
      deckCards.map((cardInstance) => {
        const definition = cards[cardInstance.cardId];
        const isBasic = basicIds.includes(cardInstance.cardId);
        const allowed = filter === "any" || filter === "twoWithCurse"
          ? (!definition?.undeletable && !definition?.isCurse)
          : filter === "basic"
            ? isBasic
            : (!definition?.undeletable && !definition?.isCurse);
        const node = renderCard(definition, () => {
          if (!canDelete || !allowed) return;
          dispatch({ type: "confirmPurge", cardUid: cardInstance.uid });
        });
        if (!allowed) node.classList.add("disabled");
        node.classList.add("pick-card");
        return node;
      }),
    ),
    el("p", "muted", `牌组：${run.deck.length} 张 | 最低保留：${MIN_DECK_SIZE} 张`),
  ]);
}

function renderStatusChips(statuses) {
  const active = statuses.filter((status) => status.stacks > 0);
  if (active.length === 0) {
    return el("span", "empty-status", "无");
  }

  return el(
    "div",
    "status-chips",
    active.map((status) => {
      const node = el("button", `status-chip status-${status.id}`, `${statusInfo[status.id]?.label ?? status.id} ${status.stacks}`);
      node.type = "button";
      node.addEventListener("click", () => showDetail(detailForStatus(status)));
      return node;
    }),
  );
}

function blockMeter(value) {
  const safeValue = Math.max(0, value);
  const percent = Math.min(100, Math.round((safeValue / 24) * 100));
  const node = meter(percent, `格挡 ${safeValue}`, safeValue > 0 ? "block-meter active" : "block-meter");
  return node;
}

function renderEffectBadges(definition) {
  return el("div", "effect-badges", cardEffectLabels(definition).slice(0, 3).map((label) => el("span", "", label)));
}

function cardEffectLabels(definition) {
  const labels = [];
  const mythBoost = cardMythBoost(state.run, definition, state.meta);
  if (mythBoost.active) {
    labels.push(`${mythBoost.tag}箓印 +${mythBoost.level}`);
  }
  for (const effect of definition.effects) {
    if (effect.type === "damage") labels.push(`伤害 ${effect.value}`);
    if (effect.type === "execute") labels.push(`斩杀 ${effect.threshold ?? 35}%`);
    if (effect.type === "block") labels.push(`格挡 ${effect.value}`);
    if (effect.type === "heal") labels.push(`回复 ${effect.value}`);
    if (effect.type === "draw") labels.push(`抽牌 ${effect.value}`);
    if (effect.type === "gainEnergy") labels.push(`能量 ${effect.value}`);
    if (effect.type === "status") labels.push(`${statusInfo[effect.status]?.label ?? effect.status} ${effect.stacks}`);
    if (effect.type === "thunderMark") labels.push(`雷痕 ${effect.stacks ?? effect.value}`);
    if (effect.type === "amplifyDebuffs") labels.push(`状态 +${effect.value}`);
    if (effect.type === "bleedSiphon") labels.push(`汲血 /${effect.ratio ?? 3}`);
    if (effect.type === "shellReflect") labels.push(`反震 ${Math.round((effect.ratio ?? 0.5) * 100)}%`);
    if (effect.type === "recoverDiscard") labels.push(effect.excludeStyles?.includes("control") ? `回收非控 ${effect.value}` : `回收 ${effect.value}`);
    if (effect.type === "loseHp") labels.push(`失血 ${effect.value}`);
  }

  return labels;
}

function cardFunctionLabel(definition) {
  const labels = ["格挡", "攻击", "状态", "运转", "回复", "其他"];
  return labels[cardFunctionRank(definition)] ?? "其他";
}

function renderIntentButton(enemy) {
  const node = el("button", "intent", intentButtonText(enemy));
  node.type = "button";
  node.addEventListener("click", () => showDetail(detailForIntent(enemy)));
  return node;
}

function intentButtonText(enemy) {
  const stun = statusValue(enemy, "stun");
  if (stun > 0) {
    return "眩晕空过";
  }

  const chaos = statusValue(enemy, "chaos");
  if (chaos > 0) {
    const hasAlly = state.run?.combat?.enemies.some((item) => item.uid !== enemy.uid && item.hp > 0);
    return enemy.intent.type === "attack" && hasAlly ? "离间转火" : "离间空过";
  }

  const bind = statusValue(enemy, "bind");
  if (bind > 0) {
    return enemy.intent.type === "block" ? "禁锢格挡" : "禁锢空过";
  }

  const preview = previewEnemyIntent(state.run, enemy);
  if (preview?.type === "attack") {
    return `${intentName(enemy.intent.text, "攻击")} ${preview.expectedDamage}`;
  }

  if (preview?.type === "block") {
    return `${intentName(enemy.intent.text, "格挡")} ${preview.value}`;
  }

  return enemy.intent.text;
}

function intentName(text, fallback) {
  return text.replace(/\s*\d+\s*$/, "").trim() || fallback;
}

function statusValue(fighter, statusId) {
  return fighter.statuses.find((status) => status.id === statusId)?.stacks ?? 0;
}

function renderBarImpacts(statuses, owner) {
  const impacts = impactLabels(statuses, owner);
  if (impacts.length === 0) {
    return el("div", "bar-impacts empty-impact", "暂无状态影响");
  }

  return el(
    "div",
    "bar-impacts",
    impacts.map((impact) => {
      const node = el("button", `impact-chip ${impact.kind}`, impact.label);
      node.type = "button";
      node.addEventListener("click", () => showDetail(detailForStatus(impact.status)));
      return node;
    }),
  );
}

function impactLabels(statuses, owner) {
  const result = [];
  for (const status of statuses.filter((item) => item.stacks > 0)) {
    if (status.id === "spirit") {
      result.push({ status, kind: "impact-buff", label: `出牌伤害 +${status.stacks}` });
    }
    if (status.id === "battleIntent") {
      result.push({ status, kind: "impact-buff", label: `物理伤害 +${status.stacks}` });
    }
    if (status.id === "ward") {
      result.push({ status, kind: "impact-buff", label: `先抵消 ${status.stacks}` });
    }
    if (status.id === "chaos") {
      result.push({ status, kind: "impact-debuff", label: `内斗 ${status.stacks} 次` });
    }
    if (status.id === "bind") {
      result.push({ status, kind: "impact-debuff", label: `禁攻禁法 ${status.stacks} 次` });
    }
    if (status.id === "stun") {
      result.push({ status, kind: "impact-debuff", label: `跳过行动 ${status.stacks} 次` });
    }
    if (status.id === "brittle") {
      result.push({ status, kind: "impact-debuff", label: `承伤 x1.5 / ${status.stacks}` });
    }
    if (status.id === "thunderMark") {
      result.push({ status, kind: "impact-debuff", label: `雷痕 ${status.stacks}/8` });
    }
    if (status.id === "stasis") {
      result.push({ status, kind: "impact-debuff", label: `保留状态 ${status.stacks} 次` });
    }
    if (status.id === "curse") {
      result.push({ status, kind: "impact-debuff", label: `${owner === "enemy" ? "承伤" : "受伤"} +${status.stacks}` });
    }
    if (status.id === "burn") {
      result.push({ status, kind: "impact-debuff", label: `回合掉血 ${status.stacks}` });
    }
    if (status.id === "poison") {
      const weakness = owner === "enemy" ? ` / 攻击 -${Math.min(5, Math.floor(status.stacks / 4))}` : "";
      result.push({ status, kind: "impact-debuff", label: `回合掉血 ${status.stacks}${weakness}` });
    }
    if (status.id === "bleed") {
      result.push({ status, kind: "impact-debuff", label: `流血压制 ${status.stacks}` });
    }
  }
  return result;
}

function renderDetailPanel(info) {
  // V3.0: tmFormation detail
  if (info.type === "tmFormation") {
    const f = info.formation;
    const lines = [...(f.detailLines || []), `阶段：${f.stageLabel}`, f.nextTrigger ? `触发：${f.nextTrigger}` : "", f.tip ? `建议：${f.tip}` : ""].filter(Boolean);
    return el("aside", "detail-panel", [
      el("div", "detail-head", [
        el("div", "", [el("span", "muted", "敌方情报"), el("h2", "", f.name)]),
        button("关闭", "ghost small", () => { detailInfo = null; render(); }),
      ]),
      el("p", "detail-main", f.summary),
      el("ul", "detail-list", lines.map((line) => el("li", "", line))),
    ]);
  }
  // UI1: player status detail popover
  if (info.type === "playerStatuses") {
    return renderPlayerStatusPopover(info.run);
  }
  return el("aside", "detail-panel", [
    el("div", "detail-head", [
      el("div", "", [el("span", "muted", info.type), el("h2", "", info.title)]),
      button("关闭", "ghost small", () => {
        detailInfo = null;
        render();
      }),
    ]),
    el("p", "detail-main", info.main),
    el("ul", "detail-list", info.lines.map((line) => el("li", "", line))),
  ]);
}

// UI1: player status full popover
function renderPlayerStatusPopover(run) {
  const statuses = (run?.statuses || []).filter(s => s.stacks > 0);
  // Priority order for display
  const priority = ["spikes", "blockShield", "curse", "spirit", "burn", "poison", "bleed", "thunderMark", "ward", "battleIntent", "stasis", "thunderFireMark", "clearMind", "chaos", "bind", "stun"];
  const getPriority = (id) => { const idx = priority.indexOf(id); return idx >= 0 ? idx : 99; };
  const sorted = [...statuses].sort((a, b) => getPriority(a.id) - getPriority(b.id));

  const items = sorted.map(s => {
    const info = statusInfo[s.id];
    const label = info?.label ?? s.id;
    const text = info?.text ?? "状态效果已生效，暂无说明";
    return el("div", `status-popover-item status-${s.id}`, [
      el("span", "status-popover-name", `${label} ${s.stacks}`),
      el("span", "status-popover-desc", text),
    ]);
  });

  if (items.length === 0) {
    items.push(el("div", "status-popover-item", [el("span", "", "无状态")]));
  }

  const panel = el("aside", "detail-panel status-popover", [
    el("div", "detail-head", [
      el("h2", "", `玩家状态 (${statuses.length})`),
      button("关闭", "ghost small", () => { detailInfo = null; render(); }),
    ]),
    el("div", "status-popover-list", items),
  ]);

  // Close on outside click
  setTimeout(() => {
    panel.addEventListener("click", (e) => e.stopPropagation());
  }, 0);

  return panel;
}

function showDetail(info) {
  detailInfo = detailInfo?.key && detailInfo.key === info.key ? null : info;
  render();
}

function openDetail(info) {
  detailInfo = info;
  render();
}

async function handleCloudAction(action) {
  if (cloudBusy) return;

  const config = readCloudForm();
  cloudBusy = true;
  cloudMessage = "云存档处理中...";
  render();

  try {
    if (action === "connect") {
      const connected = await connectCloud(config);
      cloudMessage = `已连接 ${connected.userLogin} / ${connected.playerId}`;
    }

    if (action === "upload") {
      const savedConfig = saveCloudConfig(config);
      const result = await uploadCloudSave(state, savedConfig);
      cloudMessage = `已上传 ${savedConfig.playerId}，版本 ${result.appVersion}`;
    }

    if (action === "download") {
      const savedConfig = saveCloudConfig(config);
      const cloudState = await downloadCloudSave(savedConfig);
      if (!cloudState) {
        cloudMessage = `云端没有 ${savedConfig.playerId} 的存档`;
      } else if (window.confirm("读取云端存档会覆盖当前本地存档，继续吗？")) {
        state = migrateGameState(cloudState);
        saveGame(state);
        cloudMessage = `已读取 ${savedConfig.playerId} 的云端存档`;
      } else {
        cloudMessage = "已取消读取。";
      }
    }
  } catch (error) {
    cloudMessage = error.message || "云存档失败";
  } finally {
    cloudBusy = false;
    render();
  }
}

function readCloudForm() {
  const current = loadCloudConfig();
  const token = document.querySelector("#cloud-token")?.value.trim() || current.token || "";
  const playerId = document.querySelector("#cloud-player")?.value.trim() || current.playerId || "";
  const autoSync = Boolean(document.querySelector("#cloud-auto")?.checked);
  return { ...current, token, playerId, autoSync };
}

function scheduleCloudSync() {
  const config = loadCloudConfig();
  if (!config.autoSync || !config.token || !config.playerId) return;

  window.clearTimeout(cloudTimer);
  cloudTimer = window.setTimeout(async () => {
    try {
      const result = await uploadCloudSave(state, config);
      cloudMessage = `已自动上传 ${config.playerId}，版本 ${result.appVersion}`;
    } catch (error) {
      cloudMessage = error.message || "自动上传失败";
    }
  }, 900);
}

function detailForStatus(status) {
  const info = statusInfo[status.id];
  const stacks = status.stacks;
  const map = {
    spirit: [`当前数值 ${stacks} 表示：你用卡牌造成伤害时，会按卡牌费用获得部分伤害加成。`, "低费牌只能承载部分灵气，高费牌更容易吃满收益；战斗结束后清空。"],
    battleIntent: [`当前数值 ${stacks} 表示：物理牌造成伤害时额外 +${stacks}。`, "每打出一张物理伤害牌后，战意会继续增加 7 层；它会随回合逐步减少，战斗结束后清空。"],
    ward: [`当前数值 ${stacks} 表示：下次受到伤害前，先抵消 ${stacks} 点。`, "它会优先保护血条，作用类似一层可消耗的小格挡。"],
    chaos: [`当前数值 ${stacks} 表示：敌人接下来 ${stacks} 次行动会被离间干扰。`, "如果本次是攻击且有同伴，会转而攻击同伴；否则会直接空过，不会攻击、格挡或施加状态。"],
    bind: [`当前数值 ${stacks} 表示：敌人接下来 ${stacks} 次行动会受禁锢影响。`, "攻击和施法会被封住并空过；如果本来要格挡，则仍可格挡，但禁锢会减少 1 层。"],
    stun: [`当前数值 ${stacks} 表示：敌人接下来 ${stacks} 次行动会被眩晕跳过。`, "眩晕会先于离间结算；被眩晕的敌人不会攻击、格挡或施加状态。"],
    brittle: [`当前数值 ${stacks} 表示：敌人处于脆化窗口，受到伤害变为 1.5 倍。`, "离间、禁锢、眩晕合计达到 6 层会触发心防崩裂：清空敌人格挡，并获得脆化。"],
    thunderMark: [`当前数值 ${stacks} 表示：敌人身上已积累 ${stacks} 层雷痕。`, `每满 8 层会立刻触发天劫，造成 32 点无视格挡雷伤，并施加 1 次眩晕。当前还差 ${Math.max(0, 8 - (stacks % 8 || 8))} 层。`],
    stasis: [`当前数值 ${stacks} 表示：流血、毒瘴、离间将要减少层数时，先消耗凝滞。`, "它会让核心 debuff 不掉层，适合把流血、中毒、控制不断堆高。"],
    curse: [`当前数值 ${stacks} 表示：受到卡牌伤害时额外 +${stacks}。`, "如果在敌人身上，它会让敌人血条掉得更快；如果在你身上，敌人攻击会更痛。"],
    burn: [`当前数值 ${stacks} 表示：回合结算时受到 ${stacks} 点伤害。`, "造成伤害后会消退一半，至少减少 1 层，不会一直滚到无解。"],
    poison: [`当前数值 ${stacks} 表示：回合结算时受到 ${stacks} 点伤害，然后减少 1 层。`, `如果在敌人身上，它攻击时会被虚弱 ${Math.min(5, Math.floor(stacks / 4))} 点；适合拖回合削弱高伤敌人。`],
    bleed: [`当前数值 ${stacks} 表示：回合间会先扣格挡再造成伤害；被攻击时也会额外爆开。`, "血魔牌会先付出生命，再按敌人流血层数回血。层数堆高后，流血会从风险变成续航和爆发来源。"],
  };

  return {
    key: `status:${status.id}`,
    type: "状态说明",
    title: `${info?.label ?? status.id} ${stacks}`,
    main: info?.text ?? "暂无说明。",
    lines: map[status.id] ?? [`当前层数：${stacks}`],
  };
}

function detailForIntent(enemy) {
  const intent = enemy.intent;
  const stun = statusValue(enemy, "stun");
  if (stun > 0) {
    return {
      key: `intent:${enemy.uid}:stun:${stun}:${intent.text}`,
      type: "敌人意图",
      title: "眩晕空过",
      main: `${enemy.name} 当前被眩晕压制，本次不会执行原意图。`,
      lines: [
        `眩晕层数：${stun}`,
        "它不会攻击、格挡或施加状态，会直接空过这一回合。",
        "结算后眩晕减少 1 层。",
      ],
    };
  }

  const chaos = statusValue(enemy, "chaos");
  if (chaos > 0) {
    const hasAlly = state.run?.combat?.enemies.some((item) => item.uid !== enemy.uid && item.hp > 0);
    const willTurn = intent.type === "attack" && hasAlly;
    return {
      key: `intent:${enemy.uid}:chaos:${chaos}:${intent.text}`,
      type: "敌人意图",
      title: willTurn ? "离间转火" : "离间空过",
      main: `${enemy.name} 当前受到离间影响，本次不会正常执行原意图。`,
      lines: [
        `离间层数：${chaos}`,
        willTurn ? "它会优先攻击同伴，而不是攻击你。" : "它不会攻击、格挡或施加状态，会直接空过这一回合。",
        "结算后离间减少 1 层；如果有凝滞，则消耗凝滞并保留离间。",
      ],
    };
  }

  const bind = statusValue(enemy, "bind");
  if (bind > 0) {
    const willBlock = intent.type === "block";
    return {
      key: `intent:${enemy.uid}:bind:${bind}:${intent.text}`,
      type: "敌人意图",
      title: willBlock ? "禁锢格挡" : "禁锢空过",
      main: `${enemy.name} 当前受到禁锢影响，本次行动会先检查是否为攻击或施法。`,
      lines: [
        `禁锢层数：${bind}`,
        willBlock ? "它本次原本要格挡，所以仍会获得格挡，但禁锢减少 1 层。" : "它本次原本要攻击或施法，会直接空过，不会伤害你或施加状态。",
        "离间、禁锢、眩晕合计达到 6 层时，会触发心防崩裂，清空格挡并获得脆化。",
      ],
    };
  }

  if (intent.type === "attack") {
    const preview = previewEnemyIntent(state.run, enemy);
    return {
      key: `intent:${enemy.uid}:${intent.type}:${intent.text}`,
      type: "敌人意图",
      title: intentButtonText(enemy),
      main: `${enemy.name} 下次行动会攻击。`,
      lines: [
        `基础伤害：${preview?.base ?? intent.value}`,
        `难度/ Boss 加成：${preview?.bonus ?? 0}`,
        `毒瘴虚弱：-${preview?.poisonWeakness ?? 0}`,
        `你身上的诅咒加成：${preview?.curse ?? 0}`,
        `预计未被护体和格挡抵消前伤害：${preview?.expectedDamage ?? intent.value}`,
        "伤害会先被你的护体和格挡抵消。",
      ],
    };
  }

  if (intent.type === "block") {
    const preview = previewEnemyIntent(state.run, enemy);
    return {
      key: `intent:${enemy.uid}:${intent.type}:${intent.text}`,
      type: "敌人意图",
      title: intentButtonText(enemy),
      main: `${enemy.name} 下次行动会获得格挡。`,
      lines: [
        `基础格挡：${preview?.base ?? intent.value}`,
        `难度加成：${preview?.bonus ?? 0}`,
        `实际获得格挡：${preview?.value ?? intent.value}`,
        "格挡会显示在敌人血条下面，先抵消你造成的伤害。",
      ],
    };
  }

  return {
    key: `intent:${enemy.uid}:${intent.type}:${intent.text}`,
    type: "敌人意图",
    title: intent.text,
    main: `${enemy.name} 下次行动会施加状态。`,
    lines: [
      `数字 ${intent.stacks} 表示施加 ${statusInfo[intent.status]?.label ?? intent.status} 的层数。`,
      statusInfo[intent.status]?.text ?? "这个状态会影响后续战斗结算。",
    ],
  };
}

function renderCodex() {
  const rows = Object.entries(statusInfo).map(([id, info]) => el("li", "", [el("strong", "", info.label), el("span", "", info.text)]));
  return el("section", "codex", [el("h2", "", "状态速览"), el("ul", "", rows)]);
}

function renderRunSummary(run) {
  const maxFloor = run.trueMartial ? TRUE_MARTIAL_MAX_FLOOR : MAX_FLOOR;
  return el("div", "summary", [
    stat("层数", `${Math.min(run.floor, maxFloor)}/${maxFloor}`),
    stat("生命", `${run.hp}/${run.maxHp}`),
    stat("牌组", run.deck.length),
    stat("遗物", run.relics.length),
  ]);
}

function stat(label, value, onClick = null) {
  const text = (value != null) ? String(value) : "--";
  if (!onClick) {
    return el("div", "stat", [el("span", "", label), el("strong", "", text)]);
  }

  const node = el("button", "stat stat-action", [el("span", "", label), el("strong", "", text)]);
  node.type = "button";
  node.onclick = onClick;
  return node;
}

function input(id, type, value, placeholder) {
  const node = document.createElement("input");
  node.id = id;
  node.type = type;
  node.value = value;
  node.placeholder = placeholder;
  return node;
}

function checkbox(id, checked) {
  const node = document.createElement("input");
  node.id = id;
  node.type = "checkbox";
  node.checked = checked;
  return node;
}

function field(label, control) {
  return el("label", "cloud-field", [el("span", "", label), control]);
}

function labelWrap(id, label, control) {
  const node = el("label", "cloud-check", [control, el("span", "", label)]);
  node.htmlFor = id;
  return node;
}

function meter(percent, text, className = "") {
  const outer = el("div", `meter ${className}`);
  outer.append(el("span", "meter-fill"));
  outer.querySelector(".meter-fill").style.width = `${percent}%`;
  outer.append(el("em", "", text));
  return outer;
}

function button(text, className, onClick) {
  const node = el("button", className);
  node.type = "button";
  node.textContent = text;
  node.addEventListener("click", onClick);
  return node;
}

function image(src, alt) {
  const node = document.createElement("img");
  node.src = src;
  node.alt = alt;
  return node;
}

function el(tag, className = "", children = []) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }

  if (typeof children === "string") {
    node.textContent = children;
    return node;
  }

  // Normalize: single node / null → array
  if (children == null) children = [];
  if (!Array.isArray(children)) children = [children];

  for (const child of children) {
    // V3.13M-R1-HARNESS-UI: prevent literal null/undefined in DOM
    // node.append(null) renders the string "null" in browsers
    if (child != null) node.append(child);
  }

  return node;
}

// UI1: close player status popover on ESC or outside click
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && detailInfo?.type === "playerStatuses") { detailInfo = null; render(); }
});
document.addEventListener("click", (e) => {
  if (detailInfo?.type === "playerStatuses" && !e.target.closest(".detail-panel") && !e.target.closest(".status-chip-inline")) {
    detailInfo = null; render();
  }
});

render();
