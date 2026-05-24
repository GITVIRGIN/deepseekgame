import { gameVersion } from "./version.js";

const CLOUD_CONFIG_KEY = "xuanlu-cloud-config";
const GIST_DESCRIPTION = "xuanlu-cloud-save";
const SAVE_FILE = "xuanlu-cloud-save.json";

export function loadCloudConfig() {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveCloudConfig(config) {
  const current = loadCloudConfig();
  const next = {
    ...current,
    ...config,
    playerId: normalizePlayerId(config.playerId ?? current.playerId),
  };

  if (!next.token) {
    delete next.token;
  }

  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(next));
  return next;
}

export function clearCloudConfig() {
  localStorage.removeItem(CLOUD_CONFIG_KEY);
}

export async function connectCloud(config) {
  const token = config.token?.trim();
  if (!token) throw new Error("需要 GitHub Token");

  const user = await githubRequest(token, "/user");
  return saveCloudConfig({
    ...config,
    token,
    userLogin: user.login,
    playerId: normalizePlayerId(config.playerId || user.login),
  });
}

export async function uploadCloudSave(state, config = loadCloudConfig()) {
  const ready = readyConfig(config);
  const gist = await resolveSaveGist(ready);
  const document = await readSaveDocument(ready.token, gist.id);
  const playerId = ready.playerId;
  document.saves[playerId] = {
    updatedAt: new Date().toISOString(),
    appVersion: gameVersion.label,
    state,
  };

  await githubRequest(ready.token, `/gists/${gist.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      files: {
        [SAVE_FILE]: {
          content: JSON.stringify(document, null, 2),
        },
      },
    }),
  });

  saveCloudConfig({ ...ready, gistId: gist.id });
  return document.saves[playerId];
}

export async function downloadCloudSave(config = loadCloudConfig()) {
  const ready = readyConfig(config);
  const gist = await resolveSaveGist(ready);
  const document = await readSaveDocument(ready.token, gist.id);
  saveCloudConfig({ ...ready, gistId: gist.id });
  return document.saves[ready.playerId]?.state ?? null;
}

function readyConfig(config) {
  const token = config.token?.trim();
  const playerId = normalizePlayerId(config.playerId);
  if (!token) throw new Error("需要 GitHub Token");
  if (!playerId) throw new Error("需要玩家ID");
  return { ...config, token, playerId };
}

async function resolveSaveGist(config) {
  if (config.gistId) {
    try {
      return await githubRequest(config.token, `/gists/${config.gistId}`);
    } catch {
      saveCloudConfig({ ...config, gistId: "" });
    }
  }

  const gists = await githubRequest(config.token, "/gists?per_page=100");
  const existing = gists.find((gist) => gist.description === GIST_DESCRIPTION && gist.files?.[SAVE_FILE]);
  if (existing) return existing;

  return githubRequest(config.token, "/gists", {
    method: "POST",
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        [SAVE_FILE]: {
          content: JSON.stringify(createSaveDocument(), null, 2),
        },
      },
    }),
  });
}

async function readSaveDocument(token, gistId) {
  const gist = await githubRequest(token, `/gists/${gistId}`);
  const file = gist.files?.[SAVE_FILE];
  if (!file?.content) return createSaveDocument();

  try {
    return normalizeSaveDocument(JSON.parse(file.content));
  } catch {
    return createSaveDocument();
  }
}

function createSaveDocument() {
  return {
    schema: 1,
    updatedAt: new Date().toISOString(),
    saves: {},
  };
}

function normalizeSaveDocument(document) {
  return {
    schema: document.schema ?? 1,
    updatedAt: document.updatedAt ?? new Date().toISOString(),
    saves: document.saves ?? {},
  };
}

async function githubRequest(token, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: options.body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(readGithubError(text) || `GitHub 请求失败：${response.status}`);
  }

  return response.json();
}

function readGithubError(text) {
  try {
    return JSON.parse(text).message;
  } catch {
    return text;
  }
}

function normalizePlayerId(value = "") {
  return String(value)
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]/g, "-")
    .slice(0, 48);
}
