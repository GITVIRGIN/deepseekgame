# V3.13C Balance Fix Report

## 1. 本轮修改

只修改了 2 个文件：
- `src/core/types.js` — beginner/regular difficultyTuning 参数
- `scripts/balance-check.mjs` — timeoutMap 中英文key修复

## 2. Tuning 修改表

### beginner

| Parameter | Before | After |
|-----------|--------|-------|
| travelBlock | 4 | **6** |
| lateEnemyPressure | 1.40 | **1.22** |
| rewardFocusMult | 0.44 | **0.70** |
| enemyHpMult | 1.0 | **0.94** |
| physicalRewardMult | 0.60 | **0.82** |
| spellRewardMult | 0.58 | **0.72** |
| controlRewardMult | 0.32 | **0.82** |
| poisonRewardMult | — | **1.00** |
| shellRewardMult | — | **1.12** |
| bleedRewardMult | — | **1.00** |

### regular

| Parameter | Before | After |
|-----------|--------|-------|
| lateEnemyPressure | 1.25 | **0.98** |
| rewardFocusMult | 0.68 | **1.04** |
| enemyHpMult | 1.14 | **0.90** |
| controlRewardMult | 0.10 | **0.68** |
| poisonRewardMult | 0.10 | **0.68** |
| bleedRewardMult | 0.42 | **0.72** |
| physicalRewardMult | 0.80 | **1.00** |
| shellRewardMult | 0.42 | **0.78** |
| spellRewardMult | 1.75 | **1.50** |

### trueMartial

未修改。

## 3. Timeout 解析修复

修复前：`timeoutMap[m[1]]` 使用中文流派名作为key，后续 `timeoutMap[style]` 用英文key → 永远0。
修复后：使用 `nameToKey[m[1]]` 转换为英文key → timeout 正确显示。

## 4. 测试结果

```text
✅ validate:data    → 0
✅ smoke            → 0 (142/0)
✅ player:flow      → 0 (12/12)
✅ check            → 0
✅ build:release    → 0
```

## 5. Balance-check 80x1 结果

| Mode | Style | WinRate | AvgFloor | Timeout | Status |
|------|-------|---------|----------|---------|--------|
| 入门 | 物理 | **15.6%** | 14.9 | 3 | ✅ PASS |
| 入门 | 法术 | 12.8% | 15.2 | 2 | ❌ FAIL |
| 入门 | 流血 | **16.9%** | 14.7 | 3 | ✅ PASS |
| 入门 | 龟壳 | 9.1% | 14.1 | 3 | ❌ FAIL |
| 入门 | 中毒 | 11.1% | 14.5 | 8 | ❌ FAIL |
| 入门 | 控制 | **25.5%** | 13.7 | 25 | ✅ PASS |
| 常规 | 物理 | 0.0% | 12.4 | 6 | ❌ FAIL |
| 常规 | 法术 | 4.1% | 13.8 | 7 | ❌ FAIL |
| 常规 | 流血 | 3.9% | 12.2 | 4 | ❌ FAIL |
| 常规 | 龟壳 | **5.3%** | 13.3 | 4 | ✅ PASS |
| 常规 | 中毒 | **6.7%** | 13.2 | 5 | ✅ PASS |
| 常规 | 控制 | 19.7% | 13.5 | 19 | ❌ FAIL |
| 真武 | 全部 | 0-1.4% | 9.6-14.2 | 0-7 | ✅ ALL PASS |

## 6. Balance-check 40x2 结果

| Mode | Style | WinRate | AvgFloor | Timeout | Status |
|------|-------|---------|----------|---------|--------|
| 入门 | 物理 | 10.8% | 14.7 | 3 | ❌ |
| 入门 | 法术 | **18.9%** | 15.7 | 3 | ✅ |
| 入门 | 流血 | **18.4%** | 15.0 | 2 | ✅ |
| 入门 | 龟壳 | 13.2% | 14.4 | 2 | ❌ |
| 入门 | 中毒 | 13.2% | 14.7 | 2 | ❌ |
| 入门 | 控制 | 34.4% | 14.6 | 8 | ❌ (超上限) |
| 常规 | 物理 | 2.6% | 12.8 | 1 | ❌ |
| 常规 | 法术 | **5.3%** | 14.7 | 2 | ✅ |
| 常规 | 流血 | 2.6% | 12.3 | 1 | ❌ |
| 常规 | 龟壳 | **5.6%** | 13.1 | 4 | ✅ |
| 常规 | 中毒 | 10.8% | 12.7 | 3 | ⚠️ WARN |
| 常规 | 控制 | 21.2% | 13.9 | 7 | ❌ (超上限) |
| 真武 | 全部 | 0.0% | 9.2-13.8 | 0-5 | ✅ ALL PASS |

## 7. 是否达标

| Mode | V3.13B | V3.13C | Status |
|------|--------|--------|--------|
| 入门 | 0/6 PASS (2.5-13.9%) | **3/6 PASS** (9.1-25.5%) | 部分改善，3流派近阈值 |
| 常规 | 0/6 PASS (all 0%) | **2/6 PASS** (0-19.7%) | 重大改善，2流派接近 |
| 真武 | 6/6 PASS | 6/6 PASS | 保持 ✅ |

**结论**：一轮一刀后，入门从0%→50%通过率，常规从0%→33%通过率，真武保持。控制流在入门/常规均超标（需后续关注）。

## 8. 未做事项

- 没有改基础卡牌
- 没有改敌人
- 没有改奖励池
- 没有改遗物
- 没有改血祭悟道
- 没有改真武阵势
- 没有改真武敌人
- 没有改六流派真武升华
- 没有改 sim-ai / tm-diagnose / simulate-runs
- 没有发布
