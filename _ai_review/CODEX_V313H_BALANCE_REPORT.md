# CODEX V3.13H Balance Report

## 1. 本轮修改范围
只修改：
- src/core/data.js
- src/core/types.js

## 2. 具体数值修改
- reflectArt / 反震诀：格挡 6 -> 8；保留 2 层荆棘；文案改为“获得 8 点格挡和 2 层荆棘。”
- turtleCrush / 龟甲镇岳：格挡 10 -> 13；3 层荆棘与 spikeBurst 保持不变；文案同步。
- stoneShell / 玄龟伏息：格挡 5 -> 7；抽 1 张牌保持不变；文案同步。
- immovableVajra / 不动明王身：格挡 18 -> 21；4 层荆棘与 doubleBlock 保持不变；文案同步。
- xuanwuPrison / 玄武镇狱：格挡 12 -> 15；shellReflect ratio 0.14 -> 0.17；consumeRatio 0 保持不变；文案同步。
- skyShellMandate / 天龟负碑：格挡 14 -> 17；shellReflect ratio 0.20 与抽 1 张牌保持不变；文案同步。
- centipedeJar / 蜈蚣蛊坛：伤害 8 -> 9；毒瘴 6 -> 7；文案同步。
- softBoneSmoke / 软骨烟：全体毒瘴 6 -> 7；格挡 8 -> 9；文案同步。
- battleCry / 刑天战吼：战意 7 -> 8；后续物理伤害牌后战意 +7 机制保持不变；文案同步。
- regular.controlRewardMult：0.34 -> 0.37。

## 3. 验值结果
CODEX V313H value check PASSED

## 4. 未修改项
- 没有发布。
- 没有 git push。
- 没有改敌人。
- 没有改奖励池。
- 没有改遗物。
- 没有改血祭悟道。
- 没有改真武阵势。
- 没有改真武专属牌。
- 没有改法术牌。
- 没有改流血牌。
- 没有改控制牌。
- 没有改 sim-ai / balance-check / tm-diagnose。
- 没有根据 balance-check 结果二次调参。

## 5. 基础测试结果
- 强制验值：执行，exit code 0，PASSED。
- npm run validate:data：执行，exit code 0，通过。
- npm run smoke：执行，exit code 0，通过，142 passed, 0 failed。
- npm run player:flow：执行，exit code 0，通过，12 total, 12 passed, 0 failed。
- npm run check：执行，exit code 0，通过。
- npm run build:release：未执行。原因：脚本只做本地构建验证，但会写入 dist，本轮绝对边界只允许改 src/core/data.js、src/core/types.js 以及生成指定 _ai_review 文件和 review zip，因此跳过以避免生成允许范围外构建产物。

## 6. 80x1 结果
| Mode | Style | WinRate | AvgFloor | Timeout | Status |
|---|---:|---:|---:|---:|---|
| normal | physical | 17.1% | 15 | 4 | PASS |
| normal | spell | 28% | 15.6 | 5 | PASS |
| normal | bleed | 35.9% | 15.6 | 2 | FAIL |
| normal | shell | 13% | 14.8 | 3 | FAIL |
| normal | poison | 19% | 15.2 | 1 | PASS |
| normal | control | 25.4% | 14.5 | 17 | PASS |
| regular | physical | 2.6% | 13.4 | 2 | FAIL |
| regular | spell | 4.1% | 14.4 | 7 | FAIL |
| regular | bleed | 5.1% | 13.4 | 1 | PASS |
| regular | shell | 5.2% | 14.4 | 3 | PASS |
| regular | poison | 8% | 13.8 | 5 | PASS |
| regular | control | 2.9% | 13.7 | 12 | FAIL |
| trueMartial | physical | 0% | 12.5 | 1 | PASS |
| trueMartial | spell | 0% | 13.8 | 1 | PASS |
| trueMartial | bleed | 0% | 12.1 | 0 | PASS |
| trueMartial | shell | 0% | 14.1 | 2 | PASS |
| trueMartial | poison | 0% | 10.3 | 0 | PASS |
| trueMartial | control | 0% | 11.5 | 8 | PASS |

## 7. 40x2 结果
| Mode | Style | WinRate | AvgFloor | Timeout | Status |
|---|---:|---:|---:|---:|---|
| normal | physical | 16.2% | 15.1 | 3 | PASS |
| normal | spell | 34.3% | 15.7 | 5 | FAIL |
| normal | bleed | 15.4% | 14.9 | 1 | PASS |
| normal | shell | 17.9% | 14.8 | 1 | PASS |
| normal | poison | 17.9% | 15 | 1 | PASS |
| normal | control | 21.9% | 14.2 | 8 | PASS |
| regular | physical | 0% | 13 | 3 | FAIL |
| regular | spell | 7.9% | 14.1 | 2 | PASS |
| regular | bleed | 0% | 13.3 | 2 | FAIL |
| regular | shell | 0% | 13.7 | 0 | FAIL |
| regular | poison | 8.6% | 13.6 | 5 | PASS |
| regular | control | 0% | 13 | 9 | FAIL |
| trueMartial | physical | 0% | 12.9 | 1 | PASS |
| trueMartial | spell | 0% | 13.5 | 2 | PASS |
| trueMartial | bleed | 0% | 12.2 | 1 | PASS |
| trueMartial | shell | 0% | 13.7 | 1 | PASS |
| trueMartial | poison | 0% | 10.2 | 0 | PASS |
| trueMartial | control | 0% | 10.8 | 4 | PASS |

## 8. 结论
- normal：未完全达标。80x1 中流血过高、龟壳偏低；40x2 中法术过高，其余达标。结果存在样本波动。
- regular：未完全达标。80x1 中物理、法术、控制偏低；40x2 中物理、流血、龟壳、控制偏低。
- trueMartial：保持达标。80x1 与 40x2 六流派均保持 0%-2%。
- 下一轮建议：不要基于本轮结果在 V3.13H 内二次调参；后续可单独进入下一轮，重点观察 regular 物理/控制与龟壳样本稳定性，并用更大样本确认 normal 的流血/法术波动。
