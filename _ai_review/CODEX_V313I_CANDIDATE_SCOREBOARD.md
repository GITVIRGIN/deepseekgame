# CODEX V3.13I Candidate Scoreboard

## Scoring Rules
Targets: normal 15%-30%, regular 5%-10%, trueMartial 0%-2%.

Hard elimination: trueMartial any style >2%, normal any style >32%, regular any style >12%, basic tests failed, or missing 80x1/40x2 JSON.

Gap scoring counts normal/regular 80x1 and 40x2. Below min uses min-winRate; above max uses winRate-max; in range is 0. Weights: shell 1.5, poison 1.2, control 1.2, physical/bleed/spell 1.0.

Selected: **C12_COMBO_SAFE** (safe improvement candidate: lower than C0, improves at least 2 low entries, no new severe over).

## Ranking

| Rank | Candidate | Score | Eliminated | Safe | Full Target | Improved Low Count | Reasons |
|---:|---|---:|---|---|---|---:|---|
| 1 | C12_COMBO_SAFE | 15.6 | no | yes | no | 9 | - |
| 2 | C13_COMBO_NO_CONTROL | 22.72 | no | yes | no | 8 | - |
| 3 | C9_CONTROL_REWARD_050 | 36.5 | no | yes | no | 6 | - |
| 4 | C6_POISON_REWARD_ONLY | 38.67999999999999 | no | yes | no | 6 | - |
| 5 | C10_PHYSICAL_TINY | 43.120000000000005 | no | yes | no | 3 | - |
| 6 | C0_BASELINE | 43.86 | no | no | no | 0 | - |
| 7 | C8_CONTROL_REWARD_042 | 46.62 | no | no | no | 4 | - |
| 8 | C4_SHELL_CARDS_LIGHT_PLUS_REWARD | 46.92 | no | no | no | 8 | - |
| 9 | C11_PHYSICAL_REWARD_ONLY | 49.519999999999996 | no | no | no | 3 | - |
| 10 | C5_POISON_CARDS | 49.78999999999999 | no | no | no | 5 | - |
| 11 | C3_SHELL_REWARD_ONLY | 60.79 | no | no | no | 5 | - |
| 12 | C14_COMBO_SHELL_POISON_ONLY | 22.87 | yes | no | no | 10 | regular over 12% |
| 13 | C2_SHELL_CARDS_STRONG | 28.279999999999994 | yes | no | no | 8 | normal over 32% |
| 14 | C1_SHELL_CARDS_LIGHT | 34.33 | yes | no | no | 8 | normal over 32% |
| 15 | C7_POISON_CARDS_PLUS_REWARD | 70.01999999999998 | yes | no | no | 4 | regular over 12% |

## Detailed Scores

| Candidate | Normal 80 Gap | Normal 40 Gap | Regular 80 Gap | Regular 40 Gap | TM OK | Normal >30 | Regular >10 | Total |
|---|---:|---:|---:|---:|---|---|---|---:|
| C0_BASELINE | 9.3 | 9.299999999999999 | 4.3 | 11.4 | yes | no | no | 43.86 |
| C1_SHELL_CARDS_LIGHT | 7.4 | 11.099999999999998 | 3 | 4.8 | yes | yes | yes | 34.33 |
| C2_SHELL_CARDS_STRONG | 9.200000000000001 | 3.599999999999998 | 1.2000000000000002 | 9.3 | yes | yes | no | 28.279999999999994 |
| C3_SHELL_REWARD_ONLY | 11.6 | 13.799999999999999 | 10.6 | 12.1 | yes | no | no | 60.79 |
| C4_SHELL_CARDS_LIGHT_PLUS_REWARD | 9.1 | 12.3 | 8 | 8.3 | yes | no | yes | 46.92 |
| C5_POISON_CARDS | 9.3 | 15.599999999999998 | 2.3000000000000003 | 12.2 | yes | yes | no | 49.78999999999999 |
| C6_POISON_REWARD_ONLY | 9.3 | 9.299999999999999 | 6.2 | 6.4 | yes | no | yes | 38.67999999999999 |
| C7_POISON_CARDS_PLUS_REWARD | 9.3 | 15.599999999999998 | 10.399999999999999 | 23.7 | yes | yes | yes | 70.01999999999998 |
| C8_CONTROL_REWARD_042 | 9.3 | 9.299999999999999 | 7.800000000000001 | 12.5 | yes | no | yes | 46.62 |
| C9_CONTROL_REWARD_050 | 9.3 | 9.299999999999999 | 5.700000000000001 | 5 | yes | no | no | 36.5 |
| C10_PHYSICAL_TINY | 10.600000000000001 | 9.299999999999999 | 5.9 | 9.3 | yes | no | no | 43.120000000000005 |
| C11_PHYSICAL_REWARD_ONLY | 9.3 | 9.299999999999999 | 8.3 | 14.4 | yes | no | yes | 49.519999999999996 |
| C12_COMBO_SAFE | 2 | 2.1999999999999993 | 5 | 5.800000000000001 | yes | no | yes | 15.6 |
| C13_COMBO_NO_CONTROL | 2 | 2.1999999999999993 | 7.2 | 10.3 | yes | no | yes | 22.72 |
| C14_COMBO_SHELL_POISON_ONLY | 4.6 | 3.299999999999999 | 4.5 | 8.7 | yes | no | yes | 22.87 |
