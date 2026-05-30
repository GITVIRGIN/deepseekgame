import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { gameVersion } from "../src/core/version.js";

const root = resolve(".");
const releaseName = `xuanlu-${gameVersion.label}`;
const distRoot = join(root, "dist");
const releaseDir = join(distRoot, releaseName);

const moduleOrder = [
  "src/core/data.js",
  "src/core/types.js",
  "src/core/rng.js",
  "src/core/archetypes.js",
  "src/core/status.js",
  "src/core/goals.js",
  "src/core/nodes.js",
  "src/core/myth.js",
  "src/core/progression.js",
  "src/core/state.js",
  "src/core/economy.js",
  "src/core/rewards.js",
  "src/core/effects.js",
  "src/core/combat.js",
  "src/core/shop.js",
  "src/core/reducer.js",
  "src/core/save.js",
  "src/core/version.js",
  "src/core/cloud.js",
  "src/app/main.js",
];

await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

for (const item of ["index.html", "package.json", "VERSION.md", "assets", "scripts", "src"]) {
  await cp(join(root, item), join(releaseDir, item), { recursive: true });
}

await writeFile(join(releaseDir, "README_发布说明.md"), releaseNotes(), "utf8");
await writeFile(join(releaseDir, "start-local.bat"), startBat(), "utf8");
await writeFile(join(releaseDir, "玄箓行-单文件版.html"), await singleFileHtml(), "utf8");

console.log(releaseDir);

async function singleFileHtml() {
  const css = await readFile(join(root, "src/styles.css"), "utf8");
  const js = await bundledJs();
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#8f2f26" />
    <title>玄箓行</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <main id="app"></main>
    <script>
(() => {
"use strict";
${js}
})();
    </script>
  </body>
</html>
`;
}

async function bundledJs() {
  const parts = [];
  for (const file of moduleOrder) {
    const source = await readFile(join(root, file), "utf8");
    parts.push(`\n// ${file}\n${toScriptBody(source, file)}\n`);
  }
  return parts.join("\n");
}

function toScriptBody(source, file) {
  return source
    .replace(/^import[\s\S]*?;\s*/gm, "")
    .replace(/^export\s+const\s+/gm, "const ")
    .replace(/^export\s+async\s+function\s+/gm, "async function ")
    .replace(/^export\s+function\s+/gm, "function ")
    .replace(/^export\s+\{[\s\S]*?\};\s*/gm, "")
    .replaceAll("./assets/seal.svg", "assets/seal.svg")
    .replaceAll("/assets/seal.svg", "assets/seal.svg")
    .trimEnd() + `\n// end ${basename(file)}`;
}

function releaseNotes() {
  return `# 玄箓行发布包

版本：${gameVersion.label}

## 推荐发布方式

把整个文件夹上传到任意静态网页空间即可，例如 GitHub Pages、Netlify、Vercel、对象存储静态站点或自己的服务器。入口文件是 \`index.html\`。

## 本地试玩

桌面端如果已安装 Node.js，可以双击 \`start-local.bat\`，然后打开：

\`\`\`txt
http://127.0.0.1:5173/
\`\`\`

也可以直接打开 \`玄箓行-单文件版.html\`。单文件版更适合发给朋友快速体验；标准目录版更适合正式托管发布。

## 手机端

把发布包上传到静态网页空间后，用手机浏览器打开同一个网址即可。界面会自动按屏幕宽度切换为单列布局。

## 存档说明

存档保存在玩家自己的浏览器本地存储中，不会上传到服务器。换浏览器、换设备或清理浏览器数据后，存档不会自动同步。
`;
}

function startBat() {
  return `@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 玄箓行本地服务启动中...
echo 打开 http://127.0.0.1:5173/
node scripts\\serve.mjs 5173
pause
`;
}
