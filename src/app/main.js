import { cards, gradeInfo, rarityInfo, relics, shopItems, statusInfo, styleInfo } from "../core/data.js";
import { archetypeRanking, dominantArchetype, styleLabel } from "../core/archetypes.js";
import { previewEnemyIntent } from "../core/combat.js";
import { reduceGame } from "../core/reducer.js";
import { clearSave, loadGame, saveGame } from "../core/save.js";
import { MAX_FLOOR } from "../core/types.js";
import { gameVersion } from "../core/version.js";
import { createRunGoal, goalProgress } from "../core/goals.js";
import { talentCost, talentDefinitions, talentLevel } from "../core/progression.js";
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

function dispatch(action) {
  state = reduceGame(state, action);
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

  if (state.phase === "gameOver") {
    shell.append(renderGameOver());
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

  return shell;
}

function renderHeader() {
  const header = el("header", "topbar");
  header.append(
    el("div", "brand", [
      image("./assets/seal.svg", "玄箓印"),
      el("div", "", [el("h1", "", "玄箓行"), el("p", "", `神话杂糅文字肉鸽 · v${gameVersion.app}`)]),
    ]),
    el("div", "topbar-actions", [
      el("div", "meta", [
        stat("残魂", state.meta.soul),
        stat("行旅", state.meta.totalRuns),
        stat("通关", state.meta.wins),
      ]),
      button("云存档", "ghost small cloud-shortcut", () => {
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
        button("开始一局", "primary", () => dispatch({ type: "startRun" })),
      ]),
      renderCloudPanel(),
      renderProgression(),
    ]),
    renderCodex(),
  );
  return view;
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
    el("section", "battlefield", [
      renderActionBanner(combat.log),
      el("div", "enemy-row", combat.enemies.map(renderEnemy)),
      renderHand(run, combat),
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
  return view;
}

function renderGameOver() {
  const view = el("section", "game-over-layout");
  view.append(el("section", "game-over", [
    el("h2", "", state.message),
    state.run ? renderRunSummary(state.run) : el("p", "", "旧梦已散。"),
    el("div", "actions", [
      button("再开一局", "primary", () => dispatch({ type: "startRun" })),
      button("清除存档", "ghost", () => {
        clearSave();
        state = reduceGame(state, { type: "reset" });
        render();
      }),
    ]),
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
  panel.append(
    el("h2", "", `第 ${run.floor}/${MAX_FLOOR} 层`),
    renderPlayerVitals(run),
    renderGoalPanel(run),
    renderArchetypePanel(run),
    el("div", "stat-grid", [
      stat("生命", `${run.hp}/${run.maxHp}`),
      stat("格挡", run.combat?.block ?? 0),
      stat("受伤加成", `+${statusValue(run, "curse")}`),
      stat("能量", `${run.energy}/${run.maxEnergy}`),
      stat("牌组上限", `${run.deck.length}/${run.deckLimit ?? 30}`),
      stat("手牌", `${currentHandCount(run)}/${run.handLimit ?? 5}`),
      stat("抽牌堆", run.combat?.drawPile.length ?? 0, run.combat ? () => showPile("抽牌堆", run.combat.drawPile) : null),
      stat("弃牌/回收", run.combat?.discardPile.length ?? 0),
      stat("金", run.gold),
    ]),
    renderStatusLine("自身状态", run.statuses),
    el("h3", "", "遗物"),
    renderRelics(run.relics),
    el("div", "run-actions", [
      button("查看修行", "ghost small", () => {
        progressionOpen = true;
        render();
      }),
      button("放弃并重开", "danger small", () => dispatch({ type: "abandonRun" })),
    ]),
  );
  return panel;
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

function renderEnemy(enemy) {
  const isSelected = enemy.uid === selectedTargetUid;
  const card = el("article", `enemy ${isSelected ? "selected" : ""}`);
  const hpPercent = Math.max(0, Math.round((enemy.hp / enemy.maxHp) * 100));

  card.append(
    el("div", "enemy-title", [el("h3", "", enemy.name), renderIntentButton(enemy)]),
    meter(hpPercent, `${enemy.hp}/${enemy.maxHp}`, "hp-meter"),
    blockMeter(enemy.block),
    renderBarImpacts(enemy.statuses, "enemy"),
    renderStatusLine("状态", enemy.statuses),
    button(isSelected ? "目标" : "选中", isSelected ? "primary small" : "ghost small", () => {
      selectedTargetUid = enemy.uid;
      render();
    }),
  );

  if (enemy.hp <= 0) {
    card.classList.add("defeated");
  }

  return card;
}

function renderHand(run, combat) {
  const area = el("section", "hand-area");
  const cardsNode = el("div", "hand");

  for (const cardInstance of combat.hand) {
    const definition = cards[cardInstance.cardId];
    const canPlay = canPlayCard(definition, run);
    const canDiscard = !combat.flags.discardedThisTurn && !run.pendingChoice;
    const node = renderCard(definition, () => {
      if (canPlay) {
        dispatch({
          type: "playCard",
          cardUid: cardInstance.uid,
          targetUid: selectedTargetUid,
        });
      }
    });

    if (!canPlay) {
      node.classList.add("disabled");
    }

    const slot = el("div", "hand-card-slot", [
      node,
      button(canDiscard ? "弃置并抽 1" : "本回合已弃", canDiscard ? "ghost small discard-action" : "ghost small discard-action disabled", () => {
        if (canDiscard) dispatch({ type: "discardHandCard", cardUid: cardInstance.uid });
      }),
    ]);
    cardsNode.append(slot);
  }

  area.append(
    el("div", "hand-head", [
      el("div", "", [el("h2", "", `手牌 ${combat.hand.length}/${run.handLimit ?? 5}`), renderPileStrip(run, combat)]),
      button("结束回合", "danger", () => dispatch({ type: "endTurn" })),
    ]),
    cardsNode,
  );

  return area;
}

function renderCard(definition, onClick) {
  const node = el("button", `game-card rarity-${definition.rarity}`);
  node.type = "button";
  node.addEventListener("click", onClick);
  node.append(
    el("span", "card-rarity", rarityInfo[definition.rarity].label),
    el("strong", "", definition.name),
    el("span", "card-cost", `${definition.cost}`),
    el("p", "", definition.text),
    renderCardStyle(definition),
    renderEffectBadges(definition),
    el("span", "myth-tags", definition.mythTags.join(" / ")),
  );
  return node;
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
  if (run.energy < definition.cost) return false;
  if (definition.id === "meditate" && run.energy >= run.maxEnergy) return false;
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
    node.append(el("span", "card-rarity", rarityInfo[relic.rarity].label), el("strong", "", relic.name), el("p", "", relic.text));
    return node;
  }

  if (reward.type === "gold") {
    return button(`获得 ${reward.value} 金`, "primary", () => dispatch({ type: "chooseReward", rewardId: reward.id }));
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
    renderBarImpacts(run.statuses, "player"),
  ]);
}

function renderGoalPanel(run) {
  const progress = goalProgress(run);
  const goal = run.goal ?? createRunGoal(run.seed);
  const specialText = progress.specialActive
    ? `特殊：${goal.special.title}（遗物 ${progress.special}）`
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
    .sort((left, right) => cards[left.cardId].name.localeCompare(cards[right.cardId].name, "zh-Hans"));
}

function renderDiscardPickPanel(run) {
  const choice = run.pendingChoice;
  const combat = run.combat;
  const options = combat.discardPile.filter((card) => card.uid !== choice.sourceUid);
  return el("aside", "discard-pick-panel", [
    el("div", "detail-head", [
      el("div", "", [el("span", "muted", "弃牌回收"), el("h2", "", choice.title)]),
      button("跳过", "ghost small", () => dispatch({ type: "cancelDiscardPick" })),
    ]),
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
  const labels = [];
  for (const effect of definition.effects) {
    if (effect.type === "damage") labels.push(`伤害 ${effect.value}`);
    if (effect.type === "block") labels.push(`格挡 ${effect.value}`);
    if (effect.type === "heal") labels.push(`回复 ${effect.value}`);
    if (effect.type === "draw") labels.push(`抽牌 ${effect.value}`);
    if (effect.type === "gainEnergy") labels.push(`能量 ${effect.value}`);
    if (effect.type === "status") labels.push(`${statusInfo[effect.status]?.label ?? effect.status} ${effect.stacks}`);
    if (effect.type === "amplifyDebuffs") labels.push(`状态 +${effect.value}`);
    if (effect.type === "recoverDiscard") labels.push(`回收 ${effect.value}`);
    if (effect.type === "loseHp") labels.push(`失血 ${effect.value}`);
    if (effect.type === "leechBleed") labels.push(`吸血 ${Math.round(effect.value * 100)}%流血`);
    if (effect.type === "execute") labels.push(`斩杀 ≤${Math.round((effect.threshold ?? 0.2) * 100)}%`);
    if (effect.type === "spikeBurst") labels.push("格挡反射");
    if (effect.type === "doubleBlock") labels.push("格挡翻倍");
  }

  return el("div", "effect-badges", labels.slice(0, 3).map((label) => el("span", "", label)));
}

function renderIntentButton(enemy) {
  const node = el("button", "intent", intentButtonText(enemy));
  node.type = "button";
  node.addEventListener("click", () => showDetail(detailForIntent(enemy)));
  return node;
}

function intentButtonText(enemy) {
  const chaos = statusValue(enemy, "chaos");
  if (chaos > 0) {
    const hasAlly = state.run?.combat?.enemies.some((item) => item.uid !== enemy.uid && item.hp > 0);
    return enemy.intent.type === "attack" && hasAlly ? "离间转火" : "离间空过";
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
    if (status.id === "ward") {
      result.push({ status, kind: "impact-buff", label: `先抵消 ${status.stacks}` });
    }
    if (status.id === "chaos") {
      result.push({ status, kind: "impact-debuff", label: `内斗 ${status.stacks} 次` });
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
      const atkDown = Math.floor(status.stacks * 0.2);
      result.push({ status, kind: "impact-debuff", label: `回合掉血${status.stacks} 攻击-${atkDown}` });
    }
    if (status.id === "bleed") {
      result.push({ status, kind: "impact-debuff", label: `流血压制 ${status.stacks}` });
    }
    if (status.id === "fury") {
      result.push({ status, kind: "impact-buff", label: `物理伤害 +${status.stacks * 3}` });
    }
    if (status.id === "spikes") {
      result.push({ status, kind: "impact-buff", label: `荆棘反射 ${status.stacks}` });
    }
  }
  return result;
}

function renderDetailPanel(info) {
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

function showDetail(info) {
  detailInfo = detailInfo?.key && detailInfo.key === info.key ? null : info;
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
        state = cloudState;
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
    ward: [`当前数值 ${stacks} 表示：下次受到伤害前，先抵消 ${stacks} 点。`, "它会优先保护血条，作用类似一层可消耗的小格挡。"],
    chaos: [`当前数值 ${stacks} 表示：敌人接下来 ${stacks} 次行动会被离间干扰。`, "如果本次是攻击且有同伴，会转而攻击同伴；否则会直接空过，不会攻击、格挡或施加状态。"],
    stasis: [`当前数值 ${stacks} 表示：流血、毒瘴、离间将要减少层数时，先消耗凝滞。`, "它会让核心 debuff 不掉层，适合把流血、中毒、控制不断堆高。"],
    curse: [`当前数值 ${stacks} 表示：受到卡牌伤害时额外 +${stacks}。`, "如果在敌人身上，它会让敌人血条掉得更快；如果在你身上，敌人攻击会更痛。"],
    burn: [`当前数值 ${stacks} 表示：回合结算时受到 ${stacks} 点伤害。`, "造成伤害后会消退一半，至少减少 1 层，不会一直滚到无解。"],
    poison: [`当前数值 ${stacks} 表示：回合结算时受到 ${stacks} 点伤害并削弱敌人攻击 ${Math.floor(stacks*0.2)} 点。`, "它会同时压低敌人血条和伤害，拖回合越久敌人越无力。", "虚弱上限为敌人攻击的 60%，不会完全归零。"],
    bleed: [`当前数值 ${stacks} 表示：回合间会先扣格挡再造成伤害；被攻击时也会额外爆开。`, "它现在既能压格挡，也能在你攻击时打出爆发，但每次结算会减少层数。"],
    fury: [`当前数值 ${stacks} 表示：物理卡牌每次造成伤害时额外 +${stacks * 3}。`, "回合末减少 1 层，战斗结束后清空。战意激荡可一次性获得 4 层杀意。", "物理流派的核心成长状态，搭配多段攻击（连环刃、破军三式）收益最高。"],
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
  return el("div", "summary", [
    stat("层数", `${Math.min(run.floor, MAX_FLOOR)}/${MAX_FLOOR}`),
    stat("生命", `${run.hp}/${run.maxHp}`),
    stat("牌组", run.deck.length),
    stat("遗物", run.relics.length),
  ]);
}

function stat(label, value, onClick = null) {
  if (!onClick) {
    return el("div", "stat", [el("span", "", label), el("strong", "", String(value))]);
  }

  const node = el("button", "stat stat-action", [el("span", "", label), el("strong", "", String(value))]);
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

  for (const child of children) {
    node.append(child);
  }

  return node;
}

render();
