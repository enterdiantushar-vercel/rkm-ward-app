const CACHE_NAME = "rkm-app-v4";
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

// Install: save all app files to the phone
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

// Activate: remove old versions of the cache
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Fetch: serve app pages from cache first (fast), then update in background
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // leave Supabase / CDN alone

  const isAppAsset = FILES_TO_CACHE.some((file) => {
    const name = file.replace("./", "");
    return url.pathname.endsWith("/" + name) || url.pathname.endsWith(name);
  }) || url.pathname === "/" || url.pathname.endsWith("/");

  if (!isAppAsset) return; // data requests go to network normally

  // Cache-first for app shell → opens fast even on slow internet
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached); // if offline / very slow, use cache

      // Return cached version immediately if we have it
      return cached || networkFetch;
    })
  );
});
