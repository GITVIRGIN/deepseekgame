# CODEX V3.13K Final Report

## 1. Round Nature

This round is a regular physical structure candidate matrix. sim-ai and AI strategy were not modified.

## 2. AI Strategy Precheck

GPT had already simulated AI-only candidates. AI correction was not a safe solution, so this round tested physical structure changes only within data.js, types.js, and archetypes.js.

## 3. Candidate List

- P0_BASELINE: No additional changes; keep V3.13I-C12.
- P1_PHYSICAL_REWARD_MED: beginner.physicalRewardMult 0.90 -> 0.96; regular.physicalRewardMult 1.32 -> 1.55.
- P2_PHYSICAL_REWARD_BIG: beginner.physicalRewardMult 0.90 -> 1.00; regular.physicalRewardMult 1.32 -> 1.85.
- P3_PHYSICAL_ARCHETYPE_LIGHT: physical guarantee threshold 7 -> 6; light physical styleBaseRewardWeight curve.
- P4_PHYSICAL_CARDS_LIGHT: heavySlash 24; traceCutter 15; xingtian fallback 40; tiangang 40/22.
- P5_PHYSICAL_CARDS_MED: heavySlash 25; chainBlade 9+9; traceCutter 16; xingtian fallback 42; tiangang 42/24.
- P6_ARCHETYPE_PLUS_REWARD_MED: P1 + P3.
- P7_ARCHETYPE_PLUS_CARDS_LIGHT: P3 + P4.
- P8_REWARD_MED_PLUS_CARDS_LIGHT: P1 + P4.
- P9_PHYSICAL_FULL_SAFE: P1 + P3 + P4.
- P10_PHYSICAL_FULL_STRONG: P2 + P3 + P5.

## 4. Stage1 Physical Results

| Candidate | normal physical 80x1 | normal physical 40x2 | regular physical 80x1 | regular physical 40x2 | Stage2 | Elimination |
|---|---:|---:|---:|---:|---|---|
| P0_BASELINE | 13% / floor 15.2 / timeout 3 | 15.8% / floor 14.7 / timeout 2 | 0% / floor 13 / timeout 3 | 0% / floor 13.1 / timeout 2 | no | regular physical both < 3% |
| P1_PHYSICAL_REWARD_MED | 12.2% / floor 15 / timeout 6 | 16.2% / floor 14.4 / timeout 3 | 2.5% / floor 12.9 / timeout 1 | 0% / floor 12.6 / timeout 1 | no | regular physical both < 3% |
| P2_PHYSICAL_REWARD_BIG | 12.3% / floor 15.1 / timeout 7 | 15.8% / floor 14.8 / timeout 2 | 0% / floor 13.3 / timeout 0 | 0% / floor 12.6 / timeout 1 | no | regular physical both < 3% |
| P3_PHYSICAL_ARCHETYPE_LIGHT | 12.2% / floor 15.3 / timeout 6 | 7.9% / floor 14.9 / timeout 2 | 1.3% / floor 13 / timeout 1 | 0% / floor 12.4 / timeout 2 | no | regular physical both < 3% |
| P4_PHYSICAL_CARDS_LIGHT | 11.8% / floor 15.1 / timeout 4 | 10.8% / floor 14.7 / timeout 3 | 0% / floor 13.2 / timeout 3 | 0% / floor 13 / timeout 2 | no | regular physical both < 3%; normal physical both < 12% |
| P5_PHYSICAL_CARDS_MED | 11.7% / floor 15.3 / timeout 3 | 10.5% / floor 14.9 / timeout 2 | 1.3% / floor 13.2 / timeout 2 | 0% / floor 12.6 / timeout 1 | no | regular physical both < 3%; normal physical both < 12% |
| P6_ARCHETYPE_PLUS_REWARD_MED | 10.5% / floor 15.3 / timeout 4 | 12.8% / floor 15.1 / timeout 1 | 0% / floor 13.2 / timeout 1 | 0% / floor 12.3 / timeout 1 | no | regular physical both < 3% |
| P7_ARCHETYPE_PLUS_CARDS_LIGHT | 8.1% / floor 15 / timeout 6 | 10.5% / floor 14.9 / timeout 2 | 0% / floor 13.3 / timeout 0 | 0% / floor 12.5 / timeout 2 | no | regular physical both < 3%; normal physical both < 12% |
| P8_REWARD_MED_PLUS_CARDS_LIGHT | 10.7% / floor 14.9 / timeout 5 | 16.2% / floor 14.6 / timeout 3 | 0% / floor 13.3 / timeout 0 | 0% / floor 12.7 / timeout 1 | no | regular physical both < 3% |
| P9_PHYSICAL_FULL_SAFE | 10.8% / floor 15.3 / timeout 6 | 10.5% / floor 14.9 / timeout 2 | 0% / floor 13.3 / timeout 2 | 0% / floor 12.5 / timeout 2 | no | regular physical both < 3%; normal physical both < 12% |
| P10_PHYSICAL_FULL_STRONG | 9.6% / floor 15 / timeout 7 | 13.5% / floor 14.9 / timeout 3 | 1.3% / floor 13.5 / timeout 0 | 5.1% / floor 13.3 / timeout 1 | yes | not eliminated |

## 5. Stage2 Full Balance Results

Stage2 candidates: P10_PHYSICAL_FULL_STRONG.

### P10_PHYSICAL_FULL_STRONG

Eliminated: yes - regular > 12%

#### 80x1

| mode | style | winRate | avgFloor | timeout | status |
|---|---|---:|---:|---:|---|
| normal | physical | 9.6% | 15 | 7 | FAIL |
| normal | spell | 22.7% | 15.7 | 5 | PASS |
| normal | bleed | 19% | 15.2 | 1 | PASS |
| normal | shell | 15.4% | 14.9 | 2 | PASS |
| normal | poison | 26.3% | 15.5 | 0 | PASS |
| normal | control | 13.1% | 14.1 | 19 | FAIL |
| regular | physical | 1.3% | 13.5 | 0 | FAIL |
| regular | spell | 5.2% | 14.3 | 3 | PASS |
| regular | bleed | 3.8% | 13.8 | 2 | FAIL |
| regular | shell | 9.6% | 13.8 | 7 | PASS |
| regular | poison | 8.9% | 14.5 | 1 | PASS |
| regular | control | 6.6% | 12.9 | 19 | PASS |
| trueMartial | physical | 0% | 13.2 | 2 | PASS |
| trueMartial | spell | 0% | 13.8 | 1 | PASS |
| trueMartial | bleed | 0% | 11.9 | 1 | PASS |
| trueMartial | shell | 0% | 13.1 | 1 | PASS |
| trueMartial | poison | 0% | 10.3 | 0 | PASS |
| trueMartial | control | 0% | 11.3 | 6 | PASS |

#### 40x2

| mode | style | winRate | avgFloor | timeout | status |
|---|---|---:|---:|---:|---|
| normal | physical | 13.5% | 14.9 | 3 | FAIL |
| normal | spell | 22.9% | 15.7 | 5 | PASS |
| normal | bleed | 17.9% | 15.4 | 1 | PASS |
| normal | shell | 17.9% | 14.6 | 1 | PASS |
| normal | poison | 20% | 15.3 | 0 | PASS |
| normal | control | 21.9% | 14.8 | 8 | PASS |
| regular | physical | 5.1% | 13.3 | 1 | PASS |
| regular | spell | 5.3% | 14.3 | 2 | PASS |
| regular | bleed | 2.6% | 13.2 | 1 | FAIL |
| regular | shell | 10.5% | 13.6 | 2 | WARN |
| regular | poison | 12.8% | 14.6 | 1 | FAIL |
| regular | control | 10% | 12.9 | 10 | PASS |
| trueMartial | physical | 0% | 13.1 | 1 | PASS |
| trueMartial | spell | 0% | 13.7 | 2 | PASS |
| trueMartial | bleed | 0% | 12.2 | 2 | PASS |
| trueMartial | shell | 0% | 12.5 | 1 | PASS |
| trueMartial | poison | 0% | 10.3 | 0 | PASS |
| trueMartial | control | 0% | 10.9 | 3 | PASS |

## 6. Final Selection

Selected: P0_BASELINE. Reason: no safe Stage2 candidate; restored baseline.

## 7. Final Applied Changes

No new V3.13K physical structure change was applied. After candidate testing, the tree was restored to P0_BASELINE, the current V3.13I-C12 baseline.

## 8. Final Value Check

CODEX V313K final value check PASSED

## 9. Final Test Results

| command | exit code | note |
|---|---:|---|
| npm run validate:data | 0 |  |
| npm run smoke | 0 |  |
| npm run player:flow | 0 |  |
| npm run check | 0 |  |
| npm run build:release | skipped | Skipped because build:release writes dist/build artifacts outside the V3.13K allowed output scope. |

Final balance-check commands:

| command | exit code | note |
|---|---:|---|
| final balance 80x1 | 1 |  |
| final balance 40x2 | 1 |  |

## 10. Final 80x1 Results

| mode | style | winRate | avgFloor | timeout | status |
|---|---|---:|---:|---:|---|
| normal | physical | 13% | 15.2 | 3 | FAIL |
| normal | spell | 22.7% | 15.6 | 5 | PASS |
| normal | bleed | 26.9% | 15.7 | 2 | PASS |
| normal | shell | 18.4% | 14.7 | 4 | PASS |
| normal | poison | 20.3% | 15.5 | 1 | PASS |
| normal | control | 20.7% | 14 | 22 | PASS |
| regular | physical | 0% | 13 | 3 | FAIL |
| regular | spell | 6.5% | 14.3 | 3 | PASS |
| regular | bleed | 6.4% | 13.7 | 2 | PASS |
| regular | shell | 5.2% | 14.2 | 3 | PASS |
| regular | poison | 9% | 14.2 | 2 | PASS |
| regular | control | 9.5% | 13.6 | 17 | PASS |
| trueMartial | physical | 0% | 12.4 | 1 | PASS |
| trueMartial | spell | 0% | 13.9 | 1 | PASS |
| trueMartial | bleed | 0% | 11.9 | 0 | PASS |
| trueMartial | shell | 0% | 13.2 | 1 | PASS |
| trueMartial | poison | 0% | 10.2 | 0 | PASS |
| trueMartial | control | 0% | 11.4 | 7 | PASS |

## 11. Final 40x2 Results

| mode | style | winRate | avgFloor | timeout | status |
|---|---|---:|---:|---:|---|
| normal | physical | 15.8% | 14.7 | 2 | PASS |
| normal | spell | 28.6% | 15.8 | 5 | PASS |
| normal | bleed | 18.9% | 14.9 | 3 | PASS |
| normal | shell | 16.7% | 14.8 | 4 | PASS |
| normal | poison | 12.8% | 15 | 1 | FAIL |
| normal | control | 18.8% | 14.1 | 8 | PASS |
| regular | physical | 0% | 13.1 | 2 | FAIL |
| regular | spell | 5.4% | 13.9 | 3 | PASS |
| regular | bleed | 5.1% | 13.7 | 1 | PASS |
| regular | shell | 5% | 13.7 | 0 | PASS |
| regular | poison | 10.8% | 14.3 | 3 | WARN |
| regular | control | 9.7% | 13.3 | 9 | PASS |
| trueMartial | physical | 0% | 12.8 | 1 | PASS |
| trueMartial | spell | 0% | 13.6 | 2 | PASS |
| trueMartial | bleed | 0% | 12 | 1 | PASS |
| trueMartial | shell | 0% | 12.6 | 1 | PASS |
| trueMartial | poison | 0% | 10.3 | 0 | PASS |
| trueMartial | control | 0% | 10.9 | 4 | PASS |

## 12. Unmodified Items

- No publish
- No git push
- sim-ai unchanged
- Enemies unchanged
- Reward generation core unchanged; archetypes.js physical weights were only temporary candidate edits and have no final residue
- Relics unchanged
- Blood sacrifice unchanged
- True Martial formations unchanged
- True Martial exclusive cards unchanged
- Spell cards unchanged
- Bleed cards unchanged
- Control cards unchanged

## 13. Conclusion

regular physical was not safely fixed by this candidate set. P10 was the only candidate that entered Stage2, but it was strongly eliminated because full balance validation had a regular mode result above 12%. Under final baseline, normal physical is low in 80x1 and passes in 40x2; regular physical remains 0%; trueMartial remains within 0%-2% for every style. No V3.13K candidate should become the next baseline; the next round should use deeper physical-structure changes.
