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
| 物理 | 22.1% | 15.6 | 3 | 77 | 15%-30% | PASS |
| 法术 | 17.1% | 15.5 | 4 | 76 | 15%-30% | PASS |
| 流血 | 32.5% | 15.8 | 3 | 77 | 15%-30% | FAIL |
| 龟壳 | 19.7% | 14.9 | 4 | 76 | 15%-30% | PASS |
| 中毒 | 22.4% | 15.4 | 4 | 76 | 15%-30% | PASS |
| 控制 | 27.1% | 14.2 | 21 | 59 | 15%-30% | PASS |

### 常规 / regular

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 10.3% | 14.5 | 2 | 78 | 5%-10% | WARN |
| 法术 | 6.4% | 14.6 | 2 | 78 | 5%-10% | PASS |
| 流血 | 3.8% | 13.8 | 1 | 79 | 5%-10% | FAIL |
| 龟壳 | 10.3% | 14.9 | 2 | 78 | 5%-10% | WARN |
| 中毒 | 11.7% | 14.6 | 3 | 77 | 5%-10% | WARN |
| 控制 | 13.1% | 14.2 | 19 | 61 | 5%-10% | FAIL |

### 真武 / trueMartial

| Style | WinRate | AvgFloor | Timeouts | EffRuns | Target | Status |
|-------|---------|----------|----------|---------|--------|--------|
| 物理 | 0.0% | 12.8 | 0 | 80 | 0%-2% | PASS |
| 法术 | 0.0% | 14.2 | 1 | 79 | 0%-2% | PASS |
| 流血 | 0.0% | 11.6 | 0 | 80 | 0%-2% | PASS |
| 龟壳 | 0.0% | 13.2 | 1 | 79 | 0%-2% | PASS |
| 中毒 | 0.0% | 10.3 | 0 | 80 | 0%-2% | PASS |
| 控制 | 0.0% | 11.4 | 6 | 74 | 0%-2% | PASS |

## 4. Hard FAIL Details

- **入门 / 流血**: 32.5% (target 15%-30%) — 偏高
- **常规 / 流血**: 3.8% (target 5%-10%) — 偏低
- **常规 / 控制**: 13.1% (target 5%-10%) — 偏高

## 5. Timeout Notes

- 入门 / 物理: 3 timeouts
- 入门 / 法术: 4 timeouts
- 入门 / 流血: 3 timeouts
- 入门 / 龟壳: 4 timeouts
- 入门 / 中毒: 4 timeouts
- 入门 / 控制: 21 timeouts
- 常规 / 物理: 2 timeouts
- 常规 / 法术: 2 timeouts
- 常规 / 流血: 1 timeouts
- 常规 / 龟壳: 2 timeouts
- 常规 / 中毒: 3 timeouts
- 常规 / 控制: 19 timeouts
- 真武 / 法术: 1 timeouts
- 真武 / 龟壳: 1 timeouts
- 真武 / 控制: 6 timeouts

## 6. Recommendation

FAILs distributed across modes. Review individual style performance before tuning.
Do not rush to adjust: confirm results with larger sample before committing changes.
