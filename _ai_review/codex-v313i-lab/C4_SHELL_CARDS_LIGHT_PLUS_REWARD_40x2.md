# Balance Gate Report

**Config**: runs=40, seeds=2, seedBase=2026052700

## 1. Gate Summary

- **Gate result**: ❌ FAIL
- Hard FAIL present: yes
- WARN present: yes
- Recommend: review failing styles before releasing.

## 2. Target Policy

| Mode | Target | WARN Max |
|------|--------|----------|
| 入门 / normal | 15%-30% | 32% |
| 常规 / regular | 5%-10% | 12% |
| 真武 / trueMartial | 0%-2% | 2% |

## 3. Results by Mode

### 入门 / normal

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 16.2% | 14.7 | 3 | 37 | 15%-30% | PASS |
| 法术 | 22.9% | 15.8 | 5 | 35 | 15%-30% | PASS |
| 流血 | 23.7% | 15.3 | 2 | 38 | 15%-30% | PASS |
| 龟壳 | 5.6% | 14.7 | 4 | 36 | 15%-30% | FAIL |
| 中毒 | 23.1% | 15.1 | 1 | 39 | 15%-30% | PASS |
| 控制 | 12.1% | 13.8 | 7 | 33 | 15%-30% | FAIL |

### 常规 / regular

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 0.0% | 13.5 | 1 | 39 | 5%-10% | FAIL |
| 法术 | 10.5% | 14.3 | 2 | 38 | 5%-10% | WARN |
| 流血 | 2.7% | 13.6 | 3 | 37 | 5%-10% | FAIL |
| 龟壳 | 10.5% | 13.7 | 2 | 38 | 5%-10% | WARN |
| 中毒 | 5.6% | 13.3 | 4 | 36 | 5%-10% | PASS |
| 控制 | 5.9% | 14.1 | 6 | 34 | 5%-10% | PASS |

### 真武 / trueMartial

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 0.0% | 13.0 | 1 | 39 | 0%-2% | PASS |
| 法术 | 0.0% | 13.4 | 2 | 38 | 0%-2% | PASS |
| 流血 | 0.0% | 11.8 | 1 | 39 | 0%-2% | PASS |
| 龟壳 | 0.0% | 12.3 | 0 | 40 | 0%-2% | PASS |
| 中毒 | 0.0% | 9.9 | 0 | 40 | 0%-2% | PASS |
| 控制 | 0.0% | 10.8 | 4 | 36 | 0%-2% | PASS |

## 4. Hard FAIL Details

- **入门 / 龟壳**: 5.6% (target 15%-30%) — 偏低
- **入门 / 控制**: 12.1% (target 15%-30%) — 偏低
- **常规 / 物理**: 0.0% (target 5%-10%) — 偏低
- **常规 / 流血**: 2.7% (target 5%-10%) — 偏低

## 5. Timeout Notes

- 入门 / 物理: 3 timeouts
- 入门 / 法术: 5 timeouts
- 入门 / 流血: 2 timeouts
- 入门 / 龟壳: 4 timeouts
- 入门 / 中毒: 1 timeouts
- 入门 / 控制: 7 timeouts
- 常规 / 物理: 1 timeouts
- 常规 / 法术: 2 timeouts
- 常规 / 流血: 3 timeouts
- 常规 / 龟壳: 2 timeouts
- 常规 / 中毒: 4 timeouts
- 常规 / 控制: 6 timeouts
- 真武 / 物理: 1 timeouts
- 真武 / 法术: 2 timeouts
- 真武 / 流血: 1 timeouts
- 真武 / 控制: 4 timeouts

## 6. Recommendation

Majority of FAILs are due to low win rate. Consider targeted enemy/base-card buffs for affected styles.
Do not rush to adjust: confirm results with larger sample before committing changes.
