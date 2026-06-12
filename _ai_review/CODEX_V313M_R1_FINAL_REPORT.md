# CODEX V3.13M-R1 Final Report

## 1. 本轮性质

本轮是清理 V3.13L sim-ai 残留，只验证纯 V3.13M 机制。

本轮不做新游戏性调整，不发布，不 git push。

## 2. 上一版失败原因

上一版 V3.13M 包中 `scripts/sim-ai.mjs` 仍带有 V3.13L 的 `physicalAI` / `targetUid` 残留，导致 normal / regular 的 physical profile 走了非基线 AI 路径，balance 结果不是纯 V3.13M 机制结果。

同时，`scripts/physical-death-diagnose.mjs` 作为 V3.13L 诊断脚本残留在工作树中，本轮已按要求删除。

## 3. 本轮实际修改

- 恢复 `scripts/sim-ai.mjs` 到 V3.13I-C12 行为。
- 删除 `scripts/physical-death-diagnose.mjs`。
- 没有修改 `src/core/data.js`。
- 没有修改 `src/core/combat.js`。

具体清理点：

- 移除 `physicalEffectiveHp`。
- 移除 `physicalTargetUid`。
- 移除 `makePhysicalAction`。
- `physicalAI` 恢复为使用 `makeAction(h)`，不返回自定义 `targetUid`。
- `styleAwareCombatAct` 恢复为仅 trueMartial 启用 profile-specific AI：`if (isTM && profile !== "balanced")`。

## 4. 保留的 M 机制

- `readyStance` 增加 `draw 1`。
- `battleCry` 增加 `draw 1`。
- regular-only physical 武道回响仍存在。
- 武道回响仍为 regular only、physical dominant only、floor >= 10 only。
- 武道回响数值仍为 floor 10-12：2 战意 + 2 格挡；floor >= 13：2 战意 + 3 格挡。
- 武道回响仍写入可见 `combat.log`：`武道回响稳住攻势`。

## 5. 验值结果

CODEX V313M-R1 value check PASSED

## 6. 基础测试结果

| Command | Exit code | Result | Notes |
| --- | ---: | --- | --- |
| `npm run validate:data` | 0 | PASS | Data validation passed. |
| `npm run smoke` | 0 | PASS | 142 passed, 0 failed. |
| `npm run player:flow` | 0 | PASS | 12 passed. |
| `npm run check` | 0 | PASS | All syntax OK. |
| `npm run build:release` | N/A | SKIPPED | Script writes `dist/`; skipped to avoid generating build artifacts in this cleanup-only round. |

## 7. 80x1 结果

Command:

`node scripts/balance-check.mjs --runs=80 --seeds=1 --seedBase=2026052700 --reportOut=_ai_review/BALANCE_GATE_REPORT.md --jsonOut=_ai_review/BALANCE_GATE_RESULTS.json`

Exit code: 1. This is a hard FAIL gate result, not a command crash. Report and JSON were generated.

| Mode | Style | winRate | avgFloor | timeout | status |
| --- | --- | ---: | ---: | ---: | --- |
| normal | physical | 22.1% | 15.6 | 3 | PASS |
| normal | spell | 17.1% | 15.5 | 4 | PASS |
| normal | bleed | 32.5% | 15.8 | 3 | FAIL |
| normal | shell | 19.7% | 14.9 | 4 | PASS |
| normal | poison | 22.4% | 15.4 | 4 | PASS |
| normal | control | 27.1% | 14.2 | 21 | PASS |
| regular | physical | 10.3% | 14.5 | 2 | WARN |
| regular | spell | 6.4% | 14.6 | 2 | PASS |
| regular | bleed | 3.8% | 13.8 | 1 | FAIL |
| regular | shell | 10.3% | 14.9 | 2 | WARN |
| regular | poison | 11.7% | 14.6 | 3 | WARN |
| regular | control | 13.1% | 14.2 | 19 | FAIL |
| trueMartial | physical | 0.0% | 12.8 | 0 | PASS |
| trueMartial | spell | 0.0% | 14.2 | 1 | PASS |
| trueMartial | bleed | 0.0% | 11.6 | 0 | PASS |
| trueMartial | shell | 0.0% | 13.2 | 1 | PASS |
| trueMartial | poison | 0.0% | 10.3 | 0 | PASS |
| trueMartial | control | 0.0% | 11.4 | 6 | PASS |

## 8. 40x2 结果

Command:

`node scripts/balance-check.mjs --runs=40 --seeds=2 --seedBase=2026052700 --reportOut=_ai_review/BALANCE_GATE_REPORT_40x2.md --jsonOut=_ai_review/BALANCE_GATE_RESULTS_40x2.json`

Exit code: 1. This is a hard FAIL gate result, not a command crash. Report and JSON were generated.

| Mode | Style | winRate | avgFloor | timeout | status |
| --- | --- | ---: | ---: | ---: | --- |
| normal | physical | 17.9% | 15.1 | 1 | PASS |
| normal | spell | 25.0% | 15.7 | 4 | PASS |
| normal | bleed | 23.7% | 15.5 | 2 | PASS |
| normal | shell | 13.9% | 14.7 | 4 | FAIL |
| normal | poison | 18.4% | 14.9 | 2 | PASS |
| normal | control | 31.3% | 14.8 | 8 | WARN |
| regular | physical | 5.0% | 15.0 | 0 | PASS |
| regular | spell | 5.4% | 14.0 | 3 | PASS |
| regular | bleed | 12.5% | 14.3 | 0 | FAIL |
| regular | shell | 7.7% | 14.4 | 1 | PASS |
| regular | poison | 13.5% | 14.6 | 3 | FAIL |
| regular | control | 6.9% | 13.7 | 11 | PASS |
| trueMartial | physical | 0.0% | 13.0 | 0 | PASS |
| trueMartial | spell | 0.0% | 13.8 | 1 | PASS |
| trueMartial | bleed | 0.0% | 11.4 | 0 | PASS |
| trueMartial | shell | 0.0% | 12.9 | 0 | PASS |
| trueMartial | poison | 0.0% | 10.2 | 0 | PASS |
| trueMartial | control | 0.0% | 10.7 | 3 | PASS |

## 9. 未修改项

- 没有发布。
- 没有 git push。
- 没有改任何卡牌数值。
- 没有改 difficultyTuning。
- 没有改 `combat.js` 的武道回响数值。
- 没有新增卡牌。
- 没有改敌人。
- 没有改奖励池。
- 没有改遗物。
- 没有改血祭悟道。
- 没有改真武阵势。
- 没有改真武专属牌。
- 没有改法术牌。
- 没有改流血牌。
- 没有改控制牌。
- 没有改中毒牌。
- 没有改龟壳牌。
- 没有改 `balance-check` / `tm-diagnose`。

## 10. 结论

纯 V3.13M 机制已完成残留清理，可以作为“纯 M 机制结果”继续评估。

从结果看，trueMartial 全部保持 0.0% 且未被打穿；regular physical 在 40x2 达到 PASS，在 80x1 为 WARN 10.3%，相比此前 0% 问题已有明显改善。

但当前三难度 balance gate 仍未整体通过：

- 80x1：normal bleed FAIL；regular bleed FAIL；regular control FAIL。
- 40x2：normal shell FAIL；regular bleed FAIL；regular poison FAIL。

因此，纯 V3.13M 可以作为下一轮机制基线候选，但整体 balance 尚需后续专门修复。
