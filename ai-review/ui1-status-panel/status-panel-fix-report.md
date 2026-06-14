# V3.13N-TM-T2A5F-UI1 Status Panel Fix Report

## Problem
玩家状态 chip 折叠后缺少完整查看入口。荆棘等状态只能从战斗日志看到。

## Fix
1. 新增 getStatusPriority/getStatusDisplayName/getStatusDescription/getPlayerStatusEntries 函数
2. formatPlayerStatusChips 按优先级排序后再截取显示（mobile 2 chips, desktop 3 chips）
3. 状态 chip 和 +N chip 支持 click/touchstart(长按)/mouseenter(hover) 打开完整浮层
4. renderPlayerStatusPopover 展示所有玩家状态（名称+层数+说明）
5. ESC / 点击外部 / 关闭按钮 / 再次点击 chip 关闭浮层
6. spikes.text 新增：受到攻击时反伤敌人。层数越高，反伤越强。

## Verification
- check: PASS
- smoke: PASS (198/198)
- player_flow: PASS
- No battle values changed
- No trueMartial balance changed
- No normal/regular 9000+9000 rerun
- No trueMartial 18000 rerun

## Verdict: PASS
