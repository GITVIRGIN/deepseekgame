# Balance Mode Mapping

## normal → 入门 (Beginner)

| Field | Value |
|-------|-------|
| sim-ai mode | `normal` |
| Project label | 入门 |
| difficulty | `"beginner"` (default) |
| trueMartial | `false` |
| goal floors | 18 (黑山) |
| rollsMax | ROLL_MAX_BEGINNER |
| How sim-ai creates | `runBatch(profiles, false, STRATEGY)` — difficulty=null → default beginner |

## regular → 常规

| Field | Value |
|-------|-------|
| sim-ai mode | `regular` |
| Project label | 常规 |
| difficulty | `"regular"` (DIFFICULTY_REGULAR) |
| trueMartial | `false` |
| goal floors | 18 (黑山) |
| rollsMax | ROLL_MAX_REGULAR |
| How sim-ai creates | `runBatch(profiles, false, STRATEGY, DIFFICULTY_REGULAR)` |

## trueMartial → 真武

| Field | Value |
|-------|-------|
| sim-ai mode | `trueMartial` |
| Project label | 真武 |
| difficulty | `"trueMartial"` |
| trueMartial | `true` |
| goal floors | 25 (虚渊主宰) |
| rollsMax | ROLL_MAX_TRUE_MARTIAL (5) |
| How sim-ai creates | `runBatch(profiles, true, STRATEGY)` → `startTrueMartialRun` |

## balance-check call flow

```
balance-check.mjs
  → spawnSync("node", ["scripts/sim-ai.mjs", "--mode=normal", ...])
  → spawnSync("node", ["scripts/sim-ai.mjs", "--mode=regular", ...])
  → spawnSync("node", ["scripts/sim-ai.mjs", "--mode=trueMartial", ...])
```
