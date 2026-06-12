# True Martial Diagnosis

**Source of truth**: `scripts/sim-ai.mjs --mode=trueMartial --strategy=styleAware --runs=80 --seeds=1 --seedBase=2026052700`

> This report does **not** maintain a second combat AI.
> Complex metrics (ascension relic acquisition, blood sacrifice mortality, formation exposure) are **not** available from sim-ai output and are omitted to avoid misleading tuning decisions.
> If those metrics are needed, extend sim-ai JSON output rather than duplicating AI logic.

## Summary

| Style | WinRate | AvgFloor | Early(1-6) | Mid(7-12) | Late(13-18) | AvgDeck | AvgRelics | AvgEnergy |
|-------|---------|----------|------------|-----------|-------------|---------|-----------|----------|
| physical | 0.0% | 12.9 | 0 | 37 | 42 | 20 | 4.5 | 3.3 |
| spell | 0.0% | 14.2 | 0 | 27 | 52 | 20 | 4.5 | 3.3 |
| bleed | 0.0% | 11.3 | 7 | 46 | 26 | 19 | 4.1 | 3.2 |
| shell | 0.0% | 11.9 | 9 | 35 | 34 | 17 | 3.9 | 3.2 |
| poison | 0.0% | 9.6 | 16 | 54 | 10 | 16 | 3.5 | 3.2 |
| control | 1.4% | 11.6 | 5 | 45 | 22 | 17 | 3.7 | 3.2 |

## Timeout Notes

```
⚠  timeouts detected (excluded from win-rate denominator)
   物理: 1 timeouts (seed=2031157855 floor=16)
   法术: 1 timeouts (seed=2027174471 floor=16)
   流血: 1 timeouts (seed=2029038810 floor=8)
   龟壳: 2 timeouts (seed=2028582624 floor=10, seed=2031645717 floor=16)
   控制: 7 timeouts (seed=2026463579 floor=8, seed=2026927684 floor=9, seed=2027020505 floor=9)
```

## Recommendations

- **Win rate near 0%**: trueMartial is currently impossible for the AI. For real players, even reaching floor 15 would be significant. Consider targeted enemy/fomation reductions.
