const CACHE = "mxc-guest-v6";
const PUBLIC_ASSETS = ["/", "/index.html", "/style.css?v=20260630-accommodation", "/style-core.css?v=20260628-hero-cue", "/guest-layout.css?v=20260630-accommodation", "/responsive.css?v=20260630-accommodation-layout", "/brand.css", "/brand-hero.css", "/wedding-chat.css", "/guest.js?v=20260630-archive-checkin", "/guest-children-note.js", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const privatePath = url.pathname.includes("planner") || url.pathname.includes("rsvp") || url.pathname.includes("check-in") || url.pathname.endsWith("config.js");
  if (url.origin !== self.location.origin || privatePath || url.search) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html"))));
});
