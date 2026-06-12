# Balance Sim Commands Log

## 01 validate:data
```powershell
npm run validate:data
```
Exit: 0 ✅

## 02 smoke
```powershell
npm run smoke
```
Exit: 0 ✅

## 03 player:flow
```powershell
npm run player:flow
```
Exit: 0 ✅

## 04 check
```powershell
npm run check
```
Exit: 0 ✅

## 05 balance-gate 80x1
```powershell
node scripts/balance-check.mjs --runs=80 --seeds=1 --seedBase=2026052700 --reportOut=_ai_review/BALANCE_GATE_REPORT.md --jsonOut=_ai_review/BALANCE_GATE_RESULTS.json
```
Exit: 1 ⚠ (hard FAIL gate — normal ALL FAIL, regular ALL FAIL, trueMartial ALL PASS)

## 06 balance-gate 40x2
```powershell
node scripts/balance-check.mjs --runs=40 --seeds=2 --seedBase=2026052700 --reportOut=_ai_review/BALANCE_GATE_REPORT_40x2.md --jsonOut=_ai_review/BALANCE_GATE_RESULTS_40x2.json
```
Exit: 1 ⚠ (same pattern confirmed)

## 07 sim-ai normal 30x1
```powershell
node scripts/sim-ai.mjs --mode=normal --strategy=styleAware --runs=30 --seeds=1 --seedBase=2026052700
```
Exit: 0 ✅ (直接复核 — 胜率一致)

## 08 sim-ai regular 30x1
```powershell
node scripts/sim-ai.mjs --mode=regular --strategy=styleAware --runs=30 --seeds=1 --seedBase=2026052700
```
Exit: 0 ✅ (直接复核 — 胜率一致)

## 09 sim-ai trueMartial 30x1
```powershell
node scripts/sim-ai.mjs --mode=trueMartial --strategy=styleAware --runs=30 --seeds=1 --seedBase=2026052700
```
Exit: 0 ✅ (直接复核 — 胜率一致)
