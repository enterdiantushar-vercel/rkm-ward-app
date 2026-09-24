const CACHE_NAME = "rkm-app-v3";
const FILES_TO_CACHE = [
  "./index.html",
  "./patient.html",
  "./enhancement.html",
  "./ward-list.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png",
  "./icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const file of FILES_TO_CACHE) {
      try {
        await cache.add(file);
      } catch (err) {
        console.warn("[RKM SW] skip cache", file, err);
      }
    }
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isAppAsset = FILES_TO_CACHE.some((file) => {
    const name = file.replace("./", "");
    return url.pathname.endsWith("/" + name) || url.pathname.endsWith(name);
  });
  if (!isAppAsset) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
