# Balance Gate Report

**Config**: runs=80, seeds=1, seedBase=2026052700

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
| 物理 | 13.0% | 15.0 | 3 | 77 | 15%-30% | FAIL |
| 法术 | 29.3% | 15.6 | 5 | 75 | 15%-30% | PASS |
| 流血 | 28.2% | 15.4 | 2 | 78 | 15%-30% | PASS |
| 龟壳 | 7.7% | 14.6 | 2 | 78 | 15%-30% | FAIL |
| 中毒 | 15.2% | 15.2 | 1 | 79 | 15%-30% | PASS |
| 控制 | 27.0% | 14.4 | 17 | 63 | 15%-30% | PASS |

### 常规 / regular

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 0.0% | 13.3 | 2 | 78 | 5%-10% | FAIL |
| 法术 | 8.1% | 14.3 | 6 | 74 | 5%-10% | PASS |
| 流血 | 5.0% | 13.6 | 0 | 80 | 5%-10% | PASS |
| 龟壳 | 3.8% | 14.1 | 2 | 78 | 5%-10% | FAIL |
| 中毒 | 12.0% | 13.8 | 5 | 75 | 5%-10% | WARN |
| 控制 | 2.8% | 13.7 | 9 | 71 | 5%-10% | FAIL |

### 真武 / trueMartial

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 0.0% | 12.4 | 1 | 79 | 0%-2% | PASS |
| 法术 | 0.0% | 14.0 | 1 | 79 | 0%-2% | PASS |
| 流血 | 0.0% | 12.0 | 0 | 80 | 0%-2% | PASS |
| 龟壳 | 0.0% | 12.9 | 1 | 79 | 0%-2% | PASS |
| 中毒 | 0.0% | 10.2 | 0 | 80 | 0%-2% | PASS |
| 控制 | 0.0% | 11.5 | 7 | 73 | 0%-2% | PASS |

## 4. Hard FAIL Details

- **入门 / 物理**: 13.0% (target 15%-30%) — 偏低
- **入门 / 龟壳**: 7.7% (target 15%-30%) — 偏低
- **常规 / 物理**: 0.0% (target 5%-10%) — 偏低
- **常规 / 龟壳**: 3.8% (target 5%-10%) — 偏低
- **常规 / 控制**: 2.8% (target 5%-10%) — 偏低

## 5. Timeout Notes

- 入门 / 物理: 3 timeouts
- 入门 / 法术: 5 timeouts
- 入门 / 流血: 2 timeouts
- 入门 / 龟壳: 2 timeouts
- 入门 / 中毒: 1 timeouts
- 入门 / 控制: 17 timeouts
- 常规 / 物理: 2 timeouts
- 常规 / 法术: 6 timeouts
- 常规 / 龟壳: 2 timeouts
- 常规 / 中毒: 5 timeouts
- 常规 / 控制: 9 timeouts
- 真武 / 物理: 1 timeouts
- 真武 / 法术: 1 timeouts
- 真武 / 龟壳: 1 timeouts
- 真武 / 控制: 7 timeouts

## 6. Recommendation

Majority of FAILs are due to low win rate. Consider targeted enemy/base-card buffs for affected styles.
Do not rush to adjust: confirm results with larger sample before committing changes.
