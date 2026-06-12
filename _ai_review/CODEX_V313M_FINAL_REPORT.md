# CODEX V3.13M Final Report

## 1. Round Nature

This round lands the physical mechanism-level fix after GPT presimulation. It is not a candidate matrix round. No publish was performed.

## 2. GPT Presimulation Conclusion

- Adding a new physical AOE card was unsafe because normal physical became unstable.
- Pure reward, archetype, or small numeric buffs were not enough.
- Adding draw 1 to readyStance and battleCry improves normal physical tempo.
- A low-strength regular-only physical momentum relief can address regular physical late-run breakage.
- trueMartial physical remained 0% in presimulation.

## 3. Actual Changes

- readyStance: added draw 1 while keeping battleIntent 6.
- battleCry: added draw 1 while keeping battleIntent 8.
- combat.js: added regular-only physical momentum relief.
- Momentum rules: regular only; physical dominant archetype only; floor >= 10 only; floor 10-12 gives 2 battleIntent + 2 block; floor >= 13 gives 2 battleIntent + 3 block; visible combat.log message.

## 4. Value Check

CODEX V313M value check PASSED

## 5. Basic Test Results

| command | exit code | note |
|---|---:|---|
| npm run validate:data | 0 |  |
| npm run smoke | 0 |  |
| npm run player:flow | 0 |  |
| npm run check | 0 |  |
| npm run build:release | skipped | Skipped because build:release writes dist/build artifacts outside the V3.13M allowed output scope. |

Balance command exits:

| command | exit code | note |
|---|---:|---|
| balance 80x1 | 1 |  |
| balance 40x2 | 1 |  |

## 6. 80x1 Results

| mode | style | winRate | avgFloor | timeout | status |
|---|---|---:|---:|---:|---|
| normal | physical | 21.3% | 15.7 | 0 | PASS |
| normal | spell | 17.1% | 15.5 | 4 | PASS |
| normal | bleed | 32.5% | 15.8 | 3 | FAIL |
| normal | shell | 19.7% | 14.9 | 4 | PASS |
| normal | poison | 22.4% | 15.4 | 4 | PASS |
| normal | control | 27.1% | 14.2 | 21 | PASS |
| regular | physical | 13% | 13.8 | 3 | FAIL |
| regular | spell | 6.4% | 14.6 | 2 | PASS |
| regular | bleed | 3.8% | 13.8 | 1 | FAIL |
| regular | shell | 10.3% | 14.9 | 2 | WARN |
| regular | poison | 11.7% | 14.6 | 3 | WARN |
| regular | control | 13.1% | 14.2 | 19 | FAIL |
| trueMartial | physical | 0% | 12.8 | 1 | PASS |
| trueMartial | spell | 0% | 14.2 | 1 | PASS |
| trueMartial | bleed | 0% | 11.6 | 0 | PASS |
| trueMartial | shell | 0% | 13.2 | 1 | PASS |
| trueMartial | poison | 0% | 10.3 | 0 | PASS |
| trueMartial | control | 0% | 11.4 | 6 | PASS |

## 7. 40x2 Results

| mode | style | winRate | avgFloor | timeout | status |
|---|---|---:|---:|---:|---|
| normal | physical | 20.5% | 15.4 | 1 | PASS |
| normal | spell | 25% | 15.7 | 4 | PASS |
| normal | bleed | 23.7% | 15.5 | 2 | PASS |
| normal | shell | 13.9% | 14.7 | 4 | FAIL |
| normal | poison | 18.4% | 14.9 | 2 | PASS |
| normal | control | 31.3% | 14.8 | 8 | WARN |
| regular | physical | 5% | 13.5 | 0 | PASS |
| regular | spell | 5.4% | 14 | 3 | PASS |
| regular | bleed | 12.5% | 14.3 | 0 | FAIL |
| regular | shell | 7.7% | 14.4 | 1 | PASS |
| regular | poison | 13.5% | 14.6 | 3 | FAIL |
| regular | control | 6.9% | 13.7 | 11 | PASS |
| trueMartial | physical | 0% | 13.7 | 0 | PASS |
| trueMartial | spell | 0% | 13.8 | 1 | PASS |
| trueMartial | bleed | 0% | 11.4 | 0 | PASS |
| trueMartial | shell | 0% | 12.9 | 0 | PASS |
| trueMartial | poison | 0% | 10.2 | 0 | PASS |
| trueMartial | control | 0% | 10.7 | 3 | PASS |

## 8. Unmodified Items

- No publish.
- No git push.
- No new cards.
- Enemy data unchanged.
- Reward pool unchanged.
- Relics unchanged.
- Blood sacrifice unchanged.
- True Martial formation unchanged.
- True Martial exclusive cards unchanged.
- Spell cards unchanged.
- Bleed cards unchanged.
- Control cards unchanged.
- Poison cards unchanged.
- Shell cards unchanged.
- difficultyTuning unchanged.
- sim-ai / balance-check / tm-diagnose were not modified in this V3.13M round.

## 9. Conclusion

normal is not fully green: 80x1 has normal bleed at 32.5% FAIL, and 40x2 has normal shell at 13.9% FAIL. regular is not fully green: 80x1 physical is 13.0% FAIL and control is 13.1% FAIL; 40x2 bleed and poison also FAIL. trueMartial remains within 0%-2% across all styles. This fixed mechanism can be reviewed as a candidate baseline, but the current balance gate is not fully passing, so the next round should address the remaining normal/regular failures without changing this fixed V3.13M scope.
