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
| 物理 | 14.5% | 14.8 | 4 | 76 | 15%-30% | FAIL |
| 法术 | 25.0% | 15.7 | 4 | 76 | 15%-30% | PASS |
| 流血 | 21.5% | 15.4 | 1 | 79 | 15%-30% | PASS |
| 龟壳 | 3.9% | 14.6 | 3 | 77 | 15%-30% | FAIL |
| 中毒 | 21.5% | 15.4 | 1 | 79 | 15%-30% | PASS |
| 控制 | 18.0% | 13.8 | 19 | 61 | 15%-30% | PASS |

### 常规 / regular

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 1.3% | 13.4 | 4 | 76 | 5%-10% | FAIL |
| 法术 | 4.1% | 14.3 | 7 | 73 | 5%-10% | FAIL |
| 流血 | 6.5% | 13.2 | 3 | 77 | 5%-10% | PASS |
| 龟壳 | 2.6% | 13.1 | 3 | 77 | 5%-10% | FAIL |
| 中毒 | 1.4% | 13.5 | 6 | 74 | 5%-10% | FAIL |
| 控制 | 6.9% | 13.9 | 8 | 72 | 5%-10% | PASS |

### 真武 / trueMartial

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 0.0% | 12.4 | 2 | 78 | 0%-2% | PASS |
| 法术 | 0.0% | 14.1 | 1 | 79 | 0%-2% | PASS |
| 流血 | 0.0% | 12.0 | 0 | 80 | 0%-2% | PASS |
| 龟壳 | 0.0% | 12.8 | 1 | 79 | 0%-2% | PASS |
| 中毒 | 0.0% | 10.0 | 0 | 80 | 0%-2% | PASS |
| 控制 | 0.0% | 11.6 | 6 | 74 | 0%-2% | PASS |

## 4. Hard FAIL Details

- **入门 / 物理**: 14.5% (target 15%-30%) — 偏低
- **入门 / 龟壳**: 3.9% (target 15%-30%) — 偏低
- **常规 / 物理**: 1.3% (target 5%-10%) — 偏低
- **常规 / 法术**: 4.1% (target 5%-10%) — 偏低
- **常规 / 龟壳**: 2.6% (target 5%-10%) — 偏低
- **常规 / 中毒**: 1.4% (target 5%-10%) — 偏低

## 5. Timeout Notes

- 入门 / 物理: 4 timeouts
- 入门 / 法术: 4 timeouts
- 入门 / 流血: 1 timeouts
- 入门 / 龟壳: 3 timeouts
- 入门 / 中毒: 1 timeouts
- 入门 / 控制: 19 timeouts
- 常规 / 物理: 4 timeouts
- 常规 / 法术: 7 timeouts
- 常规 / 流血: 3 timeouts
- 常规 / 龟壳: 3 timeouts
- 常规 / 中毒: 6 timeouts
- 常规 / 控制: 8 timeouts
- 真武 / 物理: 2 timeouts
- 真武 / 法术: 1 timeouts
- 真武 / 龟壳: 1 timeouts
- 真武 / 控制: 6 timeouts

## 6. Recommendation

Majority of FAILs are due to low win rate. Consider targeted enemy/base-card buffs for affected styles.
Do not rush to adjust: confirm results with larger sample before committing changes.
