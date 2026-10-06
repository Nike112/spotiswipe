import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../scripts/serve.mjs";
test("static server serves modules and audio ranges, rejects traversal and non-GET writes", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Spotiswipe/);
    const module = await fetch(base + "/src/worker.js");
    assert.match(module.headers.get("content-type"), /javascript/);
    const audio = await fetch(base + "/assets/previews/moil.mp3", {
      headers: { Range: "bytes=0-99" },
    });
    assert.equal(audio.status, 206);
    assert.equal((await audio.arrayBuffer()).byteLength, 100);
    assert.match(audio.headers.get("content-type"), /audio\/mpeg/);
    const bad = await fetch(base + "/assets/previews/moil.mp3", {
      headers: { Range: "bytes=999999999-" },
    });
    assert.equal(bad.status, 416);
    assert.equal((await fetch(base + "/.git/config")).status, 403);
    assert.equal((await fetch(base, { method: "POST" })).status, 405);
    assert.equal((await fetch(base + "/missing")).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
