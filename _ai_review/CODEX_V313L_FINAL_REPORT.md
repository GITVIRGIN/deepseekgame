# CODEX V3.13L Final Report

## 1. Round Nature

regular physical death diagnosis plus controlled fix candidates.

## 2. GPT Presimulation Conclusion

Pure AI changes were unsafe, pure rewardMult changes were unsafe, and pure small card-number buffs were unsafe. Prior analysis pointed to regular deaths around floors 13-16, multi-enemy pressure, weak battleIntent continuity, and low density of late physical finishers.

## 3. Death Diagnosis Results

Source: CODEX_V313L_PHYSICAL_DEATH_SAMPLES.md / .json.

- runs: 80; wins: 0; losses: 77; timeouts: 3
- average death floor: 13.12
- death floor distribution: early=0, mid=29, late=48, floor13to16=43
- multi-enemy death rate: 76.6%
- battleIntent=0 death rate: 57.1%
- average physical cards: 7.92; physical damage cards: 6.88; AOE physical cards: 0.04; execute cards: 0.27
- average basic strike: 5.31; average basic guard: 4.14
- key ownership at death: readyStance=51.9%, battleCry=31.2%, heavySlash=42.9%, chainBlade=22.1%, traceCutter=22.1%, armyBreaker=14.3%, xingtianCleave=24.7%, tiangangBreak=3.9%
- most common death enemies: 铁尸(46), 小妖(35), 狐妖(35), 水鬼(34), 山魈(30), 判官(11), 魔尊(1), 鬼将(1)

## 4. Candidate List

- L0_BASELINE: No changes.
- L1_TARGETED_PHYSICAL_AI: sim-ai only: enable physicalAI for physical profile in normal/regular; count battleIntent in damage ordering; prefer readyStance/battleCry when battleIntent < 8 and physical damage is in hand.
- L2_TARGETED_PHYSICAL_AI_PLUS_TARGET: L1 plus physicalAI targetUid selection for execute and normal single-target damage.
- L3_PHYSICAL_FINISHER_ACCESS: types/archetypes only: beginner physicalRewardMult 0.90 -> 0.96, regular physicalRewardMult 1.32 -> 1.55, physical guarantee 7 -> 6, stronger physical base weights.
- L4_PHYSICAL_LATE_PACKAGE_LIGHT: data only: traceCutter 15, xingtian fallback 40, tiangangBreak 40/22.
- L5_PHYSICAL_LATE_PACKAGE_MED: data only: traceCutter 16, xingtian fallback 42, tiangangBreak 42/24 and rarity legendary -> epic.
- L6_AI_PLUS_FINISHER_ACCESS: L1 + L3.
- L7_AI_PLUS_LATE_PACKAGE_LIGHT: L1 + L4.
- L8_ACCESS_PLUS_LATE_PACKAGE_LIGHT: L3 + L4.
- L9_FULL_SAFE: L1 + L3 + L4.

## 5. Stage1 Physical Results

| Candidate | Normal 80x1 | Normal 40x2 | Regular 80x1 | Regular 40x2 | Stage2 | Elimination |
|---|---:|---:|---:|---:|---|---|
| L0_BASELINE | 13% / floor 15.16 / timeout 0 | 15.8% / floor 14.7 / timeout 0 | 0% / floor 13.03 / timeout 0 | 0% / floor 13.05 / timeout 0 | no | regular physical both < 3% |
| L1_TARGETED_PHYSICAL_AI | 14.5% / floor 15.16 / timeout 0 | 21.1% / floor 15.75 / timeout 0 | 4% / floor 12.97 / timeout 0 | 0% / floor 12.38 / timeout 0 | no | no |
| L2_TARGETED_PHYSICAL_AI_PLUS_TARGET | 21.8% / floor 15.35 / timeout 0 | 10.5% / floor 14.9 / timeout 0 | 1.3% / floor 12.66 / timeout 0 | 5% / floor 12.47 / timeout 0 | yes | no |
| L3_PHYSICAL_FINISHER_ACCESS | 10.5% / floor 15.16 / timeout 0 | 12.8% / floor 15.18 / timeout 0 | 1.3% / floor 13.18 / timeout 0 | 2.6% / floor 12.4 / timeout 0 | no | regular physical both < 3% |
| L4_PHYSICAL_LATE_PACKAGE_LIGHT | 13% / floor 15.16 / timeout 0 | 13.2% / floor 14.78 / timeout 0 | 0% / floor 13.1 / timeout 0 | 0% / floor 13.1 / timeout 0 | no | regular physical both < 3% |
| L5_PHYSICAL_LATE_PACKAGE_MED | 13% / floor 15.28 / timeout 0 | 15.8% / floor 14.88 / timeout 0 | 3.9% / floor 13.25 / timeout 0 | 2.6% / floor 13.07 / timeout 0 | no | no |
| L6_AI_PLUS_FINISHER_ACCESS | 12.8% / floor 15.19 / timeout 0 | 10.3% / floor 15.7 / timeout 0 | 0% / floor 13.44 / timeout 0 | 2.6% / floor 13.3 / timeout 0 | no | regular physical both < 3% |
| L7_AI_PLUS_LATE_PACKAGE_LIGHT | 15.8% / floor 15.22 / timeout 0 | 18.4% / floor 15.65 / timeout 0 | 4% / floor 12.96 / timeout 0 | 0% / floor 12.45 / timeout 0 | no | no |
| L8_ACCESS_PLUS_LATE_PACKAGE_LIGHT | 5.3% / floor 15.09 / timeout 0 | 15.4% / floor 15.28 / timeout 0 | 1.3% / floor 13.22 / timeout 0 | 2.6% / floor 12.43 / timeout 0 | no | regular physical both < 3% |
| L9_FULL_SAFE | 14.1% / floor 15.32 / timeout 0 | 12.8% / floor 15.85 / timeout 0 | 1.3% / floor 13.4 / timeout 0 | 0% / floor 13.2 / timeout 0 | no | regular physical both < 3% |

## 6. Stage2 Full-Style Results

Stage2 candidates: L2_TARGETED_PHYSICAL_AI_PLUS_TARGET

### L2_TARGETED_PHYSICAL_AI_PLUS_TARGET

Eliminated: no

#### 80x1

| mode | style | winRate | avgFloor | timeout | status |
|---|---|---:|---:|---:|---|
| normal | physical | 21.8% | 15.3 | 2 | PASS |
| normal | spell | 22.7% | 15.6 | 5 | PASS |
| normal | bleed | 26.9% | 15.7 | 2 | PASS |
| normal | shell | 18.4% | 14.7 | 4 | PASS |
| normal | poison | 20.3% | 15.5 | 1 | PASS |
| normal | control | 20.7% | 14 | 22 | PASS |
| regular | physical | 1.3% | 12.7 | 2 | FAIL |
| regular | spell | 6.5% | 14.3 | 3 | PASS |
| regular | bleed | 6.4% | 13.7 | 2 | PASS |
| regular | shell | 5.2% | 14.2 | 3 | PASS |
| regular | poison | 9% | 14.2 | 2 | PASS |
| regular | control | 9.5% | 13.6 | 17 | PASS |
| trueMartial | physical | 0% | 12.9 | 1 | PASS |
| trueMartial | spell | 0% | 13.9 | 1 | PASS |
| trueMartial | bleed | 0% | 11.9 | 0 | PASS |
| trueMartial | shell | 0% | 13.2 | 1 | PASS |
| trueMartial | poison | 0% | 10.2 | 0 | PASS |
| trueMartial | control | 0% | 11.4 | 7 | PASS |

#### 40x2

| mode | style | winRate | avgFloor | timeout | status |
|---|---|---:|---:|---:|---|
| normal | physical | 10.5% | 14.9 | 2 | FAIL |
| normal | spell | 28.6% | 15.8 | 5 | PASS |
| normal | bleed | 18.9% | 14.9 | 3 | PASS |
| normal | shell | 16.7% | 14.8 | 4 | PASS |
| normal | poison | 12.8% | 15 | 1 | FAIL |
| normal | control | 18.8% | 14.1 | 8 | PASS |
| regular | physical | 5% | 12.5 | 0 | PASS |
| regular | spell | 5.4% | 13.9 | 3 | PASS |
| regular | bleed | 5.1% | 13.7 | 1 | PASS |
| regular | shell | 5% | 13.7 | 0 | PASS |
| regular | poison | 10.8% | 14.3 | 3 | WARN |
| regular | control | 9.7% | 13.3 | 9 | PASS |
| trueMartial | physical | 0% | 13 | 1 | PASS |
| trueMartial | spell | 0% | 13.6 | 2 | PASS |
| trueMartial | bleed | 0% | 12 | 1 | PASS |
| trueMartial | shell | 0% | 12.6 | 1 | PASS |
| trueMartial | poison | 0% | 10.3 | 0 | PASS |
| trueMartial | control | 0% | 10.9 | 4 | PASS |

## 7. Final Selection

Selected: L2_TARGETED_PHYSICAL_AI_PLUS_TARGET. Reason: safe Stage2 candidate selected by priority.

L2 is safe under the Stage2 hard-elimination rules, but it is not a complete regular physical fix: final regular physical is 1.3% in 80x1 and 5.0% in 40x2.

## 8. Final Applied Changes

- Added scripts/physical-death-diagnose.mjs.
- Modified scripts/sim-ai.mjs only for L2 physical profile behavior: physicalAI is enabled for physical normal/regular, battleIntent is included in physical damage ordering, battleIntent starters are preferred under 8 stacks, and physicalAI picks targetUid for execute/single-target damage.
- No final data.js, types.js, or archetypes.js candidate residue.

## 9. Final Value Check

CODEX V313L final value check PASSED

## 10. Final Test Results

| command | exit code | note |
|---|---:|---|
| npm run validate:data | 0 |  |
| npm run smoke | 0 |  |
| npm run player:flow | 0 |  |
| npm run check | 0 |  |
| npm run build:release | skipped | Skipped because build:release writes dist/build artifacts outside the V3.13L allowed output scope. |

Final balance-check commands:

| command | exit code | note |
|---|---:|---|
| final balance 80x1 | 1 |  |
| final balance 40x2 | 1 |  |

## 11. Final 80x1

| mode | style | winRate | avgFloor | timeout | status |
|---|---|---:|---:|---:|---|
| normal | physical | 21.8% | 15.3 | 2 | PASS |
| normal | spell | 22.7% | 15.6 | 5 | PASS |
| normal | bleed | 26.9% | 15.7 | 2 | PASS |
| normal | shell | 18.4% | 14.7 | 4 | PASS |
| normal | poison | 20.3% | 15.5 | 1 | PASS |
| normal | control | 20.7% | 14 | 22 | PASS |
| regular | physical | 1.3% | 12.7 | 2 | FAIL |
| regular | spell | 6.5% | 14.3 | 3 | PASS |
| regular | bleed | 6.4% | 13.7 | 2 | PASS |
| regular | shell | 5.2% | 14.2 | 3 | PASS |
| regular | poison | 9% | 14.2 | 2 | PASS |
| regular | control | 9.5% | 13.6 | 17 | PASS |
| trueMartial | physical | 0% | 12.9 | 1 | PASS |
| trueMartial | spell | 0% | 13.9 | 1 | PASS |
| trueMartial | bleed | 0% | 11.9 | 0 | PASS |
| trueMartial | shell | 0% | 13.2 | 1 | PASS |
| trueMartial | poison | 0% | 10.2 | 0 | PASS |
| trueMartial | control | 0% | 11.4 | 7 | PASS |

## 12. Final 40x2

| mode | style | winRate | avgFloor | timeout | status |
|---|---|---:|---:|---:|---|
| normal | physical | 10.5% | 14.9 | 2 | FAIL |
| normal | spell | 28.6% | 15.8 | 5 | PASS |
| normal | bleed | 18.9% | 14.9 | 3 | PASS |
| normal | shell | 16.7% | 14.8 | 4 | PASS |
| normal | poison | 12.8% | 15 | 1 | FAIL |
| normal | control | 18.8% | 14.1 | 8 | PASS |
| regular | physical | 5% | 12.5 | 0 | PASS |
| regular | spell | 5.4% | 13.9 | 3 | PASS |
| regular | bleed | 5.1% | 13.7 | 1 | PASS |
| regular | shell | 5% | 13.7 | 0 | PASS |
| regular | poison | 10.8% | 14.3 | 3 | WARN |
| regular | control | 9.7% | 13.3 | 9 | PASS |
| trueMartial | physical | 0% | 13 | 1 | PASS |
| trueMartial | spell | 0% | 13.6 | 2 | PASS |
| trueMartial | bleed | 0% | 12 | 1 | PASS |
| trueMartial | shell | 0% | 12.6 | 1 | PASS |
| trueMartial | poison | 0% | 10.3 | 0 | PASS |
| trueMartial | control | 0% | 10.9 | 4 | PASS |

## 13. Unmodified Items

- No publish
- No git push
- Enemy data unchanged
- Reward generation core unchanged
- Relics unchanged
- Blood sacrifice unchanged
- True Martial formation unchanged
- True Martial exclusive cards unchanged
- Spell cards unchanged
- Bleed cards unchanged
- Control cards unchanged

## 14. Conclusion

regular physical is partially improved but not fully fixed. normal is not fully stable because 40x2 physical is low and poison is still below target. regular overall is not fully green because 80x1 physical is still below target, although 40x2 physical reaches 5.0%. trueMartial remains within 0%-2% across all styles. L2 can be used only as a controlled diagnostic/AI baseline for the next round, not as a final balance-complete baseline; regular physical still needs deeper mechanism design rather than more small numeric buffs.
