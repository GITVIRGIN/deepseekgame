UI-R5-MAP-STAGE-BACKGROUNDS-IMPORT-P0

你现在继续 deepseekgame 项目 UI-R5 主线。

项目路径：

D:\workspace\deepseekgame

素材包：

用户会把本包解压到：

D:\workspace\deepseekgame\UI\ui-r5-map-stage-backgrounds

本轮任务：

导入 UI-R5 地图阶段背景素材，并优先替换“敌人死亡后暴露出来的占位背景 / 战斗场景底层背景”问题。

本轮不是重新生成素材。
本轮不是重做 UI。
本轮不是发布。
本轮不是玩法修改。
本轮不是数值修改。
本轮只做素材导入与最小 UI 绑定。

核心问题：

线上实机反馈：敌人死亡之后，敌人卡区域后面暴露出来的背景仍然是占位素材，观感很差。

目标：

1. 将本包素材保存进项目 UI 素材目录。
2. 给地图阶段建立背景资源映射。
3. 替换敌人死亡后暴露的占位背景。
4. 替换战斗场景底层仍为占位的背景图案。
5. 保持 UI-R5 当前布局、战斗反馈、卡牌素材、目标锚定全部不回退。
6. PC / mobile 都截图审查。

素材风格要求：

山西小西天壁画 / 彩塑 / 道教玄幻。
暗底金线。
暖橙红点缀。
铜绿辅助。
不要通用中心圆环。
只有悬空观台、阵台、天象异变等本来该有仪式圆形结构的场景才允许圆形元素。
不能再出现灰盒、占位圆环、object 文字、broken image。

导入素材：

将素材包内文件复制到：

D:\workspace\deepseekgame\UI\ui-r5-map-stage-backgrounds

建议保留目录：

reference_sheets
runtime_candidates
source_reference
manifest.json
README.md

运行时优先使用：

runtime_candidates/map_stage_bg_01_shanmenwai_initial_runtime_candidate_1920x1080.png
runtime_candidates/map_stage_bg_02_shanjian_gudao_runtime_candidate_1920x1080.png
runtime_candidates/map_stage_bg_03_duanya_zhandao_runtime_candidate_1920x1080.png
runtime_candidates/map_stage_bg_04_yaoqi_miman_runtime_candidate_1920x1080.png
runtime_candidates/map_stage_bg_05_gumiao_yizhi_runtime_candidate_1920x1080.png
runtime_candidates/map_stage_bg_06_xuankong_guantai_runtime_candidate_1920x1080.png
runtime_candidates/map_stage_bg_07_lingquan_mijing_runtime_candidate_1920x1080.png
runtime_candidates/map_stage_bg_08_tianxiang_yibian_runtime_candidate_1920x1080.png
runtime_candidates/map_stage_bg_09_yougu_mizong_runtime_candidate_1920x1080.png

注意：

runtime_candidates 是从已认可风格合集裁出的运行时候选图。
导入后必须在游戏内截图检查：
1. 不能有中文标签残留。
2. 不能有边框残留。
3. 不能被拉伸变形。
4. 不能被敌人死亡空位裁切出怪异区域。
5. 不能破坏 PC/mobile 一页可见。
如果发现候选图仍有标签/边框/裁切问题，不要硬 PASS，必须 BLOCKED，并说明需要单独重绘无字版运行时背景。

硬性禁止：

1. 禁止 git commit。
2. 禁止 git tag。
3. 禁止 git push。
4. 禁止发布 GitHub Pages。
5. 禁止修改 public/assets/ui-r5/cards 下任何文件。
6. 禁止重新生成 132 张玩家卡牌主图。
7. 禁止修改战斗反馈逻辑。
8. 禁止修改目标锚定逻辑。
9. 禁止修改玩法。
10. 禁止修改数值。
11. 禁止修改卡牌效果。
12. 禁止修改敌人 AI。
13. 禁止恢复敌人头像位。
14. 禁止恢复敌人卡“目标”文字。
15. 禁止移动敌人意图图标位置。
16. 禁止回退 gatherAsh / 拾遗诀展示。
17. 禁止破坏 PC/mobile combat 一页可见。
18. 禁止为了 PASS 缩小检查项。
19. 禁止硬写 true。
20. 禁止删除失败项。
21. 禁止把 blocker 改成 non-blocking。
22. 禁止复制旧截图冒充本轮截图。
23. 禁止同图改名。

允许修改范围：

1. 新增 UI-R5 地图阶段背景素材引用。
2. 新增或更新 map stage background resolver。
3. 新增或更新 combat background / enemy dead slot background 的 CSS 或资源路径。
4. 新增 data attribute 方便 Playwright 验证背景是否加载。
5. 新增本轮 Playwright harness 和外部 verifier。
6. 新增审计包文件。

不得修改：

1. public/assets/ui-r5/cards。
2. 卡牌主图。
3. 敌人主图。
4. 战斗反馈素材。
5. UI-R5 卡牌布局。
6. 敌人卡结构。
7. 玩家状态栏结构。
8. reward / gatherAsh 逻辑。
9. 发布配置。

建议实现方式：

1. 将背景素材复制到项目 public 可访问路径，例如：

public/assets/ui-r5/map-backgrounds/

或项目现有 UI-R5 asset 目录中更合适的位置。

2. 建立稳定映射，例如：

mapStageBackgrounds = {
  stageGate: ".../map_stage_bg_01_shanmenwai_initial_runtime_candidate_1920x1080.png",
  mountainRoad: ".../map_stage_bg_02_shanjian_gudao_runtime_candidate_1920x1080.png",
  cliffPath: ".../map_stage_bg_03_duanya_zhandao_runtime_candidate_1920x1080.png",
  demonMist: ".../map_stage_bg_04_yaoqi_miman_runtime_candidate_1920x1080.png",
  ruinedTemple: ".../map_stage_bg_05_gumiao_yizhi_runtime_candidate_1920x1080.png",
  skyPlatform: ".../map_stage_bg_06_xuankong_guantai_runtime_candidate_1920x1080.png",
  spiritSpring: ".../map_stage_bg_07_lingquan_mijing_runtime_candidate_1920x1080.png",
  omenSky: ".../map_stage_bg_08_tianxiang_yibian_runtime_candidate_1920x1080.png",
  darkValley: ".../map_stage_bg_09_yougu_mizong_runtime_candidate_1920x1080.png"
}

3. 如果当前游戏没有明确地图阶段字段，先用安全默认：

第 1-2 层：山门外 / 山间古道
第 3-5 层：断崖栈道 / 古庙遗址
第 6-9 层：妖气弥漫之地 / 灵泉秘境
第 10-14 层：悬空观台 / 天象异变之地
第 15-18 层：幽谷迷踪 / 天象异变之地

4. 敌人死亡后，敌人卡空位或卡底层不得露出占位圆环。
应露出当前 stage background 的局部、暗底纹理或专门的 dead-slot background。
不能出现大面积空白、灰盒、broken image。

5. 移动端背景应使用 cover，不要拉伸变形。
可用 background-size: cover;
background-position: center;
但必须通过截图确认敌人死亡后露出的局部好看。

必须真实复现：

使用本地 Playwright / Chromium。
禁止 ChatGPT 内嵌浏览器。
禁止人工截图。
禁止复制旧图。

必须覆盖 viewport：

PC：1366x768
Mobile：390x844

必须截图：

screenshots/pc-combat-stage-bg-full.png
screenshots/mobile-combat-stage-bg-full.png
screenshots/pc-enemy-dead-slot-bg.png
screenshots/mobile-enemy-dead-slot-bg.png
screenshots/pc-stage-bg-card-area-detail.png
screenshots/mobile-stage-bg-card-area-detail.png
screenshots/pc-reward-no-regression.png
screenshots/mobile-reward-no-regression.png
screenshots/contact-sheet.png

截图要求：

1. 必须来自本轮真实 Playwright。
2. 必须能看到敌人死亡后空位背景。
3. 必须能看到背景不再是占位圆环。
4. 必须能看到图片资源正常加载。
5. PC/mobile 都必须覆盖。
6. contact-sheet 必须可打开，可肉眼预览。
7. 禁止同图改名。

必须生成 map-background-import-metrics.csv。

字段至少包含：

viewport
scene
stageKey
backgroundAssetPath
backgroundImageLoaded
backgroundNaturalWidth
backgroundNaturalHeight
enemyDeadSlotVisible
enemyDeadSlotUsesNewBackground
placeholderRingVisible
brokenImageCount
objectTextCount
onePageVisible
pass
screenshotPath
notes

必须覆盖：

pc combat full
mobile combat full
pc enemy dead slot
mobile enemy dead slot
pc card area detail
mobile card area detail
pc reward no regression
mobile reward no regression

必须生成 map-background-blockers.csv。

以下任一情况必须 BLOCKED：

1. 素材没导入。
2. 背景资源加载失败。
3. broken image count > 0。
4. 敌人死亡空位仍露出占位圆环。
5. 出现 object 无意义文字。
6. 背景图有明显中文标签残留。
7. 背景图有明显合集边框残留。
8. 背景图拉伸变形严重。
9. PC combat 非一页可见。
10. mobile combat 非一页可见。
11. public/assets/ui-r5/cards 被修改。
12. enemyAvatarDomCount 不为 0。
13. targetTextCount 不为 0。
14. reward / gatherAsh 回退。
15. target anchor 或 feedback P2 回退。
16. 缺截图。
17. contact-sheet 不可打开。

必须保留回归检查：

cards count=132
cards sha diff=0
enemyAvatarDomCount=0
targetTextCount=0
PC combat one-page visible=true
mobile combat one-page visible=true
target-anchor 12/12 anchoredPass=true
visual-readability 12/12 visualReadabilityPass=true
fallback blocker=0
visual blocker=0
UI regression blocker=0

必须生成证据文件：

report.md
final-verdict.txt
console-log.txt
screenshots/
command-log.txt
changed-files.txt
zip-entry-list.txt
repack-report.md
repack-report.json
version.js
cards-sha256-before.csv
cards-sha256-after.csv
map-background-import-metrics.csv
map-background-blockers.csv
target-anchor-metrics.csv
feedback-visual-readability-metrics.csv
ui-regression-metrics.csv
fallback-target-events.csv
visual-readability-blockers.csv
ui-regression-blockers.csv

最终审计包：

D:\workspace\deepseekgame\ai-review\deepseekgame-ui-r5-map-stage-backgrounds-import-p0-review.zip

同目录：

D:\workspace\deepseekgame\ai-review\deepseekgame-ui-r5-map-stage-backgrounds-import-p0-review.zip.sha256.txt

D:\workspace\deepseekgame\ai-review\deepseekgame-ui-r5-map-stage-backgrounds-import-p0-review.zip.postpack-verifier.json

final-verdict.txt 在 zip 内只能写：

PENDING_EXTERNAL_POSTPACK

或：

INCONCLUSIVE

不得写最终 PASS。

zip-entry-list.txt 必须 manifest closure：

1. zip-entry-list.txt 是 zip 内成员。
2. zip-entry-list.txt 必须列出自己。
3. zip-entry-list.txt 必须和最终 zip namelist 完全一致。
4. 路径统一使用 /。

外部 verifier 必须检查：

1. final zip sha256。
2. sha256 sidecar 是否匹配。
3. zip-entry-list closure。
4. required files 是否齐全。
5. screenshots/contact-sheet.png 是否存在且可打开。
6. map-background-import-metrics.csv 是否覆盖全部必需场景。
7. map-background-import-metrics.csv 全部 pass=true。
8. map-background-blockers.csv 无 blocker。
9. cards count=132。
10. cards sha diff=0。
11. enemyAvatarDomCount=0。
12. targetTextCount=0。
13. PC combat one-page visible=true。
14. mobile combat one-page visible=true。
15. target-anchor 12/12。
16. visual-readability 12/12。
17. fallback blocker=0。
18. visual blocker=0。
19. UI regression blocker=0。
20. enemy dead slot uses new background=true。
21. placeholderRingVisible=false。
22. brokenImageCount=0。
23. objectTextCount=0。
24. 没有 git commit/tag/push。
25. 没有 GitHub Pages 发布。
26. zip 内 final-verdict 未写最终 PASS。
27. 外部 verifier 不在 zip 内。
28. public/assets/ui-r5/cards 无变化。

PASS 条件：

只有同时满足以下条件，外部 verifier 才能 PASS：

1. 地图阶段背景素材已导入。
2. 敌人死亡空位不再暴露占位背景。
3. 背景图片加载成功。
4. PC/mobile 截图能肉眼确认。
5. map-background-import-metrics 全部通过。
6. blockers 全部为 0。
7. UI-R5 冻结基线不回退。
8. cards count=132。
9. cards sha diff=0。
10. enemyAvatarDomCount=0。
11. targetTextCount=0。
12. target-anchor 12/12。
13. visual-readability 12/12。
14. PC/mobile 一页可见。
15. 没有发布。
16. 没有 git commit/tag/push。
17. 证据包闭环。

否则必须 BLOCKED。

最终回复必须包含：

1. reviewPackageResult，只能来自外部 verifier。
2. 导入素材目录。
3. 修改文件列表。
4. cards count。
5. cards sha diff count。
6. enemyAvatarDomCount。
7. targetTextCount。
8. enemy dead slot background 是否替换成功。
9. placeholderRingVisible。
10. brokenImageCount。
11. objectTextCount。
12. PC/mobile screenshots 是否存在。
13. contact-sheet 是否存在可打开。
14. final zip 绝对路径。
15. sha256 文件绝对路径。
16. postpack verifier 绝对路径。
17. 如果 BLOCKED，列出 observedBlockers。
