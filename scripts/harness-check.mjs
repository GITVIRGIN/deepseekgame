import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(".");
const aiReviewDir = join(root, "ai-review");
const outDir = join(aiReviewDir, "harness-check");
const attemptsDir = join(outDir, "attempts");
const attemptName = "attempt-1";
const attemptDir = join(attemptsDir, attemptName);
const finalDir = join(outDir, "final");
const toolSourceDir = join(outDir, "tool-source");
const toolSourceScriptsDir = join(toolSourceDir, "scripts");
const manifestPath = join(outDir, "manifest.md");

const paths = {
  report: join(finalDir, "report.md"),
  verdict: join(finalDir, "final-verdict.txt"),
  consoleLog: join(finalDir, "console-log.txt"),
  commandLog: join(finalDir, "command-log.txt"),
  changedFiles: join(finalDir, "changed-files.txt"),
  screenshots: join(finalDir, "screenshots"),
  simulationCsv: join(finalDir, "simulation-summary.csv"),
  lightBalanceReport: join(finalDir, "light-balance-report.md"),
  lightBalanceJson: join(finalDir, "light-balance-results.json"),
  forbiddenBefore: join(finalDir, "forbidden-hashes-before.json"),
  forbiddenAfter: join(finalDir, "forbidden-hashes-after.json"),
  forbiddenDiff: join(finalDir, "forbidden-hash-diff.txt"),
};

const commandResults = [];
const screenshots = [];
const consoleEvents = [];
const issues = [];
const unableToVerify = [];
const trueMartialNotes = [];
const simulationNotes = [];
const simulationRows = [];
const harnessChangedFiles = [
  "package.json",
  "package-lock.json",
  "scripts/harness-check.mjs",
  "ai-review/harness-check/**",
];
const forbiddenExplicitFiles = [
  "scripts/sim-ai.mjs",
  "scripts/balance-check.mjs",
  "scripts/tm-diagnose.mjs",
  "scripts/smoke-tests.mjs",
  "scripts/player-flow-tests.mjs",
  "scripts/validate-data.mjs",
  "README.md",
  "VERSION.md",
  "index.html",
];
const forbiddenDirs = ["src", "assets"];

const battleChecks = {
  screenshot: null,
  hasThunderMarkText: null,
  hasThunderEightAtStart: null,
  topInfoOrder: null,
  overlapCount: null,
  overflowCount: null,
  hasLiteralBadText: null,
  notes: [],
};

let packageJson = null;
let scripts = {};
let pageStart = { ok: false, script: null, url: null, notes: [] };
let serverProcess = null;
let finalVerdict = { kind: "FAIL", reason: "Harness did not complete." };
let zipPath = null;
let forbiddenBefore = [];
let forbiddenAfter = [];
let forbiddenDiff = {
  result: "UNKNOWN",
  changed: [],
  added: [],
  deleted: [],
  mtimeOnly: [],
};

await runHarness().catch(async (error) => {
  issues.push(`Harness crashed: ${error?.stack ?? error}`);
  finalVerdict = { kind: "FAIL", reason: "Harness crashed before completing core report generation." };
  await writeConsoleLog().catch(() => {});
  await writeReport(finalVerdict).catch(() => {});
  await writeVerdict(finalVerdict).catch(() => {});
}).finally(async () => {
  await stopServer();
});

async function runHarness() {
  await resetHarnessOutput();
  await logCommand(`# Codex harness command log\nStarted: ${new Date().toISOString()}\nRoot: ${root}\nAttempt: ${attemptName}\n\n`);
  await logConsole(`# Browser console/pageerror/requestfailed log\nStarted: ${new Date().toISOString()}\n\n`);

  forbiddenBefore = await writeForbiddenSnapshot(paths.forbiddenBefore);
  await loadPackageJson();
  await runEnvironmentAndProjectChecks();
  await runBrowserChecks();
  await runSimulationChecks();
  await writeConsoleLog();
  forbiddenAfter = await writeForbiddenSnapshot(paths.forbiddenAfter);
  forbiddenDiff = await writeForbiddenDiff(forbiddenBefore, forbiddenAfter);

  finalVerdict = determineVerdict();
  await writeReport(finalVerdict);
  await writeVerdict(finalVerdict);
  await writeChangedFiles();
  await writeAttemptNotes();
  await writeToolSource();
  await writeManifest();
  zipPath = await createFinalZip();

  console.log(`CODEX_HARNESS_REPORT=${join(finalDir, "report.md")}`);
  console.log(`CODEX_HARNESS_VERDICT=${finalVerdict.kind}: ${finalVerdict.reason}`);
  console.log(`CODEX_HARNESS_ZIP=${zipPath}`);
}

async function resetHarnessOutput() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(paths.screenshots, { recursive: true });
  await mkdir(attemptDir, { recursive: true });
}

async function writeForbiddenSnapshot(targetPath) {
  const files = await collectForbiddenFiles();
  const snapshot = [];
  for (const relPath of files) {
    const fullPath = join(root, relPath);
    if (!existsSync(fullPath)) continue;
    const info = await stat(fullPath);
    const bytes = await readFile(fullPath);
    snapshot.push({
      path: toPosix(relPath),
      size: info.size,
      mtimeMs: info.mtimeMs,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  snapshot.sort((a, b) => a.path.localeCompare(b.path));
  await writeFile(targetPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

async function collectForbiddenFiles() {
  const found = new Set();
  for (const file of forbiddenExplicitFiles) {
    if (existsSync(join(root, file))) found.add(toPosix(file));
  }
  for (const dir of forbiddenDirs) {
    const fullDir = join(root, dir);
    if (!existsSync(fullDir)) continue;
    for (const file of await listFilesRecursive(fullDir)) {
      found.add(toPosix(relative(root, file)));
    }
  }
  return [...found].sort();
}

async function listFilesRecursive(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function writeForbiddenDiff(before, after) {
  const beforeMap = new Map(before.map((item) => [item.path, item]));
  const afterMap = new Map(after.map((item) => [item.path, item]));
  const diff = { result: "CLEAN", changed: [], added: [], deleted: [], mtimeOnly: [] };

  for (const [path, afterItem] of afterMap) {
    const beforeItem = beforeMap.get(path);
    if (!beforeItem) {
      diff.added.push(path);
      continue;
    }
    if (beforeItem.sha256 !== afterItem.sha256) {
      diff.changed.push(path);
    } else if (beforeItem.mtimeMs !== afterItem.mtimeMs) {
      diff.mtimeOnly.push(path);
    }
  }
  for (const path of beforeMap.keys()) {
    if (!afterMap.has(path)) diff.deleted.push(path);
  }

  if (diff.changed.length || diff.added.length || diff.deleted.length) {
    diff.result = "DIRTY";
  }

  const section = (title, values) => [
    `${title}:`,
    "",
    ...(values.length ? values.map((value) => `* ${value}`) : ["* 无"]),
    "",
  ].join("\n");

  const text = [
    "CODEX Harness Forbidden File Hash Diff",
    "",
    `Result: ${diff.result}`,
    "",
    section("Changed content", diff.changed),
    section("Added files", diff.added),
    section("Deleted files", diff.deleted),
    section("Mtime-only changes", diff.mtimeOnly),
    "Verdict impact:",
    "",
    diff.result === "CLEAN"
      ? "* CLEAN: no verdict downgrade"
      : "* DIRTY: final-verdict forced to FAIL",
    "",
  ].join("\n");
  await writeFile(paths.forbiddenDiff, text, "utf8");
  return diff;
}

async function loadPackageJson() {
  const file = join(root, "package.json");
  if (!existsSync(file)) {
    issues.push("package.json not found.");
    return;
  }
  try {
    packageJson = JSON.parse(await readFile(file, "utf8"));
    scripts = packageJson.scripts ?? {};
  } catch (error) {
    issues.push(`package.json could not be parsed: ${error.message}`);
  }
}

async function runEnvironmentAndProjectChecks() {
  await runCommand("node --version", "node", ["--version"], { timeoutMs: 30_000 });
  await runCommand("npm --version", npmCommand(), ["--version"], { timeoutMs: 30_000 });

  if (!packageJson) return;

  for (const scriptName of ["validate:data", "smoke", "player:flow", "check"]) {
    if (scripts[scriptName]) {
      await runNpmScript(scriptName, { timeoutMs: 10 * 60_000 });
    } else {
      await recordSkippedCommand(`npm run ${scriptName}`, "script not found");
    }
  }

  if (scripts.test) {
    await runCommand("npm test", npmCommand(), ["test"], { timeoutMs: 10 * 60_000 });
  } else {
    await recordSkippedCommand("npm test", "script not found");
  }

  if (scripts.lint) {
    await runNpmScript("lint", { timeoutMs: 10 * 60_000 });
  } else {
    await recordSkippedCommand("npm run lint", "script not found");
  }

  if (scripts.build) {
    if (looksReleaseLike(scripts.build)) {
      await recordSkippedCommand("npm run build", "build script looks release/deploy/dist oriented");
    } else {
      await runNpmScript("build", { timeoutMs: 10 * 60_000 });
    }
  } else if (scripts["build:release"]) {
    await recordSkippedCommand("npm run build:release", "skipped release-type build to avoid dist/publish/deploy artifacts");
  }
}

function looksReleaseLike(script) {
  return /\b(release|deploy|publish|gh-pages|upload)\b/i.test(script) || /\bdist\b/i.test(script);
}

async function recordSkippedCommand(name, reason) {
  commandResults.push({ name, skipped: true, reason });
  await logCommand(`\n===== SKIP ${name}: ${reason} =====\n`);
}

async function runNpmScript(scriptName, options = {}) {
  await runCommand(`npm run ${scriptName}`, npmCommand(), ["run", scriptName], options);
}

async function runBrowserChecks() {
  const playwright = await importPlaywright();
  if (!playwright) {
    pageStart.notes.push("Playwright could not be loaded.");
    return;
  }

  const launchResult = await launchChromium(playwright);
  if (!launchResult) {
    pageStart.notes.push("Chromium/Edge could not be launched.");
    return;
  }

  const { browser, label } = launchResult;
  pageStart.notes.push(`Browser launch path: ${label}`);

  try {
    const url = await startAndFindPageUrl();
    if (!url) {
      pageStart.notes.push("No local page URL was reachable.");
      return;
    }
    pageStart.ok = true;
    pageStart.url = url;

    await runFreshContextChecks(browser, url);
    await runUnlockedTrueMartialCheck(browser, url);
  } finally {
    await browser.close();
  }
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    issues.push(`Playwright import failed: ${error.message}`);
    return null;
  }
}

async function launchChromium(playwright) {
  const attempts = [
    ...browserExecutableLaunchAttempts(),
    { label: "playwright channel msedge", options: { headless: true, channel: "msedge" } },
    { label: "playwright bundled chromium", options: { headless: true } },
    { label: "playwright channel chrome", options: { headless: true, channel: "chrome" } },
  ];
  const errors = [];

  for (const attempt of attempts) {
    try {
      return { browser: await playwright.chromium.launch(attempt.options), label: attempt.label };
    } catch (error) {
      errors.push(`${attempt.label}: ${error.message.split("\n")[0]}`);
    }
  }

  await logCommand(`\nChromium/Edge launch attempts failed, trying short npx playwright install chromium.\n${errors.join("\n")}\n`);
  await runCommand("npx playwright install chromium", npxCommand(), ["playwright", "install", "chromium"], {
    timeoutMs: 2 * 60_000,
    logOnly: true,
  });

  try {
    return { browser: await playwright.chromium.launch({ headless: true }), label: "playwright bundled chromium after install" };
  } catch (error) {
    issues.push(`Chromium launch failed after install attempt: ${error.message}`);
    return null;
  }
}

function browserExecutableLaunchAttempts() {
  const candidates = [
    ["system msedge ProgramFiles", process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"],
    ["system msedge ProgramFiles(x86)", process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe"],
    ["system msedge LocalAppData", process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"],
    ["system chrome ProgramFiles", process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"],
    ["system chrome ProgramFiles(x86)", process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe"],
    ["system chrome LocalAppData", process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"],
  ];

  return candidates
    .filter(([, base]) => base)
    .map(([label, base, ...parts]) => ({ label, path: join(base, ...parts) }))
    .filter((candidate) => existsSync(candidate.path))
    .map((candidate) => ({
      label: `${candidate.label}: ${candidate.path}`,
      options: { headless: true, executablePath: candidate.path },
    }));
}

async function startAndFindPageUrl() {
  const command = selectStartCommand();
  if (!command) {
    pageStart.notes.push("No dev/start/preview/serve startup command found.");
    return null;
  }

  pageStart.script = command.label;
  serverProcess = spawn(command.command, command.args, { cwd: root, shell: process.platform === "win32", env: process.env });
  await logCommand(`\n===== START SERVER ${command.label}: ${command.command} ${command.args.join(" ")} =====\n`);

  const discovered = new Set();
  serverProcess.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    logCommand(text);
    for (const url of urlsFromText(text)) discovered.add(url);
  });
  serverProcess.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    logCommand(text);
    for (const url of urlsFromText(text)) discovered.add(url);
  });
  serverProcess.on("exit", (code, signal) => {
    logCommand(`\n===== SERVER EXIT code=${code} signal=${signal} =====\n`);
  });

  const fallbacks = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://localhost:3000",
    "http://localhost:8080",
  ];
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const url of [...discovered, ...fallbacks]) {
      if (await canFetch(url)) return url;
    }
    await sleep(500);
  }
  return null;
}

function selectStartCommand() {
  for (const scriptName of ["dev", "start", "preview"]) {
    if (scripts[scriptName]) return { label: `npm run ${scriptName}`, command: npmCommand(), args: ["run", scriptName] };
  }
  if (scripts.serve) return { label: "npm run serve", command: npmCommand(), args: ["run", "serve"] };
  if (existsSync(join(root, "scripts", "serve.mjs"))) return { label: "node scripts/serve.mjs 5173", command: process.execPath, args: ["scripts/serve.mjs", "5173"] };
  return null;
}

async function runFreshContextChecks(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "zh-CN" });
  await context.addInitScript(() => {
    window.localStorage?.clear();
    window.sessionStorage?.clear();
  });
  const page = await context.newPage();
  wirePageDiagnostics(page);

  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await screenshot(page, "01-home.png", "Home page");
  await screenshot(page, "02-difficulty.png", "Difficulty entry area");
  await checkTrueMartialEntry(page, "fresh", "06-true-martial-entry-fresh.png");

  const started = await clickStartRun(page);
  if (!started) {
    unableToVerify.push("Could not start a run from the home page using visible button text or role selectors.");
    await context.close();
    return;
  }

  await page.waitForTimeout(500);
  if (await enterBattleIfNeeded(page)) {
    await screenshot(page, "03-battle-first-turn.png", "Battle first turn");
    await inspectBattleFirstTurn(page);
  } else {
    unableToVerify.push("Could not automatically enter the first battle from the route page.");
  }

  if (await advanceToReward(page)) {
    await screenshot(page, "04-reward.png", "Reward page");
    if (await advanceToShop(page)) {
      await screenshot(page, "05-shop.png", "Shop page");
    } else {
      unableToVerify.push("Could not automatically reach the shop page from the reward/route flow.");
    }
  } else {
    unableToVerify.push("Could not automatically reach the reward page within the light UI navigation budget.");
  }

  await context.close();
}

async function runUnlockedTrueMartialCheck(browser, url) {
  const unlockedState = await createUnlockedState();
  if (!unlockedState) {
    unableToVerify.push("Could not safely identify save structure for unlocked True Martial context.");
    return;
  }

  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "zh-CN" });
  await context.addInitScript((stateJson) => {
    window.localStorage?.clear();
    window.sessionStorage?.clear();
    window.localStorage?.setItem("xuanlu-ds-game-state", stateJson);
  }, JSON.stringify(unlockedState));
  const page = await context.newPage();
  wirePageDiagnostics(page);
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await checkTrueMartialEntry(page, "unlocked", "07-true-martial-entry-unlocked.png");
  await context.close();
}

async function createUnlockedState() {
  try {
    const stateModule = await import(pathToFileURL(join(root, "src", "core", "state.js")).href);
    const state = stateModule.createInitialState();
    const normalRelics = stateModule.normalUnlockRelics().map((relic) => relic.id);
    state.phase = "home";
    state.run = null;
    state.meta = {
      ...state.meta,
      collectedRelics: normalRelics,
      mythMastery: { harnessA: 3, harnessB: 3, harnessC: 3 },
      soul: 0,
      totalRuns: 0,
      wins: 0,
      lossStreak: 0,
      talents: state.meta?.talents ?? {},
    };
    state.message = "Codex harness unlocked True Martial check.";
    return state;
  } catch (error) {
    issues.push(`Unlocked True Martial state creation failed: ${error.message}`);
    return null;
  }
}

async function checkTrueMartialEntry(page, mode, fileName) {
  const text = await bodyText(page);
  const visible = /真武/.test(text);
  trueMartialNotes.push(`${mode}: True Martial entry ${visible ? "visible" : "not visible"}.`);
  if (mode === "fresh" && !visible) {
    trueMartialNotes.push("fresh: entry hidden is informational only because fresh context is expected to be locked.");
  }
  if (mode === "unlocked" && !visible) {
    issues.push("Unlocked-save True Martial entry was not visible.");
  }
  await screenshot(page, fileName, `True Martial entry ${mode}`);
}

function wirePageDiagnostics(page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleEvents.push(`[console.error] ${msg.text()}`);
  });
  page.on("pageerror", (error) => {
    consoleEvents.push(`[pageerror] ${error.stack ?? error.message}`);
  });
  page.on("requestfailed", (request) => {
    consoleEvents.push(`[requestfailed] ${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`);
  });
}

async function screenshot(page, fileName, label) {
  const fullPath = join(paths.screenshots, fileName);
  try {
    await page.screenshot({ path: fullPath, fullPage: true });
    screenshots.push({ file: `screenshots/${fileName}`, label, ok: true });
    return true;
  } catch (error) {
    screenshots.push({ file: `screenshots/${fileName}`, label, ok: false, error: error.message });
    issues.push(`Screenshot failed for ${fileName}: ${error.message}`);
    return false;
  }
}

async function clickStartRun(page) {
  if (await clickButtonByPatterns(page, [/入门难度/, /开始/, /新游戏/])) return true;
  const primary = page.locator("button.primary").first();
  if (await primary.count()) {
    await primary.click();
    return true;
  }
  return false;
}

async function enterBattleIfNeeded(page) {
  for (let step = 0; step < 15; step += 1) {
    if (await isBattlePage(page)) return true;
    if (await isRoutePage(page) && await clickButtonByPatterns(page, [/进入/])) {
      await page.waitForTimeout(400);
      continue;
    }
    await page.waitForTimeout(200);
  }
  return await isBattlePage(page);
}

async function advanceToReward(page) {
  // CQA-P4-002: increased budget from 80→120 for reward reachability
  for (let step = 0; step < 120; step += 1) {
    const text = await bodyText(page);
    if (await isRewardPage(page)) return true;
    if (/游戏结束|通关|失败/.test(text)) return false;

    if (await isRoutePage(page)) {
      await clickButtonByPatterns(page, [/进入/]);
      await page.waitForTimeout(300);
      continue;
    }

    if (await page.locator(".enemy button").count()) {
      await page.locator(".enemy button").first().click().catch(() => {});
    }

    const card = page.locator("button.game-card:not(.disabled)").first();
    if (await card.count()) {
      await card.click().catch(() => {});
      await page.waitForTimeout(120);
      continue;
    }

    if (await clickButtonByPatterns(page, [/结束回合/])) {
      await page.waitForTimeout(180);
      continue;
    }

    const endTurn = page.locator(".hand-head button.danger").first();
    if (await endTurn.count()) {
      await endTurn.click().catch(() => {});
      await page.waitForTimeout(180);
      continue;
    }

    await page.waitForTimeout(200);
  }
  return false;
}

async function advanceToShop(page) {
  // CQA-P4-002: improved reward selection + shop navigation
  await clickButtonByPatterns(page, [/跳过拿牌/, /跳过/, /获得 .* 金/, /回复 .* 点生命/, /选择/, /拿下/]);
  await page.waitForTimeout(400);
  for (let step = 0; step < 40; step += 1) {
    const text = await bodyText(page);
    if (/山路商店|离开商店|购买|金钱不足/.test(text)) return true;
    if (await clickButtonByPatterns(page, [/逛商店/, /商店/])) {
      await page.waitForTimeout(300);
      continue;
    }
    if (await clickButtonByPatterns(page, [/进入/])) {
      await page.waitForTimeout(300);
      continue;
    }
    await page.waitForTimeout(200);
  }
  return false;
}

async function inspectBattleFirstTurn(page) {
  battleChecks.screenshot = "screenshots/03-battle-first-turn.png";
  const text = await bodyText(page);
  battleChecks.hasThunderMarkText = /雷痕/.test(text);
  battleChecks.hasThunderEightAtStart = /雷痕\s*8|雷痕[：:]\s*8|雷痕.*8\s*层/.test(text);
  battleChecks.hasLiteralBadText = /\b(null|undefined|NaN)\b/.test(text);
  if (battleChecks.hasLiteralBadText) {
    battleChecks.notes.push("Battle page contains literal null/undefined/NaN text; inspect the first-turn screenshot.");
    issues.push("Battle first-turn UI contains literal null/undefined/NaN text in visible page content.");
  }

  const layout = await page.evaluate(() => {
    const vitals = document.querySelector(".player-vitals-row");
    // V3.13M-R1-HARNESS-UI: use > child selector to avoid false positive from .stat nested inside .player-gold-slot
    const boxes = [...document.querySelectorAll(".player-vitals-row > .stat, .player-vitals-row > .player-status-chip-row, .player-vitals-row > .player-gold-slot")]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: node.textContent ?? "",
          className: node.className ?? "",
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
    let overlapCount = 0;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlapCount += 1;
      }
    }
    const overflowNodes = [...document.querySelectorAll("button, .stat, .status-chip-inline, .enemy, .game-card")]
      .filter((node) => node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2)
      .map((node) => (node.textContent ?? "").trim().slice(0, 60));
    return {
      overlapCount,
      overflowCount: overflowNodes.length,
      overflowSamples: overflowNodes.slice(0, 5),
      childClasses: vitals ? [...vitals.children].map((node) => node.className || node.tagName).join(" -> ") : "",
    };
  }).catch((error) => ({ error: error.message }));

  battleChecks.overlapCount = layout.overlapCount ?? null;
  battleChecks.overflowCount = layout.overflowCount ?? null;
  battleChecks.topInfoOrder = layout.childClasses?.includes("player-status-chip-row") && layout.childClasses?.includes("player-gold-slot")
    ? `DOM order captured: ${layout.childClasses}`
    : "Could not confirm player status/gold DOM order automatically.";
  if (layout.error) battleChecks.notes.push(`Layout probe failed: ${layout.error}`);
  if (layout.overflowSamples?.length) battleChecks.notes.push(`Overflow samples: ${layout.overflowSamples.join(" | ")}`);
}

async function runSimulationChecks() {
  const matchingScripts = Object.entries(scripts)
    .filter(([name, value]) => /sim|simulate|balance|ai-sim/i.test(`${name} ${value}`))
    .map(([name]) => name);
  simulationNotes.push(`Matching package scripts: ${matchingScripts.length ? matchingScripts.join(", ") : "none"}`);

  if (existsSync(join(root, "scripts", "balance-check.mjs"))) {
    const balance = await runCommand("light balance-check runs=10", process.execPath, [
      "scripts/balance-check.mjs",
      "--runs=10",
      "--seeds=1",
      "--seedBase=2026052700",
      `--reportOut=${paths.lightBalanceReport}`,
      `--jsonOut=${paths.lightBalanceJson}`,
    ], { timeoutMs: 5 * 60_000 });
    simulationNotes.push(`light balance-check exit code: ${balance.exitCode}`);
    simulationNotes.push("light balance-check is non-gating smoke; exit code 1 may indicate balance gate failure under tiny sample and is not used as formal balance evidence.");
    simulationRows.push({
      command: "light balance-check runs=10",
      exitCode: balance.exitCode,
      nonGating: true,
      rawWinRate: "N/A",
      winRatePercent: "N/A",
      runs: 10,
      seeds: 1,
      mode: "all",
      profile: "all",
      notes: existsSync(paths.lightBalanceJson) || existsSync(paths.lightBalanceReport)
        ? "non-gating smoke; output files generated"
        : "non-gating smoke; no output files detected",
    });
  }

  if (existsSync(join(root, "scripts", "sim-ai.mjs"))) {
    const sim = await runCommand("light sim-ai normal physical runs=10", process.execPath, [
      "scripts/sim-ai.mjs",
      "--mode=normal",
      "--profile=physical",
      "--strategy=styleAware",
      "--runs=10",
      "--seeds=1",
      "--seedBase=2026052700",
      "--json",
    ], { timeoutMs: 5 * 60_000 });
    if (sim.exitCode === 0) {
      try {
        const parsed = JSON.parse(sim.stdout);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        for (const row of rows) {
          const formatted = formatWinRate(row.winRate);
          simulationRows.push({
            command: "light sim-ai normal physical runs=10",
            exitCode: sim.exitCode,
            nonGating: true,
            rawWinRate: row.winRate ?? "N/A",
            winRatePercent: formatted,
            mode: row.mode,
            profile: row.profile,
            runs: row.runs,
            seeds: row.seeds,
            avgFloor: row.avgFloor ?? "N/A",
            notes: "non-gating smoke",
          });
        }
        await writeSimulationCsv();
      } catch (error) {
        simulationNotes.push(`sim-ai JSON parse failed: ${error.message}`);
      }
    } else {
      simulationNotes.push(`light sim-ai failed with exit code ${sim.exitCode}`);
    }
  }

  if (!existsSync(join(root, "scripts", "balance-check.mjs")) && !existsSync(join(root, "scripts", "sim-ai.mjs"))) {
    simulationNotes.push("No balance-check.mjs or sim-ai.mjs found.");
  }
}

async function writeSimulationCsv() {
  if (!simulationRows.length) return;
  const lines = ["command,exitCode,nonGating,rawWinRate,winRatePercent,runs,seeds,mode,profile,notes"];
  for (const row of simulationRows) {
    lines.push([
      csv(row.command),
      row.exitCode,
      row.nonGating,
      row.rawWinRate,
      csv(row.winRatePercent),
      row.runs,
      row.seeds,
      row.mode,
      row.profile,
      csv(row.notes),
    ].join(","));
  }
  await writeFile(paths.simulationCsv, `${lines.join("\n")}\n`, "utf8");
}

function formatWinRate(value) {
  if (value === null || value === undefined || value === "N/A") return "N/A";
  if (typeof value === "string" && value.trim().endsWith("%")) return value.trim();
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  const percent = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;
  return `${percent.toFixed(1)}%`;
}

function csv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function determineVerdict() {
  const commandFailures = commandResults.filter((result) => !result.skipped && (result.exitCode !== 0 || result.timedOut) && !/^light balance-check/.test(result.name));
  const hasCoreScreens = ["screenshots/01-home.png", "screenshots/02-difficulty.png", "screenshots/03-battle-first-turn.png"]
    .every((file) => screenshots.some((shot) => shot.file === file && shot.ok));
  const businessPollution = forbiddenDiff.result === "DIRTY";

  if (businessPollution) return { kind: "FAIL", reason: "Forbidden file content hash changed during harness run." };
  if (issues.some((item) => /package\.json not found|could not be parsed|Harness crashed/i.test(item))) return { kind: "FAIL", reason: "Core harness setup failed." };
  if (commandFailures.length) return { kind: "FAIL", reason: "One or more required base checks failed." };
  if (!pageStart.ok || !hasCoreScreens) return { kind: "FAIL", reason: "Page startup or core screenshot capture failed." };
  if (consoleEvents.length) return { kind: "PARTIAL", reason: "Browser console/page/request errors were captured." };
  if (issues.length || unableToVerify.length || !simulationRows.length) return { kind: "PARTIAL", reason: "Harness completed, but some UI checks or simulations require human review." };
  return { kind: "PASS", reason: "Base checks, page startup, key screenshots, console capture, light simulation, and harness pollution checks passed." };
}

async function writeReport(verdict) {
  const commandRows = commandResults.map((result) => {
    if (result.skipped) return `| ${md(result.name)} | SKIPPED | ${md(result.reason)} |`;
    return `| ${md(result.name)} | ${result.exitCode}${result.timedOut ? " (timeout)" : ""} | ${result.exitCode === 0 && !result.timedOut ? "PASS" : "FAIL"} |`;
  }).join("\n");
  const screenshotRows = screenshots.length
    ? screenshots.map((shot) => `| ${shot.file} | ${md(shot.label)} | ${shot.ok ? "OK" : `FAILED: ${md(shot.error ?? "")}`} |`).join("\n")
    : "| none | none | no screenshots generated |";
  const consoleSummary = consoleEvents.length
    ? consoleEvents.slice(0, 20).map((line) => `- ${md(line)}`).join("\n")
    : "- No console error, pageerror, or requestfailed events captured.";
  const simulationSummary = simulationRows.length
    ? simulationRows.map((row) => `| ${md(row.command)} | ${row.exitCode} | ${row.nonGating ? "yes" : "no"} | ${row.rawWinRate} | ${row.winRatePercent} | ${row.runs} | ${row.seeds} | ${row.mode} | ${row.profile} | ${md(row.notes)} |`).join("\n")
    : "| none | none | none | none | none | none | none | none | none | none |";
  const issueText = issues.length ? issues.map((item) => `- ${md(item)}`).join("\n") : "- No harness-level issues recorded.";
  const unableText = unableToVerify.length ? unableToVerify.map((item) => `- ${md(item)}`).join("\n") : "- No missing automatic checks recorded.";

  const report = `# Codex Harness Check Report

## 1. 本轮结论

${verdict.kind}: ${verdict.reason}

## 2. 检查范围

- Base command checks from package.json.
- Local page startup via dev/start/preview, then serve fallback when available.
- Playwright chromium-compatible browser screenshots and diagnostics.
- Fresh and unlocked True Martial entry checks.
- First-turn battle DOM and text probes.
- Light balance/sim checks within a short runtime budget.
- No business logic, card values, relics, enemies, difficulty tuning, reward logic, or deployment paths are modified by this harness.

Metadata:

- package.json: ${packageJson ? "found" : "missing"}
- Detected scripts: ${Object.keys(scripts).sort().join(", ") || "none"}
- Adopted attempt: ${attemptName}

## 3. 命令检查结果

| Command | Exit code | Result |
| --- | ---: | --- |
${commandRows}

Full stdout/stderr is written to command-log.txt.

## 4. 页面启动结果

- Startup command: ${pageStart.script ?? "not started"}
- URL: ${pageStart.url ?? "not available"}
- Result: ${pageStart.ok ? "started" : "failed"}
- Notes: ${pageStart.notes.length ? pageStart.notes.map(md).join("; ") : "none"}

## 5. 截图清单

| Screenshot | Label | Status |
| --- | --- | --- |
${screenshotRows}

## 6. console error 摘要

${consoleSummary}

Full browser diagnostics are written to console-log.txt.

## 7. 战斗首回合异常检查

- Evidence screenshot: ${battleChecks.screenshot ?? "not available"}
- 首回合敌人是否显示雷痕: ${formatMaybe(battleChecks.hasThunderMarkText)}
- 是否出现“雷痕 8 层”或类似异常开局状态: ${formatMaybe(battleChecks.hasThunderEightAtStart)}
- 玩家状态栏是否和血量、金钱重叠: ${battleChecks.overlapCount === null ? "not checked" : battleChecks.overlapCount === 0 ? "no overlap detected by DOM boxes" : `${battleChecks.overlapCount} overlapping box pair(s) detected`}
- 顶部信息是否大致符合“血量 -> 玩家状态 -> 金钱”: ${battleChecks.topInfoOrder ?? "not checked"}
- 是否有明显文字溢出、按钮遮挡、状态错位: ${battleChecks.overflowCount === null ? "not checked" : battleChecks.overflowCount === 0 ? "no overflow detected by DOM probe" : `${battleChecks.overflowCount} possible overflow node(s) detected`}
- 页面是否出现 literal null / undefined / NaN 文本: ${formatMaybe(battleChecks.hasLiteralBadText)}
- Notes: ${battleChecks.notes.length ? battleChecks.notes.map(md).join("; ") : "none"}

## 8. 真武入口检查

${trueMartialNotes.length ? trueMartialNotes.map((item) => `- ${md(item)}`).join("\n") : "- True Martial entry was not checked."}

Fresh screenshot: screenshots/06-true-martial-entry-fresh.png

Unlocked screenshot: screenshots/07-true-martial-entry-unlocked.png

## 9. 模拟结果摘要

Simulation notes:

${simulationNotes.map((item) => `- ${md(item)}`).join("\n") || "- none"}

CSV output: ${simulationRows.length ? "simulation-summary.csv" : "not generated"}

Light balance report: ${existsSync(paths.lightBalanceReport) ? "light-balance-report.md" : "not generated"}

Light balance JSON: ${existsSync(paths.lightBalanceJson) ? "light-balance-results.json" : "not generated"}

| Command | Exit code | Non-gating | rawWinRate | winRatePercent | Runs | Seeds | Mode | Profile | Notes |
| --- | ---: | --- | ---: | --- | ---: | ---: | --- | --- | --- |
${simulationSummary}

## 10. light balance-check 说明

light balance-check is non-gating smoke.

It is not formal balance evidence.

Formal balance evidence still comes from dedicated balance-check runs requested by GPT.

If light balance-check returns exit code 1 under a tiny sample, this may indicate balance gate failure under tiny sample and is not used as formal balance evidence.

## 11. 发现的问题

${issueText}

## 12. 未能自动验证的项目

${unableText}

## 13. 业务代码污染检查

- Harness-managed changed files are listed in changed-files.txt.
- Forbidden before snapshot: forbidden-hashes-before.json
- Forbidden after snapshot: forbidden-hashes-after.json
- Forbidden diff: forbidden-hash-diff.txt
- Hash diff result: ${forbiddenDiff.result}
- Business code modified by harness: ${forbiddenDiff.result === "DIRTY" ? "yes" : "no"}.
- Banned scripts modified by harness: ${forbiddenDiff.result === "DIRTY" ? "yes" : "no"}.
- Raw repository status may include pre-existing development changes and is recorded in command-log.txt, not treated as harness-introduced pollution.

## 14. 包体去重说明

- Full screenshots are kept only under final/screenshots/.
- attempts/attempt-1 does not duplicate the full screenshots directory.
- attempts/attempt-1 keeps only small files and notes.
- This final zip is the only package that should be submitted to the user for this run.

## 15. 后续建议

- Keep this harness as the fixed evidence collector after each DeepSeek code change.
- Treat PARTIAL as “human review needed” rather than an automatic gameplay failure.
- Add stable UI selectors in a future UI-only pass if deeper reward/shop navigation must become deterministic.
`;

  await writeFile(paths.report, report, "utf8");
}

function formatMaybe(value) {
  if (value === null || value === undefined) return "not checked";
  return value ? "yes" : "no";
}

function md(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

async function writeVerdict(verdict) {
  await writeFile(paths.verdict, `${verdict.kind}\n${verdict.reason}\n`, "utf8");
}

async function writeConsoleLog() {
  await writeFile(paths.consoleLog, consoleEvents.length ? `${consoleEvents.join("\n")}\n` : "No console error, pageerror, or requestfailed events captured.\n", "utf8");
}

async function writeChangedFiles() {
  await runCommand("git status --short", gitCommand(), ["status", "--short"], { timeoutMs: 60_000, logOnly: true });
  const text = [
    "Harness-managed files added or modified this round:",
    ...harnessChangedFiles.map((file) => `- ${file}`),
    "",
    "Business code modified by harness: no",
    "Banned scripts modified by harness: no",
    `Forbidden hash diff result: ${forbiddenDiff.result}`,
    "Hash evidence files:",
    "- forbidden-hashes-before.json",
    "- forbidden-hashes-after.json",
    "- forbidden-hash-diff.txt",
    "",
    "Raw git status --short was captured in command-log.txt for context.",
    "It is not repeated here because this file records harness-managed changes for this run.",
  ].join("\n");
  await writeFile(paths.changedFiles, `${text}\n`, "utf8");
}

async function writeAttemptNotes() {
  await mkdir(attemptDir, { recursive: true });
  const note = `# Attempt Notes

Attempt: ${attemptName}

Final adopted run: yes

Package dedupe:

- Full screenshots are stored only in final/screenshots/.
- attempts/${attemptName}/ does not duplicate the screenshots directory.
- attempts/${attemptName}/ does not duplicate light-balance JSON/report artifacts.

Final verdict: ${finalVerdict.kind} - ${finalVerdict.reason}

Forbidden hash diff: ${forbiddenDiff.result}
`;
  await writeFile(join(attemptDir, "notes.md"), note, "utf8");

  const smallFiles = [
    ["report.md", paths.report],
    ["final-verdict.txt", paths.verdict],
    ["command-log.txt", paths.commandLog],
    ["console-log.txt", paths.consoleLog],
  ];
  for (const [name, source] of smallFiles) {
    if (existsSync(source)) await cp(source, join(attemptDir, name));
  }
}

async function writeToolSource() {
  await rm(toolSourceDir, { recursive: true, force: true });
  await mkdir(toolSourceScriptsDir, { recursive: true });
  await cp(join(root, "scripts", "harness-check.mjs"), join(toolSourceScriptsDir, "harness-check.mjs"));
  await cp(join(root, "package.json"), join(toolSourceDir, "package.json"));
  if (existsSync(join(root, "package-lock.json"))) {
    await cp(join(root, "package-lock.json"), join(toolSourceDir, "package-lock.json"));
  }
}

async function writeManifest() {
  const shotList = screenshots.filter((shot) => shot.ok).map((shot) => `- ${shot.file}`).join("\n") || "- none";
  const toolFiles = [
    "- tool-source/scripts/harness-check.mjs",
    "- tool-source/package.json",
    existsSync(join(toolSourceDir, "package-lock.json")) ? "- tool-source/package-lock.json" : null,
  ].filter(Boolean).join("\n");
  const manifest = `# Codex Harness Manifest

1. Final adopted run: ${attemptName}.
2. final-verdict: ${finalVerdict.kind} - ${finalVerdict.reason}
3. Screenshots generated:
${shotList}
4. Console error captured: ${consoleEvents.length ? "yes" : "no"}.
5. Simulation executed: ${simulationRows.length || existsSync(paths.lightBalanceJson) ? "yes" : "no"}.
6. light balance-check non-gating: yes. It is smoke only and not formal balance evidence.
7. forbidden hash diff: ${forbiddenDiff.result}.
8. Tool files added or modified this round:
${harnessChangedFiles.map((file) => `- ${file}`).join("\n")}
9. Business code modified by harness: ${forbiddenDiff.result === "DIRTY" ? "yes" : "no"}; this is based on forbidden hash diff.
10. tool-source includes:
${toolFiles}
11. Package dedupe: full screenshots are kept only under final/screenshots/; attempts/${attemptName}/ does not duplicate full screenshots.
12. This zip is the only package that should be submitted to the user for this harness run.
`;
  await writeFile(manifestPath, manifest, "utf8");
}

async function createFinalZip() {
  await mkdir(aiReviewDir, { recursive: true });
  const oldZips = await listHarnessZips();
  for (const file of oldZips) await rm(file, { force: true });

  const target = join(aiReviewDir, `codex-harness-check-final-${timestampForFile()}.zip`);
  const script = [
    "$ErrorActionPreference = 'Stop';",
    "Add-Type -AssemblyName System.IO.Compression;",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
    `$zipPath = ${psQuote(target)};`,
    `$base = (Resolve-Path -LiteralPath ${psQuote(outDir)}).Path.TrimEnd('\\');`,
    "$fs = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew);",
    "$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create);",
    "try {",
    "  Get-ChildItem -LiteralPath $base -Recurse -File | ForEach-Object {",
    "    if ($_.Name -like '*.zip') { return }",
    "    $relative = $_.FullName.Substring($base.Length + 1).Replace('\\', '/');",
    "    $entry = 'harness-check/' + $relative;",
    "    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null;",
    "  }",
    "} finally { $zip.Dispose(); $fs.Dispose(); }",
  ].join(" ");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const result = await runCommand("Compress final harness zip", "powershell.exe", ["-NoProfile", "-EncodedCommand", encoded], { timeoutMs: 2 * 60_000, logOnly: true });
  if (result.exitCode !== 0 || !existsSync(target)) {
    issues.push(`Zip creation failed: ${result.stderr || result.stdout}`);
  }
  return target;
}

async function listHarnessZips() {
  if (!existsSync(aiReviewDir)) return [];
  const names = await import("node:fs/promises").then((fs) => fs.readdir(aiReviewDir));
  return names
    .filter((name) => /^codex-harness-check.*\.zip$/i.test(name))
    .map((name) => join(aiReviewDir, name));
}

async function runCommand(name, command, args = [], options = {}) {
  const { timeoutMs = 5 * 60_000, logOnly = false } = options;
  await logCommand(`\n===== ${name} =====\n$ ${command} ${args.join(" ")}\n`);

  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, shell: process.platform === "win32", env: process.env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child).catch(() => child.kill("SIGTERM"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      logCommand(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      logCommand(text);
    });
    child.on("error", (error) => {
      stderr += `${error.stack ?? error.message}\n`;
      logCommand(`${error.stack ?? error.message}\n`);
    });
    child.on("close", async (code) => {
      clearTimeout(timer);
      const exitCode = timedOut ? -1 : code ?? 0;
      await logCommand(`\n===== EXIT ${name}: ${exitCode}${timedOut ? " (timeout)" : ""} =====\n`);
      const result = { name, exitCode, timedOut, stdout, stderr };
      if (!logOnly) commandResults.push(result);
      resolve(result);
    });
  });
}

async function stopServer() {
  if (!serverProcess || serverProcess.killed) return;
  await killProcessTree(serverProcess);
}

async function killProcessTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { shell: false });
      killer.on("close", resolve);
      killer.on("error", resolve);
    });
  } else {
    child.kill("SIGTERM");
  }
}

async function canFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function urlsFromText(text) {
  return [...text.matchAll(/https?:\/\/[^\s'"<>]+/g)].map((match) => match[0].replace(/[),.]+$/, ""));
}

async function clickButtonByPatterns(page, patterns) {
  for (const pattern of patterns) {
    const button = page.getByRole("button", { name: pattern }).first();
    if (await button.count()) {
      await button.click().catch(() => {});
      return true;
    }
  }
  return false;
}

async function bodyText(page) {
  try {
    return await page.locator("body").innerText({ timeout: 2_000 });
  } catch {
    return "";
  }
}

async function isBattlePage(page) {
  if (await page.locator(".hand-area").count()) return true;
  const text = await bodyText(page);
  return /结束回合/.test(text) && /手牌/.test(text);
}

async function isRewardPage(page) {
  if (await page.locator(".reward-view").count()) return true;
  const text = await bodyText(page);
  return /跳过拿牌|刷新机缘|已清净/.test(text);
}

async function isRoutePage(page) {
  if (await page.locator(".route-view").count()) return true;
  return /选择下一步/.test(await bodyText(page));
}

async function logCommand(text) {
  await appendFile(paths.commandLog, text, "utf8").catch(() => {});
}

async function logConsole(text) {
  await appendFile(paths.consoleLog, text, "utf8").catch(() => {});
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function gitCommand() {
  return process.platform === "win32" ? "git.exe" : "git";
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toPosix(value) {
  return String(value).replace(/\\/g, "/");
}

function timestampForFile() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
