const CACHE = "spotiswipe-v3.1.0";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "assets/icon.svg",
  "src/app.js",
  "src/visuals.js",
  "assets/fonts/manrope-600.ttf",
  "assets/fonts/manrope-400.ttf",
  "assets/fonts/manrope-800.ttf",
  "assets/covers/space-graveyard-ambient-track.svg",
  "assets/covers/subspace.svg",
  "assets/covers/into-the-caves.svg",
  "assets/covers/bossfight-1.svg",
  "assets/covers/gone-rock.svg",
  "assets/covers/a-flawless-getaway.svg",
  "assets/covers/electric-rock.svg",
  "assets/covers/flashy-popjazz.svg",
  "assets/covers/electronic-jazz-chromatic.svg",
  "assets/covers/signal-pursuit.svg",
  "assets/covers/moil.svg",
  "assets/covers/dream-2-ambience.svg",
  "assets/covers/blackout.svg",
  "assets/covers/done-rock-and-jazz.svg",
  "assets/covers/shop-theme.svg",
  "assets/covers/empty-stretch.svg",

  "src/data.js",
  "src/catalog.js",
  "src/engine.js",
  "src/service.js",
  "src/storage.js",
  "src/player.js",
  "src/worker.js",
  "assets/previews/electronic-jazz-chromatic.mp3",
  "assets/previews/subspace.mp3",
  "assets/previews/signal-pursuit.mp3",
  "assets/previews/a-flawless-getaway.mp3",
  "assets/previews/moil.mp3",
  "assets/previews/empty-stretch.mp3",
  "assets/previews/flashy-popjazz.mp3",
  "assets/previews/shop-theme.mp3",
  "assets/previews/electric-rock.mp3",
  "assets/previews/done-rock-and-jazz.mp3",
  "assets/previews/gone-rock.mp3",
  "assets/previews/bossfight-1.mp3",
  "assets/previews/blackout.mp3",
  "assets/previews/dream-2-ambience.mp3",
  "assets/previews/space-graveyard-ambient-track.mp3",
  "assets/previews/into-the-caves.mp3",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("spotiswipe-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (url.pathname.endsWith(".mp3")) {
        const cached = await cache.match(url.href);
        if (cached) {
          const range = request.headers.get("range");
          if (range) {
            const data = await cached.arrayBuffer();
            const match = /^bytes=(\d+)-(\d*)$/.exec(range);
            if (!match)
              return new Response(null, {
                status: 416,
                headers: { "Content-Range": "bytes */" + data.byteLength },
              });
            const start = Number(match[1]),
              end = match[2]
                ? Math.min(Number(match[2]), data.byteLength - 1)
                : data.byteLength - 1;
            if (start > end || start >= data.byteLength)
              return new Response(null, {
                status: 416,
                headers: { "Content-Range": "bytes */" + data.byteLength },
              });
            return new Response(data.slice(start, end + 1), {
              status: 206,
              headers: {
                "Content-Type": "audio/mpeg",
                "Content-Range":
                  "bytes " + start + "-" + end + "/" + data.byteLength,
                "Content-Length": String(end - start + 1),
                "Accept-Ranges": "bytes",
              },
            });
          }
          return cached;
        }
      }
      try {
        const response = await fetch(request);
        if (response.ok && response.status === 200)
          cache.put(request, response.clone());
        return response;
      } catch {
        return (
          (await cache.match(request)) ||
          (request.mode === "navigate"
            ? await cache.match("index.html")
            : null) ||
          new Response("Unavailable offline", { status: 503 })
        );
      }
    })(),
  );
});
