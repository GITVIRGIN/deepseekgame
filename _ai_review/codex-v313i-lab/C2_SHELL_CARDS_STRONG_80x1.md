# Balance Gate Report

**Config**: runs=80, seeds=1, seedBase=2026052700

## 1. Gate Summary

- **Gate result**: ❌ FAIL
- Hard FAIL present: yes
- WARN present: no
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
| 物理 | 16.7% | 15.2 | 2 | 78 | 15%-30% | PASS |
| 法术 | 26.7% | 15.6 | 5 | 75 | 15%-30% | PASS |
| 流血 | 34.6% | 15.6 | 2 | 78 | 15%-30% | FAIL |
| 龟壳 | 10.4% | 14.7 | 3 | 77 | 15%-30% | FAIL |
| 中毒 | 22.8% | 15.5 | 1 | 79 | 15%-30% | PASS |
| 控制 | 21.5% | 14.3 | 15 | 65 | 15%-30% | PASS |

### 常规 / regular

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 3.8% | 13.2 | 1 | 79 | 5%-10% | FAIL |
| 法术 | 5.6% | 14.4 | 8 | 72 | 5%-10% | PASS |
| 流血 | 7.6% | 13.6 | 1 | 79 | 5%-10% | PASS |
| 龟壳 | 5.3% | 14.2 | 5 | 75 | 5%-10% | PASS |
| 中毒 | 6.7% | 13.9 | 5 | 75 | 5%-10% | PASS |
| 控制 | 5.6% | 13.7 | 9 | 71 | 5%-10% | PASS |

### 真武 / trueMartial

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 0.0% | 12.5 | 2 | 78 | 0%-2% | PASS |
| 法术 | 0.0% | 13.9 | 1 | 79 | 0%-2% | PASS |
| 流血 | 0.0% | 12.1 | 0 | 80 | 0%-2% | PASS |
| 龟壳 | 0.0% | 13.9 | 2 | 78 | 0%-2% | PASS |
| 中毒 | 0.0% | 10.0 | 0 | 80 | 0%-2% | PASS |
| 控制 | 0.0% | 11.6 | 7 | 73 | 0%-2% | PASS |

## 4. Hard FAIL Details

- **入门 / 流血**: 34.6% (target 15%-30%) — 偏高
- **入门 / 龟壳**: 10.4% (target 15%-30%) — 偏低
- **常规 / 物理**: 3.8% (target 5%-10%) — 偏低

## 5. Timeout Notes

- 入门 / 物理: 2 timeouts
- 入门 / 法术: 5 timeouts
- 入门 / 流血: 2 timeouts
- 入门 / 龟壳: 3 timeouts
- 入门 / 中毒: 1 timeouts
- 入门 / 控制: 15 timeouts
- 常规 / 物理: 1 timeouts
- 常规 / 法术: 8 timeouts
- 常规 / 流血: 1 timeouts
- 常规 / 龟壳: 5 timeouts
- 常规 / 中毒: 5 timeouts
- 常规 / 控制: 9 timeouts
- 真武 / 物理: 2 timeouts
- 真武 / 法术: 1 timeouts
- 真武 / 龟壳: 2 timeouts
- 真武 / 控制: 7 timeouts

## 6. Recommendation

Majority of FAILs are due to low win rate. Consider targeted enemy/base-card buffs for affected styles.
Do not rush to adjust: confirm results with larger sample before committing changes.
