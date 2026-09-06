// Disala service worker — installable + basic offline fallback only.
//
// This deliberately does NOT cache or serve stale versions of any page or
// API response: almost everything in this app is Clerk-auth-gated live data
// (Gmail, Calendar, Postgres), so the only safe things to precache are
// public, non-user-specific static assets plus a static offline page. Every
// other request passes straight through to the network untouched.

const CACHE_NAME = "disala-shell-v1"
const OFFLINE_URL = "/offline"
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return

  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()))
  )
})
