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
| 物理 | 17.9% | 15.1 | 1 | 39 | 15%-30% | PASS |
| 法术 | 25.0% | 15.7 | 4 | 36 | 15%-30% | PASS |
| 流血 | 23.7% | 15.5 | 2 | 38 | 15%-30% | PASS |
| 龟壳 | 13.9% | 14.7 | 4 | 36 | 15%-30% | FAIL |
| 中毒 | 18.4% | 14.9 | 2 | 38 | 15%-30% | PASS |
| 控制 | 31.3% | 14.8 | 8 | 32 | 15%-30% | WARN |

### 常规 / regular

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 5.0% | 15.0 | 0 | 40 | 5%-10% | PASS |
| 法术 | 5.4% | 14.0 | 3 | 37 | 5%-10% | PASS |
| 流血 | 12.5% | 14.3 | 0 | 40 | 5%-10% | FAIL |
| 龟壳 | 7.7% | 14.4 | 1 | 39 | 5%-10% | PASS |
| 中毒 | 13.5% | 14.6 | 3 | 37 | 5%-10% | FAIL |
| 控制 | 6.9% | 13.7 | 11 | 29 | 5%-10% | PASS |

### 真武 / trueMartial

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 0.0% | 13.0 | 0 | 40 | 0%-2% | PASS |
| 法术 | 0.0% | 13.8 | 1 | 39 | 0%-2% | PASS |
| 流血 | 0.0% | 11.4 | 0 | 40 | 0%-2% | PASS |
| 龟壳 | 0.0% | 12.9 | 0 | 40 | 0%-2% | PASS |
| 中毒 | 0.0% | 10.2 | 0 | 40 | 0%-2% | PASS |
| 控制 | 0.0% | 10.7 | 3 | 37 | 0%-2% | PASS |

## 4. Hard FAIL Details

- **入门 / 龟壳**: 13.9% (target 15%-30%) — 偏低
- **常规 / 流血**: 12.5% (target 5%-10%) — 偏高
- **常规 / 中毒**: 13.5% (target 5%-10%) — 偏高

## 5. Timeout Notes

- 入门 / 物理: 1 timeouts
- 入门 / 法术: 4 timeouts
- 入门 / 流血: 2 timeouts
- 入门 / 龟壳: 4 timeouts
- 入门 / 中毒: 2 timeouts
- 入门 / 控制: 8 timeouts
- 常规 / 法术: 3 timeouts
- 常规 / 龟壳: 1 timeouts
- 常规 / 中毒: 3 timeouts
- 常规 / 控制: 11 timeouts
- 真武 / 法术: 1 timeouts
- 真武 / 控制: 3 timeouts

## 6. Recommendation

FAILs distributed across modes. Review individual style performance before tuning.
Do not rush to adjust: confirm results with larger sample before committing changes.
