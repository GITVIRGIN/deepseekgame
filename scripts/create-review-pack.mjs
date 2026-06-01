import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const reviewRoot = path.join(root, "ai-review");
const latestDir = path.join(reviewRoot, "latest");

fs.rmSync(latestDir, { recursive: true, force: true });
fs.mkdirSync(latestDir, { recursive: true });

function writeReviewFile(relativePath, content) {
  const target = path.join(latestDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function run(command, timeoutMs = 10 * 60 * 1000) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 100 * 1024 * 1024,
  });

  return {
    command,
    status: result.status,
    signal: result.signal,
    error: result.error ? result.error.message : null,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    startedAt,
    endedAt: new Date().toISOString(),
    ok: result.status === 0,
  };
}

function commandExists(command) {
  const probe = process.platform === "win32" ? `where ${command}` : `command -v ${command}`;
  const result = spawnSync(probe, {
    cwd: root,
    shell: true,
    encoding: "utf8",
  });
  return result.status === 0;
}

function npmScriptExists(scriptName) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return Boolean(pkg.scripts && pkg.scripts[scriptName]);
  } catch {
    return false;
  }
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const commands = [
  "node --version",
  "npm --version",
];

if (npmScriptExists("validate:data")) commands.push("npm run validate:data");
if (npmScriptExists("smoke")) commands.push("npm run smoke");
if (npmScriptExists("check")) commands.push("npm run check");
if (npmScriptExists("build:release")) commands.push("npm run build:release");
if (fileExists("scripts/simulate-runs.mjs")) commands.push("node scripts/simulate-runs.mjs --runs=50 --json");
if (fileExists("scripts/sim-ai.mjs")) commands.push("node scripts/sim-ai.mjs");
if (npmScriptExists("ai:rc-check")) commands.push("npm run ai:rc-check");
if (npmScriptExists("ai:sim-consistency")) commands.push("npm run ai:sim-consistency");

const commandResults = commands.map((command) => {
  const timeout = command.includes("simulate-runs") || command.includes("sim-ai") || command.includes("ai:rc-check")
    ? 30 * 60 * 1000
    : 10 * 60 * 1000;
  return run(command, timeout);
});

const testOutputText = commandResults.map((item) => {
  return [
    `===== ${item.command} =====`,
    `startedAt: ${item.startedAt}`,
    `endedAt: ${item.endedAt}`,
    `status: ${item.status}`,
    `signal: ${item.signal ?? ""}`,
    `ok: ${item.ok}`,
    item.error ? `error: ${item.error}` : "",
    "",
    "--- stdout ---",
    item.stdout,
    "",
    "--- stderr ---",
    item.stderr,
    "",
  ].join("\n");
}).join("\n\n");

writeReviewFile("test-output.txt", testOutputText);
writeReviewFile("test-output.json", JSON.stringify(commandResults, null, 2));

const gitSections = [];

if (commandExists("git")) {
  const gitCommands = [
    "git rev-parse --show-toplevel",
    "git branch --show-current",
    "git status --short",
    "git diff --stat",
    "git diff -- .",
    "git log --oneline -n 10",
  ];

  for (const command of gitCommands) {
    const result = run(command, 5 * 60 * 1000);
    gitSections.push([
      `===== ${command} =====`,
      result.stdout,
      result.stderr,
    ].join("\n"));
  }

  writeReviewFile("git-diff.patch", run("git diff -- .", 5 * 60 * 1000).stdout);
  writeReviewFile("changed-files.txt", run("git status --short", 5 * 60 * 1000).stdout);
} else {
  gitSections.push("git is not available.");
  writeReviewFile("git-diff.patch", "");
  writeReviewFile("changed-files.txt", "git is not available.\n");
}

writeReviewFile("git-output.txt", gitSections.join("\n\n"));

const ignoredDirs = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".cache",
  "logs",
  "ai-review",
]);

function shouldIgnore(relativePath, dirent) {
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  if (parts.some((part) => ignoredDirs.has(part))) return true;

  const name = dirent.name;
  if (name.endsWith(".log")) return true;
  if (name.endsWith(".zip")) return true;
  if (name === ".env" || name.startsWith(".env.")) return true;

  return false;
}

function walk(dir, prefix = "") {
  const output = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    if (shouldIgnore(relativePath, entry)) continue;

    output.push(relativePath + (entry.isDirectory() ? "/" : ""));

    if (entry.isDirectory()) {
      output.push(...walk(path.join(dir, entry.name), relativePath));
    }
  }

  return output;
}

writeReviewFile("file-tree.txt", walk(root).join("\n") + "\n");

const importantFiles = [
  "package.json",
  "README.md",
  "VERSION.md",
  "src/core/version.js",
  "src/core/state.js",
  "src/core/reducer.js",
  "src/core/combat.js",
  "src/core/effects.js",
  "src/core/data.js",
  "src/core/save.js",
  "src/core/cloud.js",
  "src/app/main.js",
  "scripts/validate-data.mjs",
  "scripts/smoke-tests.mjs",
  "scripts/simulate-runs.mjs",
  "scripts/sim-ai.mjs",
];

const snapshots = [];

for (const relativePath of importantFiles) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) continue;

  snapshots.push([
    `===== ${relativePath} =====`,
    fs.readFileSync(fullPath, "utf8"),
  ].join("\n"));
}

writeReviewFile("important-files-snapshot.txt", snapshots.join("\n\n"));

const failedCommands = commandResults.filter((item) => !item.ok);

writeReviewFile("REVIEW_SUMMARY.md", [
  "# AI Review Pack",
  "",
  `Generated at: ${new Date().toISOString()}`,
  "",
  "## Command Summary",
  "",
  ...commandResults.map((item) => `- ${item.ok ? "✅" : "❌"} \`${item.command}\` status=${item.status}`),
  "",
  "## Failed Commands",
  "",
  failedCommands.length
    ? failedCommands.map((item) => `- \`${item.command}\``).join("\n")
    : "None.",
  "",
  "## Files Included",
  "",
  "- Full project source, excluding node_modules, .git, dist/build/cache/log/env/zip artifacts.",
  "- `_ai_review/test-output.txt`",
  "- `_ai_review/test-output.json`",
  "- `_ai_review/git-diff.patch`",
  "- `_ai_review/git-output.txt`",
  "- `_ai_review/changed-files.txt`",
  "- `_ai_review/file-tree.txt`",
  "- `_ai_review/important-files-snapshot.txt`",
  "",
].join("\n"));

function copyProject(src, dest, prefix = "") {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    if (shouldIgnore(relativePath, entry)) continue;

    const sourcePath = path.join(src, entry.name);
    const targetPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyProject(sourcePath, targetPath, relativePath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

const stageDir = path.join(os.tmpdir(), `deepseekgame-review-${timestamp}`);
fs.rmSync(stageDir, { recursive: true, force: true });
copyProject(root, stageDir);
fs.cpSync(latestDir, path.join(stageDir, "_ai_review"), { recursive: true });

const zipPath = path.join(reviewRoot, `deepseekgame-review-${timestamp}.zip`);
fs.rmSync(zipPath, { force: true });

function psQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

if (process.platform === "win32") {
  const zipCommand = [
    "if (Test-Path", psQuote(zipPath), ") { Remove-Item", psQuote(zipPath), "-Force } ;",
    "Compress-Archive -Path", psQuote(path.join(stageDir, "*")),
    "-DestinationPath", psQuote(zipPath),
    "-Force",
  ].join(" ");

  const zipResult = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    zipCommand,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (zipResult.status !== 0) {
    console.error(zipResult.stdout);
    console.error(zipResult.stderr);
    process.exit(zipResult.status || 1);
  }
} else {
  const tarPath = zipPath.replace(/\.zip$/, ".tar.gz");
  const tarResult = spawnSync("tar", ["-czf", tarPath, "-C", stageDir, "."], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (tarResult.status !== 0) {
    console.error(tarResult.stdout);
    console.error(tarResult.stderr);
    process.exit(tarResult.status || 1);
  }
}

fs.rmSync(stageDir, { recursive: true, force: true });

console.log("");
console.log("AI review pack generated:");
console.log(zipPath);
console.log("");
console.log("Upload this zip to ChatGPT for review.");
console.log("");

if (failedCommands.length > 0) {
  console.log("Some commands failed. That is OK for review, but the failures are included in the pack:");
  for (const item of failedCommands) {
    console.log(`- ${item.command}`);
  }
}