const CACHE = "mxc-guest-v17";
const VERSION = "20260701-guest-portal-upgrade";
const PUBLIC_ASSETS = ["/", "/index.html", `/style.css?v=${VERSION}`, `/style-core.css?v=${VERSION}`, `/guest-layout.css?v=${VERSION}`, `/responsive.css?v=${VERSION}`, `/brand.css?v=${VERSION}`, `/brand-hero.css?v=${VERSION}`, `/wedding-chat.css?v=${VERSION}`, `/guest.js?v=${VERSION}`, "/assets/invitation-picture.jpg", "/assets/mxc-spain-2026.ics", "/assets/mxc-south-africa-2026.ics", "/manifest.webmanifest", "/icon.svg"];

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
  if (url.origin !== self.location.origin || privatePath) return;
  // Version-tagged requests are handled only when precached, so the offline
  // shell keeps its styles and scripts without caching arbitrary query URLs.
  const precached = PUBLIC_ASSETS.includes(`${url.pathname}${url.search}`);
  if (url.search && !precached) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html"))));
});
