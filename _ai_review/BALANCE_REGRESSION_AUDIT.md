# V3.13B Balance Regression Audit

## 1. Executive Summary

**结论 A：数据可信，入门/常规确实低于目标下线。**

- balance-check 80x1、40x2 和 direct sim-ai 30x1 三组数据一致确认：normal/入门全流派低于15%下限，regular/常规全流派0%。
- 不是单seed波动，不是解析错误，不是命令崩溃。
- 存在1个解析器显示bug（timeout列始终为0），但不影响winRate计算（sim-ai内部已正确处理）。
- trueMartial真武仍在0-2%目标内。

**建议**：进入V3.13C，使用基础模式专属tuning修复入门/常规胜率。真武保持不动。

---

## 2. Test Command Summary

| # | Command | Exit | Status |
|---|---------|------|--------|
| 01 | npm run validate:data | 0 | ✅ |
| 02 | npm run smoke | 0 | ✅ |
| 03 | npm run player:flow | 0 | ✅ |
| 04 | npm run check | 0 | ✅ |
| 05 | balance-check 80x1 | 1 | ⚠ hard FAIL (预期) |
| 06 | balance-check 40x2 | 1 | ⚠ hard FAIL (预期) |
| 07 | sim-ai normal 30x1 | 0 | ✅ direct sim |
| 08 | sim-ai regular 30x1 | 0 | ✅ direct sim |
| 09 | sim-ai trueMartial 30x1 | 0 | ✅ direct sim |

---

## 3. Balance Result Comparison

### 3.1 Normal / 入门

| Style | 80x1 | 40x2 | Direct 30x1 | Target |
|-------|------|------|-------------|--------|
| 物理 | 7.6% | 10.0% | 13.8% | 15-30% |
| 法术 | 7.5% | 5.0% | 6.7% | 15-30% |
| 流血 | 13.9% | 10.3% | 20.0% | 15-30% |
| 龟壳 | 2.5% | 5.0% | 3.3% | 15-30% |
| 中毒 | 5.1% | 5.3% | 3.4% | 15-30% |
| 控制 | 4.7% | 3.2% | 0.0% | 15-30% |

**结论**：全流派低于15%下限。流血接近达标（13.9%/20.0%），龟壳最差（2.5%）。

### 3.2 Regular / 常规

| Style | 80x1 | 40x2 | Direct 30x1 | Target |
|-------|------|------|-------------|--------|
| 全部6流派 | 0.0% | 0.0% | 0.0% | 5-10% |

**结论**：常规全灭，完全低于目标。

### 3.3 TrueMartial / 真武

| Style | 80x1 | 40x2 | Direct 30x1 | Target |
|-------|------|------|-------------|--------|
| 全部6流派 | 0.0%(物理/法术/流血/龟壳/中毒) 1.4%(控制) | 0.0% | 0.0% | 0-2% |

**结论**：真武通过。控制1.4%在目标内。

---

## 4. Mode Mapping Verification

✅ **映射正确。**

- sim-ai mode="normal" → `runBatch(profiles, false, STRATEGY)` → `difficulty=null` → 默认 `beginner`（入门）
- sim-ai mode="regular" → `runBatch(profiles, false, STRATEGY, DIFFICULTY_REGULAR)` → 常规难度
- sim-ai mode="trueMartial" → `runBatch(profiles, true, STRATEGY)` → 真武模式
- balance-check 调用 `runSim(mode)` → `spawnSync("node", ["scripts/sim-ai.mjs", "--mode=${mode}", ...])`
- 三模式各自正确创建 run，difficulty/trueMartial/goal/rollsMax 均正确设置

---

## 5. Sim Strategy Verification

✅ **口径一致。**

- balance-check 使用 `--strategy=styleAware`
- sim-ai 也使用 `--strategy=styleAware`
- 直接运行 sim-ai 得到的结果与 balance-check 解析的 winRate 完全一致

---

## 6. Parser Verification

### 6.1 winRate ✅ 可靠

- 从 sim-ai 表格行 `物理  13.8%  12.8  18  4.3  3.6` 中解析 `parts[1]`（`13.8%`）
- 正确去掉 `%` 后 parseFloat

### 6.2 avgFloor ✅ 可靠

- 从 `parts[2]`（`12.8`）解析
- 与 sim-ai 直接输出一致

### 6.3 timeout ⚠ 存在显示bug（不影响winRate计算）

**根因**：sim-ai timeout 行使用中文流派名：
```
   控制: 5 timeouts (seed=...)
```
但 balance-check parser 用英文 key 查找：
```js
timeoutMap[m[1]]  // m[1] = "控制"
timeoutMap[style] // style = "control" → 永远 undefined → 默认 0
```

**影响**：报告中的 timeout 列始终为 0（实际存在 timeout）。但 **winRate 不受影响**——sim-ai 内部已正确处理 timeout 排除。

### 6.4 effectiveRuns ⚠ 因 timeout=0 而轻微高估

- `effectiveRuns = RUNS - 0 = 80`（实际应减去timeout数）
- 但因为 timeout 不影响 winRate 计算（sim-ai已排除），对status判定无实际影响

---

## 7. TrueMartial Isolation Impact

### 可证明 ✅
- 6个真武起始遗物均有 `trueMartialOnly: true`
- `rollRelicReward` 过滤 trueMartialOnly
- effects.js 所有6个遗物判断使用 `hasTrueMartialRelic(run, id)` → 仅TM模式生效
- 普通模式下即使旧档错误持有，效果不触发

### 无法证明 ⚠
- "此前入门/常规较高胜率是否因真武遗物泄漏" — 当前代码样本无法证明/证伪历史
- 但V3.12.1隔离修复后，不可能再因真武遗物泄漏导致入门/常规偏高

---

## 8. Root Cause Assessment

**结论 A：数据真实，基础模式确实回退。**

理由：
1. 三组独立模拟（80x1, 40x2, 30x1）交叉验证一致
2. 解析器 winRate 字段可靠
3. 直接 sim-ai 输出与 balance-check 解析完全一致
4. 不存在命令崩溃、假数据或口径不匹配

低胜率根本原因待后续调查（可能是某次全局改动意外影响入门/常规，但本轮不进行根本原因代码级追溯）。

---

## 9. Recommended Next Step

**进入 V3.13C：入门/常规基础模式专属修复。**

修复原则：
- 只使用 `difficultyTuning` 中的 `beginner` / `regular` 专属参数
- **不改基础卡牌**
- **不改全局敌人**
- **保持 trueMartial 真武不动**
- 不改 `trueMartial` 专属 difficultyTuning 参数

具体目标：
- 入门：拉回 15-30%
- 常规：拉回 5-10%

---

## 10. No-Code-Change Confirmation

本轮没有修改以下任何文件：
- src/ ❌ 未改
- scripts/ ❌ 未改（仅阅读分析）
- package.json ❌ 未改
- 未调任何游戏数值
- 未改 difficultyTuning
