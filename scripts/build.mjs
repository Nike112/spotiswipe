import { mkdir, copyFile, cp, rm, readFile } from "node:fs/promises";
import { CATALOG } from "../src/catalog.js";
const root = new URL("../", import.meta.url),
  dist = new URL("dist/", root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const name of [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "sw.js",
  ".nojekyll",
])
  await copyFile(new URL(name, root), new URL(name, dist));
for (const name of ["src", "assets"])
  await cp(new URL(name, root), new URL(name, dist), { recursive: true });
for (const track of CATALOG) {
  const bytes = await readFile(new URL(track.previewUrl, dist));
  if (bytes.length < 1000) throw Error(`Preview missing: ${track.id}`);
}
console.log(
  `Static build ready in dist/ · ${CATALOG.length} bundled previews · no runtime dependencies`,
);
