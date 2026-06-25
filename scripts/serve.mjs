import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";

const root = resolve(".");
const requestedPort = Number(process.argv[2] ?? 5173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
};

function fileFor(url) {
  const rawPath = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const cleanPath = normalize(rawPath).replace(/^([/\\])+/, "").replace(/\\/g, "/");
  if (cleanPath.startsWith("assets/")) {
    const publicAssetTarget = resolve(join(root, "public", cleanPath));
    if (publicAssetTarget.startsWith(root) && existsSync(publicAssetTarget) && statSync(publicAssetTarget).isFile()) {
      return publicAssetTarget;
    }
  }
  const target = resolve(join(root, cleanPath || "index.html"));

  if (!target.startsWith(root)) {
    return null;
  }

  if (existsSync(target) && statSync(target).isFile()) {
    return target;
  }

  return resolve(join(root, "index.html"));
}

const server = createServer((req, res) => {
  const file = fileFor(req.url ?? "/");

  if (!file || !existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": mime[extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
});

server.listen(requestedPort, "127.0.0.1", () => {
  console.log(`玄箓行已启动：http://127.0.0.1:${requestedPort}`);
});
