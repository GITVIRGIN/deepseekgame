# V3.13G Recovery Report

## 1. 事故原因
`git checkout src/core/data.js` 将 data.js 恢复到 v0.7.7 Git 提交状态，覆盖了 V3.0–V3.12 所有未提交的已审核通过改动。

## 2. 恢复来源
`D:\workspace\deepseekgame\deepseekgame-review\deepseekgame-review-v313d-balance-fix.zip`

## 3. 备份位置
`D:\workspace\deepseekgame\ai-review\recovery-backup-20260609-170053\`

## 4. 恢复范围
从 V3.13D zip 恢复：src/core/*, scripts/, package.json, _ai_review/* 关键报告。

## 5. 禁止事项确认
- 没有使用 git checkout data.js
- 没有手工重建 data.js
- 没有改卡牌/调胜率/改敌人/奖励/遗物/真武阵势
- 没有改 sim-ai / balance-check / tm-diagnose
- 没有发布/git push

## 6. 恢复后测试
```text
✅ validate:data    → 0 warning
✅ smoke            → 142/0
✅ player:flow      → 12/12
✅ check            → 0
✅ build:release    → 0
```

## 7. balance-check 80x1
入门 5/6, 常规 3/6, 真武 6/6 — 与 V3.13D 完全一致。

## 8. balance-check 40x2
入门 4/6, 常规 2/6, 真武 6/6 — 与 V3.13D 完全一致。

## 9. 恢复结论
已成功恢复到 V3.13D 审核通过基线。可以进入下一步具体数值修改。
