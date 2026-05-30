# BASELINE_MANIFEST

- **基线名称**：v0.7.4-stable
- **创建时间**：2026-05-31 01:57 UTC+8
- **Git commit hash**：e107d10da0268b1870926f759f5e1cde7e5ca7c3
- **版本号**：v0.7.4 (app/core/save: 0.7.4, ui/data: 0.1.0)
- **已通过的命令**：
  - npm run validate:data
  - npm run smoke
  - npm run check
  - npm run build:release
  - node scripts/simulate-runs.mjs --runs=50 --json
  - node scripts/sim-ai.mjs
- **本基线用途**：作为 v0.7.5 真武平衡轮的回滚参考
- **稳定内容**：
  - 真武模式入口可用
  - 真武六遗物真实生效（破军令/九天雷劫/修罗心/万毒真经/混沌灵宝/玄龟甲）
  - 云端存档 migrateGameState 迁移
  - combat-events.js 击杀处理拆分
  - smoke 测试 18 项通过
