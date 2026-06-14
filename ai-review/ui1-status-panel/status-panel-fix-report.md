# V3.13N-TM-T2A5F-UI1 Harness Repair Report

## Problem

UI1 状态面板的 harness 工具在上一轮 (fix4) 中多次失败:
- status-panel-summary.json failed = 6
- 失败项包括: popover 缺少荆棘/诅咒/灵气, 缺少结束回合, 缺少手牌区域, 缺少状态描述
- 截图停留在路由页面而非战斗页面
- 报告仍将 failed > 0 的 harness 标记为 PASS

## Root Cause

GPT 审计确认的根因:
1. **harness 未真正进入战斗**: 点击"入门难度"后等待 3 秒但从不验证战斗是否开始
2. **harness 未点击路由页"进入"按钮**: 停留在 route 页面
3. **harness 尝试 `app.__vue_app__`**: 项目是 vanilla JS, 无 Vue
4. **harness 从 `page.evaluate` 访问模块内部 state**: module-local 变量不可从外部访问
5. **`?harness=1` API 不完整**: 旧的 `__setHarnessState` 只支持设置状态, 不支持进入战斗/打开弹层
6. **报告逻辑不严谨**: 状态面板 harness failed 时 verdict 仍可为 PASS

## Repair

### 1. 新增 `window.__dsgHarness` API (src/app/main.js)

仅在 URL 包含 `?harness=1` 时暴露:
- `ready()` → { ok: true, harness: true }
- `getPhase()` → 当前游戏阶段
- `getSnapshot()` → 安全 JSON 快照 (phase, difficulty, floor, statuses, handCount, enemyCount)
- `startNormalRun()` → 通过 dispatch 启动入门难度
- `enterFirstCombat()` → 选择首个主线节点进入战斗, 验证状态变为 combat
- `setPlayerStatuses(statuses)` → 写入 run.statuses 并 render
- `openStatusPopover()` → 触发玩家状态弹层
- `closeStatusPopover()` → 关闭弹层

### 2. 重写 UI1 状态面板 Harness (scripts/harness-release-rc.mjs)

- 使用 `?harness=1` URL 加载页面
- 调用 `__dsgHarness.ready()` 等待 API 就绪
- 调用 `startNormalRun()` → `enterFirstCombat()` 进入真实战斗
- 验证 `getPhase() === "combat"`
- 验证 DOM 存在"结束回合"按钮和手牌区域
- 调用 `setPlayerStatuses()` 注入测试状态 (spikes:2, curse:5, spirit:1, poison:1, burn:1, blockShield:4)
- 验证状态栏存在且 +N 存在
- 截图 desktop-status-panel.png (弹层前)
- 调用 `openStatusPopover()` 打开弹层
- 验证弹层内容: "荆棘 2", "诅咒 5", "灵气 1", "受到攻击时反伤敌人"
- 截图 desktop-status-popover.png
- Esc 关闭弹层并验证
- 移动端流程同样执行 (390x844 viewport)
- 报告前要求 failed=0, pageErrors=0, consoleErrors=0

### 3. 修复报告逻辑 (scripts/create-ui1-review-pack.mjs)

- 增加 release-harness-summary 验证 (之前未检查)
- 增加 NOT_RUN/NOT_RUN_YET/SKIPPED/PENDING 状态检测
- 截图要求 file size > 0 (不只是 exists)
- verdict 必须同时满足 status-panel 和 release-harness 全部通过且截图完整

## Verification

| 检查项 | 结果 |
|--------|------|
| check (语法/数据) | PASS |
| smoke (198 项) | PASS |
| player:flow | PASS |
| build:release | PASS |
| release regression harness | PASS (48/48, failed=0) |
| status panel harness | PASS (37/37, failed=0) |
| status panel pageErrors | 0 |
| status panel consoleErrors | 0 |
| enter_real_combat (desktop) | PASS |
| enter_real_combat (mobile) | PASS |
| desktop 结束回合 visible | PASS |
| mobile 结束回合 visible | PASS |
| desktop hand visible | PASS |
| mobile hand visible | PASS |
| 荆棘 2 弹层内容 | PASS |
| 诅咒 5 弹层内容 | PASS |
| 灵气 1 弹层内容 | PASS |
| 受到攻击时反伤敌人 | PASS |
| 4 张截图完整 | PASS |
| 截图是战斗页面(非路由页) | PASS |

## Declarations

- [x] 未发布 (NOT PUBLISHED)
- [x] 未 commit
- [x] 未 tag
- [x] 未 push
- [x] 未修改战斗数值
- [x] 未修改真武平衡
- [x] 未修改真武合流概率
- [x] 未复跑 normal/regular 9000+9000
- [x] 未复跑 trueMartial 18000
- [x] 未修改 PATCH_DENYLIST 文件

## Verdict: PASS
