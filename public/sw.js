const CACHE_NAME = "maquinaria-v1";
const ASSETS = ["/", "/logo.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests with http/https protocol
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Skip: Next.js build artifacts (already cache-busted), API, Supabase
  if (url.pathname.startsWith("/_next/") ||
      url.pathname.startsWith("/api") ||
      url.host.includes("supabase")) return;

  // Skip: development mode (localhost) — turbopack HMR manages its own caching
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
