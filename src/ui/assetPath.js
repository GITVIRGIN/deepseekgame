// Resolve public asset URLs for both local root hosting and GitHub Pages project hosting.
export function appBasePath() {
  const explicit = globalThis.__DSG_BASE_PATH__;
  if (typeof explicit === "string" && explicit.trim()) {
    return withTrailingSlash(explicit.trim());
  }

  const viteBase = import.meta?.env?.BASE_URL;
  if (typeof viteBase === "string" && viteBase && viteBase !== "/") {
    return withTrailingSlash(viteBase);
  }

  const pathname = globalThis.location?.pathname || "/";
  if (pathname === "/deepseekgame" || pathname.startsWith("/deepseekgame/")) {
    return "/deepseekgame/";
  }
  return "/";
}

export function assetUrl(rawPath) {
  if (!rawPath || typeof rawPath !== "string") return rawPath;
  if (/^(?:[a-z][a-z\d+.-]*:|data:|blob:|#)/i.test(rawPath)) return rawPath;
  if (rawPath.startsWith("./") || rawPath.startsWith("../")) return rawPath;

  const normalized = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
  if (normalized.startsWith("assets/") || normalized.startsWith("public/assets/")) {
    return `${appBasePath()}${normalized}`;
  }
  return rawPath;
}

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
