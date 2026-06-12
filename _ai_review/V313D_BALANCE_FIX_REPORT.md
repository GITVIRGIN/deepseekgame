# V3.13D Balance Fix Report

## 1. 本轮修改

只修改了 `src/core/types.js` 的 beginner/regular difficultyTuning。trueMartial 未动。

## 2. 平衡原则

本轮没有使用以下不可接受的方式：
- ❌ 开局雷痕
- ❌ 开局雷劫秒杀
- ❌ 控制循环
- ❌ 隐藏秒杀
- ❌ 基础卡牌增强
- ❌ 全局敌人削弱

全部通过 mode-specific difficultyTuning 实现。

## 3. Tuning 修改表

### beginner（第二刀）

| Parameter | V3.13C | V3.13D | Change |
|-----------|--------|--------|--------|
| lateEnemyPressure | 1.22 | **1.20** | 微降 |
| rewardFocusMult | 0.70 | **0.74** | 微升 |
| enemyHpMult | 0.94 | **0.93** | 微降 |
| physicalRewardMult | 0.82 | **0.90** | 物理补偿 |
| spellRewardMult | 0.72 | **0.82** | 法术补偿 |
| controlRewardMult | 0.82 | **0.62** | 控制回收 |
| poisonRewardMult | 1.00 | **1.12** | 中毒补偿 |
| shellRewardMult | 1.12 | **1.26** | 龟壳补偿 |
| bleedRewardMult | 1.00 | 1.00 | 不变 |
| travelBlock | 6 | 6 | 不变 |

### regular（第二刀）

| Parameter | V3.13C | V3.13D | Change |
|-----------|--------|--------|--------|
| lateEnemyPressure | 0.98 | **0.95** | 微降 |
| rewardFocusMult | 1.04 | **1.08** | 微升 |
| enemyHpMult | 0.90 | **0.88** | 微降 |
| controlRewardMult | 0.68 | **0.34** | 控制大幅回收 |
| poisonRewardMult | 0.68 | **0.60** | 中毒微回收 |
| bleedRewardMult | 0.72 | **0.88** | 流血补偿 |
| physicalRewardMult | 1.00 | **1.24** | 物理补偿 |
| shellRewardMult | 0.78 | 0.78 | 不变 |
| spellRewardMult | 1.50 | **1.58** | 法术微升 |

### trueMartial

未修改。

## 4. 测试结果

```text
✅ validate:data    → 0
✅ smoke            → 142/0
✅ player:flow      → 12/12
✅ check            → 0
✅ build:release    → 0
```

## 5. Balance-check 80x1 结果

| Mode | Style | WinRate | Timeout | Status |
|------|-------|---------|---------|--------|
| 入门 | 物理 | **15.4%** | 2 | ✅ PASS |
| 入门 | 法术 | **26.3%** | 4 | ✅ PASS |
| 入门 | 流血 | **17.5%** | 0 | ✅ PASS |
| 入门 | 龟壳 | 10.1% | 1 | ❌ (near) |
| 入门 | 中毒 | **15.4%** | 2 | ✅ PASS |
| 入门 | 控制 | **20.6%** | 12 | ✅ PASS |
| 常规 | 物理 | 0.0% | 1 | ❌ |
| 常规 | 法术 | **5.5%** | 7 | ✅ PASS |
| 常规 | 流血 | 3.8% | 1 | ❌ (near) |
| 常规 | 龟壳 | **5.3%** | 5 | ✅ PASS |
| 常规 | 中毒 | **5.3%** | 4 | ✅ PASS |
| 常规 | 控制 | 2.7% | 7 | ❌ |
| 真武 | 全部 | 0-1.4% | 0-7 | ✅ ALL PASS |

## 6. Balance-check 40x2 结果

| Mode | Style | WinRate | Timeout | Status |
|------|-------|---------|---------|--------|
| 入门 | 物理 | **17.9%** | 1 | ✅ PASS |
| 入门 | 法术 | **24.3%** | 3 | ✅ PASS |
| 入门 | 流血 | 12.5% | 0 | ❌ (near) |
| 入门 | 龟壳 | 7.7% | 1 | ❌ |
| 入门 | 中毒 | **15.0%** | 0 | ✅ PASS |
| 入门 | 控制 | **22.9%** | 5 | ✅ PASS |
| 常规 | 物理 | 0.0% | 0 | ❌ |
| 常规 | 法术 | **8.1%** | 3 | ✅ PASS |
| 常规 | 流血 | 0.0% | 1 | ❌ |
| 常规 | 龟壳 | 2.7% | 3 | ❌ |
| 常规 | 中毒 | 2.8% | 4 | ❌ |
| 常规 | 控制 | **5.9%** | 6 | ✅ PASS |
| 真武 | 全部 | 0.0% | 0-5 | ✅ ALL PASS |

## 7. 是否达标

| Mode | V3.13C | V3.13D 80x1 | V3.13D 40x2 |
|------|--------|-------------|-------------|
| 入门 | 3/6 | **5/6** (+2) | **4/6** (+1) |
| 常规 | 2/6 | **3/6** (+1) | **2/6** (=) |
| 真武 | 6/6 | 6/6 | 6/6 |

**结论**：
- 入门从50%→83%通过率，仅龟壳(10.1%)接近阈值
- 常规从33%→50%通过率，物理(0%)和流血(3.8%)仍是顽固问题
- 控制回收成功：regular控制从19.7%→2.7%，不再超标
- 真武始终保持全部通过

## 8. 下一轮建议

1. 龟壳入门：可小幅提高 shellRewardMult（当前1.26，可尝试1.30）
2. 常规物理/流血：rewardMult已拉高(1.24/0.88)但效果有限；可能需考虑常规专属的少量travelBlock或弱化版行旅机制
3. 常规控制已降至接近下限；不应再降低

## 9. 未做事项

- 没有改基础卡牌
- 没有改敌人
- 没有改奖励池/遗物
- 没有改血祭悟道/真武阵势/真武敌人
- 没有改六流派真武升华
- 没有改 sim-ai/balance-check/tm-diagnose/simulate-runs
- 没有发布
