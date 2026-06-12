# CODEX V3.13I Final Report

## 1. ????
???????????????? V3.13G-R4A ??????? C0-C14 ???????????????? gap ?????????

## 2. ??
???? V3.13H ? 10 ????? V3.13G-R4A ???????? git checkout?????? baseline value check?validate:data?smoke?player:flow?check?????

## 3. ????
- C0_BASELINE: ?????????
- C1_SHELL_CARDS_LIGHT: ???????reflectArt 7?turtleCrush 12?stoneShell 6?immovableVajra 20?xuanwuPrison 14/0.16?skyShellMandate 16?
- C2_SHELL_CARDS_STRONG: ???????reflectArt 8?turtleCrush 13?stoneShell 7?immovableVajra 21?xuanwuPrison 15/0.17?skyShellMandate 17?
- C3_SHELL_REWARD_ONLY: ???????beginner.shellRewardMult 1.42?regular.shellRewardMult 0.92?
- C4_SHELL_CARDS_LIGHT_PLUS_REWARD: C1 + beginner.shellRewardMult 1.36?regular.shellRewardMult 0.88?
- C5_POISON_CARDS: ?????centipedeJar 9?/7??softBoneSmoke 7???/9???
- C6_POISON_REWARD_ONLY: regular.poisonRewardMult 0.70?
- C7_POISON_CARDS_PLUS_REWARD: C5 + regular.poisonRewardMult 0.66?
- C8_CONTROL_REWARD_042: regular.controlRewardMult 0.42?
- C9_CONTROL_REWARD_050: regular.controlRewardMult 0.50?
- C10_PHYSICAL_TINY: battleCry ?? 7 -> 8?
- C11_PHYSICAL_REWARD_ONLY: regular.physicalRewardMult 1.38?
- C12_COMBO_SAFE: C1 + C5 + battleCry 8 + regular control 0.42 / physical 1.32 / poison 0.66 / shell 0.88 + beginner shell 1.34?
- C13_COMBO_NO_CONTROL: C12 ?? controlRewardMult ???
- C14_COMBO_SHELL_POISON_ONLY: C1 + C5 + regular poison 0.66 / shell 0.88 + beginner shell 1.34?????????

## 4. ???????
| Candidate | validate:data | smoke | 80x1 JSON | 40x2 JSON | Eliminated |
|---|---|---|---|---|---|
| C0_BASELINE | PASS | PASS | yes | yes | no |
| C1_SHELL_CARDS_LIGHT | PASS | PASS | yes | yes | yes: normal over 32% |
| C2_SHELL_CARDS_STRONG | PASS | PASS | yes | yes | yes: normal over 32% |
| C3_SHELL_REWARD_ONLY | PASS | PASS | yes | yes | no |
| C4_SHELL_CARDS_LIGHT_PLUS_REWARD | PASS | PASS | yes | yes | no |
| C5_POISON_CARDS | PASS | PASS | yes | yes | no |
| C6_POISON_REWARD_ONLY | PASS | PASS | yes | yes | no |
| C7_POISON_CARDS_PLUS_REWARD | PASS | PASS | yes | yes | yes: regular over 12% |
| C8_CONTROL_REWARD_042 | PASS | PASS | yes | yes | no |
| C9_CONTROL_REWARD_050 | PASS | PASS | yes | yes | no |
| C10_PHYSICAL_TINY | PASS | PASS | yes | yes | no |
| C11_PHYSICAL_REWARD_ONLY | PASS | PASS | yes | yes | no |
| C12_COMBO_SAFE | PASS | PASS | yes | yes | no |
| C13_COMBO_NO_CONTROL | PASS | PASS | yes | yes | no |
| C14_COMBO_SHELL_POISON_ONLY | PASS | PASS | yes | yes | yes: regular over 12% |

## 5. ?????
?????normal 15%-30%?regular 5%-10%?trueMartial 0%-2%?trueMartial ?? >2%?normal ?? >32%?regular ?? >12%????????? JSON ????normal/regular ? 80x1 ? 40x2 ??????????????? gap ??????? 1.5???/?? 1.2???/??/?? 1.0?

| Rank | Candidate | Normal 80 Gap | Normal 40 Gap | Regular 80 Gap | Regular 40 Gap | TM OK | Hard Over | Total Score |
|---:|---|---:|---:|---:|---:|---|---|---:|
| 1 | C12_COMBO_SAFE | 2 | 2.1999999999999993 | 5 | 5.800000000000001 | yes | no | 15.6 |
| 2 | C13_COMBO_NO_CONTROL | 2 | 2.1999999999999993 | 7.2 | 10.3 | yes | no | 22.72 |
| 3 | C9_CONTROL_REWARD_050 | 9.3 | 9.299999999999999 | 5.700000000000001 | 5 | yes | no | 36.5 |
| 4 | C6_POISON_REWARD_ONLY | 9.3 | 9.299999999999999 | 6.2 | 6.4 | yes | no | 38.67999999999999 |
| 5 | C10_PHYSICAL_TINY | 10.600000000000001 | 9.299999999999999 | 5.9 | 9.3 | yes | no | 43.120000000000005 |
| 6 | C0_BASELINE | 9.3 | 9.299999999999999 | 4.3 | 11.4 | yes | no | 43.86 |
| 7 | C8_CONTROL_REWARD_042 | 9.3 | 9.299999999999999 | 7.800000000000001 | 12.5 | yes | no | 46.62 |
| 8 | C4_SHELL_CARDS_LIGHT_PLUS_REWARD | 9.1 | 12.3 | 8 | 8.3 | yes | no | 46.92 |
| 9 | C11_PHYSICAL_REWARD_ONLY | 9.3 | 9.299999999999999 | 8.3 | 14.4 | yes | no | 49.519999999999996 |
| 10 | C5_POISON_CARDS | 9.3 | 15.599999999999998 | 2.3000000000000003 | 12.2 | yes | no | 49.78999999999999 |
| 11 | C3_SHELL_REWARD_ONLY | 11.6 | 13.799999999999999 | 10.6 | 12.1 | yes | no | 60.79 |
| 12 | C14_COMBO_SHELL_POISON_ONLY | 4.6 | 3.299999999999999 | 4.5 | 8.7 | yes | yes | 22.87 |
| 13 | C2_SHELL_CARDS_STRONG | 9.200000000000001 | 3.599999999999998 | 1.2000000000000002 | 9.3 | yes | yes | 28.279999999999994 |
| 14 | C1_SHELL_CARDS_LIGHT | 7.4 | 11.099999999999998 | 3 | 4.8 | yes | yes | 34.33 |
| 15 | C7_POISON_CARDS_PLUS_REWARD | 9.3 | 15.599999999999998 | 10.399999999999999 | 23.7 | yes | yes | 70.01999999999998 |

## 6. ????
?? **C12_COMBO_SAFE**????safe improvement candidate: lower than C0, improves at least 2 low entries, no new severe over????????????C12_COMBO_SAFE ??????????????????????????

## 7. ??????
??? C12_COMBO_SAFE:
- reflectArt: block 6 -> 7?
- turtleCrush: block 10 -> 12?
- stoneShell: block 5 -> 6?
- immovableVajra: block 18 -> 20?
- xuanwuPrison: block 12 -> 14, shellReflect ratio 0.14 -> 0.16?
- skyShellMandate: block 14 -> 16?
- centipedeJar: damage 8 -> 9, poison 6 -> 7?
- softBoneSmoke: allEnemies poison 6 -> 7, block 8 -> 9?
- battleCry: battleIntent 7 -> 8?
- beginner.shellRewardMult: 1.26 -> 1.34?
- regular.controlRewardMult: 0.34 -> 0.42?
- regular.physicalRewardMult: 1.24 -> 1.32?
- regular.poisonRewardMult: 0.60 -> 0.66?
- regular.shellRewardMult: 0.78 -> 0.88?

## 8. ????
CODEX V313I final value check PASSED

## 9. ??????
- npm run validate:data: exit code 0
- npm run smoke: exit code 0
- npm run player:flow: exit code 0
- npm run check: exit code 0
- npm run build:release: skipped (writes dist, outside V3.13I allowed outputs)

## 10. ?? 80x1 ??
| Mode | Style | WinRate | AvgFloor | Timeout | Status |
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

## 11. ?? 40x2 ??
| Mode | Style | WinRate | AvgFloor | Timeout | Status |
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

## 12. ????
- ?????
- ?? git push?
- ??????
- ???????
- ??????
- ????????
- ????????
- ?????????
- ???????
- ???????
- ???????
- ??? sim-ai / balance-check / tm-diagnose?

## 13. ??
- normal: ??????80x1 ? physical 13.0% FAIL?40x2 ? poison 12.8% FAIL?
- regular: ??????80x1 ? 40x2 ? physical 0.0% FAIL?40x2 poison 10.8% ? WARN?
- trueMartial: ?? 0%-2%??????? PASS?
- ?????????????????????????????????????????????????? physical ? regular ??????? normal poison/physical ???
