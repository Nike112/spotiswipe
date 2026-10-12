import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
const types = {
  ".ttf": "font/ttf",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/csv",
};
export function createServer(directory = process.cwd()) {
  const root = resolve(directory);
  return http.createServer(async (req, res) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }
    try {
      const url = new URL(req.url, "http://localhost"),
        pathname = decodeURIComponent(url.pathname);
      let path = resolve(root, "." + pathname);
      if (
        (path !== root && !path.startsWith(root + sep)) ||
        path.split(sep).some((part) => part.startsWith("."))
      ) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      const info = await stat(path);
      if (info.isDirectory()) path = resolve(path, "index.html");
      const bytes = await readFile(path),
        headers = {
          "Content-Type": types[extname(path)] || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-cache",
          "Accept-Ranges": "bytes",
        };
      if (req.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!match) {
          res.writeHead(416, { "Content-Range": `bytes */${bytes.length}` });
          return res.end();
        }
        const start = Number(match[1]),
          end = match[2]
            ? Math.min(Number(match[2]), bytes.length - 1)
            : bytes.length - 1;
        if (start > end || start >= bytes.length) {
          res.writeHead(416, { "Content-Range": `bytes */${bytes.length}` });
          return res.end();
        }
        res.writeHead(206, {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
          "Content-Length": end - start + 1,
        });
        return res.end(
          req.method === "HEAD" ? undefined : bytes.subarray(start, end + 1),
        );
      }
      res.writeHead(200, { ...headers, "Content-Length": bytes.length });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, "127.0.0.1", () =>
    console.log(`Spotiswipe: http://127.0.0.1:${port}`),
  );
}
