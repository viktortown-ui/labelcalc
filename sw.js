const CACHE_NAME = "labelcalc-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/css/style.css",
  "./assets/js/app.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Кешируем только GET http/https (иначе ловим "chrome-extension://" и похожее).
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Предпочитаем кеш (cache-first), но кладём в кеш только "нормальные" ответы.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const shouldCache = res && res.ok && (res.type === "basic" || res.type === "cors");
          if (shouldCache) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => {
              // cache.put может упасть на экзотических запросах — защищаемся.
              try {
                cache.put(req, copy);
              } catch {
                // ignore
              }
            });
          }
          return res;
        })
        .catch(() => cached || Promise.reject());
    })
  );
});
