/* Offline support: app shell is network-first (so updates land), map/elevation tiles are cache-first. */
const APP_CACHE = "wma-scout-app-v1";
const TILE_CACHE = "wma-scout-tiles-v1";
const APP_FILES = ["./", "index.html", "styles.css", "manifest.webmanifest", "js/core.js", "js/astro.js", "js/terrain.js", "js/analysis.js", "js/io.js", "js/app.js",
  "vendor/leaflet.js", "vendor/leaflet.css", "vendor/togeojson.umd.js", "vendor/jszip.min.js"];
const TILE_HOSTS = ["server.arcgisonline.com", "basemap.nationalmap.gov", "tile.opentopomap.org", "s3.amazonaws.com"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    e.respondWith(caches.open(TILE_CACHE).then(async (c) => {
      const hit = await c.match(e.request, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === "opaque") c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(APP_CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
