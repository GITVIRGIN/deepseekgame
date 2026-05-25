# 玄箓行

神话杂糅文字肉鸽卡牌游戏。支持桌面端和手机端浏览器游玩。

## 游玩

打开 GitHub Pages 发布地址即可游玩。普通存档保存在浏览器本地；云存档需要玩家使用自己的 GitHub Token 连接，并选择玩家ID。

## 云存档

云存档会写入玩家自己 GitHub 账号下的私有 Gist。不同玩家ID对应不同存档。

安全建议：

- 不要在云存档里填写 GitHub 密码。
- 使用 GitHub Token，并只授予 Gist 相关权限。
- 如果 Token 泄露，立即在 GitHub 设置中撤销。

## 本地开发

```bash
node scripts/serve.mjs 5173
```

## 打包

```bash
node scripts/build-release.mjs
```
