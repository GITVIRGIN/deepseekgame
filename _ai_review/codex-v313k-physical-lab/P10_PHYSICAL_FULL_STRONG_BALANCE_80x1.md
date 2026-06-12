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
| 物理 | 9.6% | 15.0 | 7 | 73 | 15%-30% | FAIL |
| 法术 | 22.7% | 15.7 | 5 | 75 | 15%-30% | PASS |
| 流血 | 19.0% | 15.2 | 1 | 79 | 15%-30% | PASS |
| 龟壳 | 15.4% | 14.9 | 2 | 78 | 15%-30% | PASS |
| 中毒 | 26.3% | 15.5 | 0 | 80 | 15%-30% | PASS |
| 控制 | 13.1% | 14.1 | 19 | 61 | 15%-30% | FAIL |

### 常规 / regular

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 1.3% | 13.5 | 0 | 80 | 5%-10% | FAIL |
| 法术 | 5.2% | 14.3 | 3 | 77 | 5%-10% | PASS |
| 流血 | 3.8% | 13.8 | 2 | 78 | 5%-10% | FAIL |
| 龟壳 | 9.6% | 13.8 | 7 | 73 | 5%-10% | PASS |
| 中毒 | 8.9% | 14.5 | 1 | 79 | 5%-10% | PASS |
| 控制 | 6.6% | 12.9 | 19 | 61 | 5%-10% | PASS |

### 真武 / trueMartial

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 0.0% | 13.2 | 2 | 78 | 0%-2% | PASS |
| 法术 | 0.0% | 13.8 | 1 | 79 | 0%-2% | PASS |
| 流血 | 0.0% | 11.9 | 1 | 79 | 0%-2% | PASS |
| 龟壳 | 0.0% | 13.1 | 1 | 79 | 0%-2% | PASS |
| 中毒 | 0.0% | 10.3 | 0 | 80 | 0%-2% | PASS |
| 控制 | 0.0% | 11.3 | 6 | 74 | 0%-2% | PASS |

## 4. Hard FAIL Details

- **入门 / 物理**: 9.6% (target 15%-30%) — 偏低
- **入门 / 控制**: 13.1% (target 15%-30%) — 偏低
- **常规 / 物理**: 1.3% (target 5%-10%) — 偏低
- **常规 / 流血**: 3.8% (target 5%-10%) — 偏低

## 5. Timeout Notes

- 入门 / 物理: 7 timeouts
- 入门 / 法术: 5 timeouts
- 入门 / 流血: 1 timeouts
- 入门 / 龟壳: 2 timeouts
- 入门 / 控制: 19 timeouts
- 常规 / 法术: 3 timeouts
- 常规 / 流血: 2 timeouts
- 常规 / 龟壳: 7 timeouts
- 常规 / 中毒: 1 timeouts
- 常规 / 控制: 19 timeouts
- 真武 / 物理: 2 timeouts
- 真武 / 法术: 1 timeouts
- 真武 / 流血: 1 timeouts
- 真武 / 龟壳: 1 timeouts
- 真武 / 控制: 6 timeouts

## 6. Recommendation

Majority of FAILs are due to low win rate. Consider targeted enemy/base-card buffs for affected styles.
Do not rush to adjust: confirm results with larger sample before committing changes.
