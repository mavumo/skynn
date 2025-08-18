// sw.js — SKINLABS
const VERSION = "v3.0.0";
const STATIC_CACHE = `sklabs-static-${VERSION}`;
const RUNTIME_CACHE = `sklabs-runtime-${VERSION}`;

const PRECACHE_URLS = [
  "/",                // HTML shell
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png"
];

// --- Install: pre-cache critical assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// --- Activate: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => {
        if (k !== STATIC_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

// --- Fetch: offline-friendly strategies
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only GET
  if (request.method !== "GET") return;

  // 1) HTML navigations -> Network first; fallback to cache; then offline page
  const isHTML = request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
  if (isHTML) {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return resp;
        })
        .catch(() =>
          caches.match(request).then((r) => r || caches.match("/offline.html"))
        )
    );
    return;
  }

  // 2) Same-origin static (css/js/json) -> Stale-while-revalidate
  if (url.origin === location.origin && /\.(?:css|js|json|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((resp) => {
            const copy = resp.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return resp;
          })
          .catch(() => cached || Promise.reject());
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3) Images -> Cache-first with fallback to network
  if (/\.(?:png|jpg|jpeg|webp|gif|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((resp) => {
            const copy = resp.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return resp;
          })
          .catch(() => caches.match("/icons/icon-192.png"));
      })
    );
    return;
  }

  // 4) Default: try network, fall back to cache
  event.respondWith(
    fetch(request)
      .then((resp) => {
        // Cache only same-origin GET responses
        if (url.origin === location.origin && resp.ok) {
          const copy = resp.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return resp;
      })
      .catch(() => caches.match(request))
  );
});

// --- Web Push
self.addEventListener("push", (event) => {
  let data = { title: "SKINLABS", body: "New skincare picks are live.", url: "/" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
